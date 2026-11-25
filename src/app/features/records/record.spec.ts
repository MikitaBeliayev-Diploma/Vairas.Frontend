import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RecordPage } from './record';
import { LearningApi } from '../../domain/api/learning-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { PracticalRecord } from '../../domain/models/learning-models';
const record: PracticalRecord = {
  recordId: 'record',
  enrollmentId: 'e',
  revision: 3,
  factVersion: 2,
  status: 'Pending',
  facts: {
    schoolId: 'school',
    enrollmentId: 'e',
    lessonId: 'lesson',
    programVersionId: 'programme',
    sourceSnapshotId: 'old',
    trainingMinutes: 45,
    distanceKm: 10,
    topicIds: ['topic'],
  },
  responses: [],
};
function setup() {
  const api = {
    record: vi.fn().mockResolvedValue(record),
    confirm: vi.fn().mockResolvedValue(undefined),
    dispute: vi.fn().mockResolvedValue(undefined),
    source: vi.fn().mockResolvedValue({ sourceSnapshotId: 'fresh' }),
    revise: vi.fn().mockResolvedValue(undefined),
  };
  const feedback = { done: vi.fn() };
  TestBed.configureTestingModule({
    imports: [RecordPage],
    providers: [
      { provide: LearningApi, useValue: api },
      { provide: SessionStore, useValue: {} },
      { provide: Feedback, useValue: feedback },
    ],
  });
  TestBed.overrideComponent(RecordPage, { set: { template: '' } });
  const fixture = TestBed.createComponent(RecordPage);
  fixture.componentRef.setInput('recordId', 'record');
  return { page: fixture.componentInstance, api, feedback };
}
describe('Practical record page', () => {
  it('confirms and disputes the exact current facts and reloads from the server', async () => {
    const { page, api } = setup();
    await page.load();
    await page.confirm();
    expect(api.confirm).toHaveBeenCalledWith(record);
    await page.dispute('Incorrect distance');
    expect(api.dispute).toHaveBeenCalledWith(record, 'Incorrect distance');
    expect(api.record).toHaveBeenCalledTimes(3);
  });
  it('requires a correction reason and submits a new authoritative source snapshot', async () => {
    const { page, api, feedback } = setup();
    await page.load();
    page.edit();
    expect(page.form.value.trainingMinutes).toBe(45);
    await page.revise();
    expect(api.revise).not.toHaveBeenCalled();
    page.form.patchValue({ reason: 'Corrected duration', trainingMinutes: 50 });
    await page.revise();
    expect(api.revise).toHaveBeenCalledWith(record, {
      ...record.facts,
      sourceSnapshotId: 'fresh',
      trainingMinutes: 50,
      correctionReason: 'Corrected duration',
    });
    expect(page.editing()).toBe(false);
    expect(feedback.done).toHaveBeenCalledWith(expect.stringContaining('Previous confirmations'));
  });
  it('does not report success for a failed operation and allows retry', async () => {
    const { page, api, feedback } = setup();
    await page.load();
    api.confirm.mockRejectedValueOnce(new Error('Conflict'));
    await page.confirm();
    expect(page.error()).toContain('could not be completed');
    expect(feedback.done).not.toHaveBeenCalled();
    expect(page.busy()).toBe(false);
    await page.confirm();
    expect(feedback.done).toHaveBeenCalled();
  });
  it('ignores obsolete loads and surfaces current read errors', async () => {
    const { page, api } = setup();
    let resolve!: (v: PracticalRecord) => void;
    api.record.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = page.load('old');
    api.record.mockResolvedValueOnce({ ...record, revision: 4 });
    await page.load('new');
    resolve(record);
    await pending;
    expect(page.record()?.revision).toBe(4);
    api.record.mockRejectedValueOnce(new Error('Missing'));
    await page.load('new');
    expect(page.failed()).toBe(true);
    expect(page.record()).toBeNull();
  });
});
