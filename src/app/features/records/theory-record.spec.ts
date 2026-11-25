import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { TheoryRecordPage } from './theory-record';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { LearningApi } from '../../domain/api/learning-api';
import { Feedback } from '../../core/feedback';
import { TheoryRecord, LessonSource } from '../../domain/models/learning-models';
const record: TheoryRecord = {
  recordId: 'record',
  revision: 1,
  factVersion: 1,
  status: 'Pending',
  confirmedBy: null,
  confirmedAt: null,
  facts: {
    schoolId: 'school',
    lessonId: 'lesson',
    sourceSnapshotId: 'old',
    trainingMinutes: 45,
    attendanceRows: [
      { enrollmentId: 'e', studentId: 'student', attendance: 'Present' },
      { enrollmentId: 'absent', studentId: 'other', attendance: 'Absent' },
    ],
  },
};
const source: LessonSource = {
  sourceSnapshotId: 'fresh',
  lessonId: 'lesson',
  lessonRevision: 2,
  freshness: 'Current',
  physicallyCompleted: true,
  actualStart: '2026-01-01T10:00:00Z',
  actualEnd: '2026-01-01T11:00:00Z',
};
const revised: TheoryRecord = { ...record, revision: 2, factVersion: 2 };
const confirmed: TheoryRecord = {
  ...record,
  status: 'Confirmed',
  confirmedBy: 'teacher',
  confirmedAt: '2026-01-01T11:00:00Z',
  sourceCurrent: true,
};
function setup(render = false) {
  const api = {
    theoryRecord: vi.fn().mockResolvedValue(record),
    source: vi.fn().mockResolvedValue(source),
    theoryRoster: vi
      .fn()
      .mockResolvedValue({ schoolId: 'school', participants: record.facts.attendanceRows }),
    reviseTheoryRecord: vi.fn().mockResolvedValue(revised),
    confirmTheoryRecord: vi.fn().mockResolvedValue(confirmed),
  };
  const instructor = signal(true);
  const feedback = { done: vi.fn(), fail: vi.fn() };
  TestBed.configureTestingModule({
    imports: [TheoryRecordPage],
    providers: [
      provideRouter([]),
      { provide: LearningApi, useValue: api },
      {
        provide: SessionStore,
        useValue: {
          has: () => instructor(),
          enrollments: signal([{ enrollmentId: 'e', name: 'Learner Name' }]),
        },
      },
      {
        provide: WorkspaceStore,
        useValue: { lessons: signal([{ lessonId: 'lesson' }]), load: vi.fn() },
      },
      { provide: Feedback, useValue: feedback },
    ],
  });
  if (!render) TestBed.overrideComponent(TheoryRecordPage, { set: { template: '' } });
  const fixture = TestBed.createComponent(TheoryRecordPage);
  fixture.componentRef.setInput('recordId', 'record');
  return { fixture, page: fixture.componentInstance, api, instructor, feedback };
}
describe('Historical theory record workflow', () => {
  it('displays historical participants and only shows credited minutes after confirmation', async () => {
    const { page, fixture } = setup(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(page.rows().map((r) => r.name)).toEqual(['Learner Name', 'Learner other']);
    expect(page.presentCount()).toBe(1);
    expect(page.lesson()?.lessonId).toBe('lesson');
    const credits = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('tbody tr td:last-child') as NodeListOf<HTMLElement>,
      ).map((cell) => cell.textContent?.trim());
    expect(credits()).toEqual(['0', '0']);
    await page.confirm();
    fixture.detectChanges();
    expect(credits()).toEqual(['45', '0']);
    expect(page.canConfirm()).toBe(false);
  });
  it('does not allow an unauthorized actor to correct or confirm', async () => {
    const { page, api, instructor } = setup();
    await page.load();
    instructor.set(false);
    await page.startCorrection();
    await page.confirm();
    expect(api.source).not.toHaveBeenCalled();
    expect(api.confirmTheoryRecord).not.toHaveBeenCalled();
  });
  it('uses the historical roster and requires a nonblank correction reason', async () => {
    const { page, api } = setup();
    await page.load();
    await page.startCorrection();
    expect(page.correction()?.minutes).toBe(60);
    expect(page.correction()?.roster).toHaveLength(2);
    const submission = page.correction()!.initial;
    page.correctionReason.setValue('   ');
    await page.revise(submission);
    expect(api.reviseTheoryRecord).not.toHaveBeenCalled();
    page.correctionReason.setValue(' Correct attendance ');
    await page.revise(submission);
    expect(api.reviseTheoryRecord).toHaveBeenCalledWith(
      record,
      expect.objectContaining({
        schoolId: 'school',
        sourceSnapshotId: 'fresh',
        correctionReason: 'Correct attendance',
        attendanceRows: submission.attendanceRows,
      }),
      expect.any(String),
    );
    expect(page.record()?.revision).toBe(2);
    expect(page.correction()).toBeNull();
  });
  it('rejects correction when the source or historical school is invalid', async () => {
    const { page, api } = setup();
    await page.load();
    api.source.mockResolvedValueOnce({ ...source, physicallyCompleted: false });
    await page.startCorrection();
    expect(page.correction()).toBeNull();
    expect(page.error()).toContain('not available');
    api.theoryRoster.mockResolvedValueOnce({
      schoolId: 'different',
      participants: record.facts.attendanceRows,
    });
    await page.startCorrection();
    expect(page.correction()).toBeNull();
  });
  it('retains the exact correction identity after an unknown outcome', async () => {
    const { page, api } = setup();
    await page.load();
    await page.startCorrection();
    page.correctionReason.setValue('Correction');
    const submission = page.correction()!.initial;
    api.reviseTheoryRecord.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    await page.revise(submission);
    expect(page.error()).toContain('not confirmed');
    await page.revise(submission);
    expect(api.reviseTheoryRecord.mock.calls[0]).toEqual(api.reviseTheoryRecord.mock.calls[1]);
  });
  it('retries confirmation with the same key and reloads conflicts', async () => {
    const { page, api } = setup();
    await page.load();
    api.confirmTheoryRecord
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }))
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    await page.confirm();
    expect(page.error()).toContain('unknown');
    await page.confirm();
    expect(api.confirmTheoryRecord.mock.calls[0]).toEqual(api.confirmTheoryRecord.mock.calls[1]);
    expect(api.theoryRecord).toHaveBeenCalledTimes(2);
    expect(page.error()).toContain('reloaded');
  });
  it('ignores late read responses and exposes a failed current read', async () => {
    const { page, api } = setup();
    let resolve!: (r: TheoryRecord) => void;
    api.theoryRecord.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const first = page.load('old');
    api.theoryRecord.mockResolvedValueOnce(revised);
    await page.load('new');
    resolve(record);
    await first;
    expect(page.record()?.revision).toBe(2);
    api.theoryRecord.mockRejectedValueOnce(new Error('Unavailable'));
    await page.load('new');
    expect(page.failed()).toBe(true);
    expect(page.record()).toBeNull();
    expect(page.loading()).toBe(false);
  });
});
