import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { TrainingPage } from './training';
import { LearningApi } from '../../domain/api/learning-api';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { Feedback } from '../../core/feedback';
import { Readiness } from '../../domain/models/learning-models';
import { Lesson } from '../../domain/models/scheduling-models';
import { AssessmentDefinition } from '../../domain/models/programme-models';

function setup() {
  const lesson: Lesson = {
    lessonId: 'lesson',
    enrollmentId: 'enrollment',
    status: 'Completed',
    version: 2,
    kind: 'Practical',
    startsAt: '2026-01-01T10:00:00Z',
    endsAt: '2026-01-01T11:00:00Z',
  };
  const feedback = { done: vi.fn(), fail: vi.fn() };
  const api = {
    progress: vi.fn().mockResolvedValue({ enrollmentId: 'enrollment', practicalMinutes: 45 }),
    records: vi.fn().mockResolvedValue([]),
    assessmentDefinitions: vi.fn().mockResolvedValue([]),
    source: vi.fn().mockResolvedValue({ sourceSnapshotId: 'snapshot' }),
    create: vi.fn().mockResolvedValue(undefined),
    decide: vi.fn().mockResolvedValue({ decision: 'Approved' }),
    readiness: vi.fn().mockResolvedValue(null),
    evaluate: vi.fn().mockResolvedValue({ assessmentDefinitionVersionId: 'practical-final' }),
  };
  TestBed.configureTestingModule({
    imports: [TrainingPage],
    providers: [
      { provide: LearningApi, useValue: api },
      { provide: Feedback, useValue: feedback },
      {
        provide: SessionStore,
        useValue: {
          session: signal({ schoolId: 'school' }),
          enrollments: signal([
            { enrollmentId: 'enrollment', schoolId: 'school', programVersionId: 'programme' },
          ]),
          catalog: signal(null),
        },
      },
      {
        provide: WorkspaceStore,
        useValue: {
          lessons: signal([
            lesson,
            { ...lesson, lessonId: 'other', enrollmentId: 'other' },
            { ...lesson, lessonId: 'theory', kind: 'Theory' },
            { ...lesson, lessonId: 'scheduled', status: 'Scheduled' },
          ]),
          load: vi.fn(),
        },
      },
    ],
  });
  TestBed.overrideComponent(TrainingPage, { set: { template: '' } });
  const fixture = TestBed.createComponent(TrainingPage);
  fixture.componentRef.setInput('enrollmentId', 'enrollment');
  const page = fixture.componentInstance;
  page.assessmentDefinitions.set([
    { definitionVersionId: 'theory-final', name: 'Theory', stage: 'Final', trainingKind: 'Theory' },
    {
      definitionVersionId: 'practical-final',
      name: 'Practical',
      stage: 'Final',
      trainingKind: 'Practical',
    },
    { definitionVersionId: 'midterm', name: 'Midterm', stage: 'Midterm', trainingKind: 'Theory' },
  ] as AssessmentDefinition[]);
  return { page, api, feedback };
}
function selection(value: string) {
  return { target: { value } } as unknown as Event;
}

describe('Explicit assessment readiness selection', () => {
  it('does not pick the first final assessment and evaluates only the selected definition', async () => {
    const { page, api } = setup();
    await page.evaluate();
    expect(api.evaluate).not.toHaveBeenCalled();
    await page.selectAssessment(selection('practical-final'));
    expect(api.readiness).toHaveBeenCalledWith('enrollment', 'practical-final');
    await page.evaluate();
    expect(api.evaluate).toHaveBeenCalledWith('enrollment', 'practical-final');
    await page.selectAssessment(selection('midterm'));
    expect(page.readiness()).toBeNull();
    await page.evaluate();
    expect(api.evaluate).toHaveBeenCalledTimes(1);
  });
});

const readiness: Readiness = {
  enrollmentId: 'enrollment',
  evaluationId: 'evaluation',
  prerequisitesSatisfied: true,
  outstandingRequirements: [],
  decision: 'Pending',
  revision: 3,
  assessmentDefinitionVersionId: 'practical-final',
};
describe('Training progress and practical record workflow', () => {
  it('loads authoritative progress and exposes only completed unrecorded practical lessons of this enrollment', async () => {
    const { page, api } = setup();
    await page.load();
    expect(api.progress).toHaveBeenCalledWith('enrollment');
    expect(page.progress()?.practicalMinutes).toBe(45);
    expect(page.availableLessons().map((l) => l.lessonId)).toEqual(['lesson']);
    api.records.mockRejectedValueOnce(new Error('Unavailable'));
    await page.load();
    expect(page.failed()).toBe(true);
    expect(page.loading()).toBe(false);
  });
  it('creates a factual record using the current lesson snapshot and programme', async () => {
    const { page, api, feedback } = setup();
    page.dialog.set(true);
    page.form.patchValue({
      lessonId: 'lesson',
      topicId: 'topic',
      trainingMinutes: 45,
      distanceKm: 10,
    });
    await page.create();
    expect(api.source).toHaveBeenCalledWith('lesson');
    expect(api.create).toHaveBeenCalledWith({
      schoolId: 'school',
      enrollmentId: 'enrollment',
      lessonId: 'lesson',
      programVersionId: 'programme',
      sourceSnapshotId: 'snapshot',
      trainingMinutes: 45,
      distanceKm: 10,
      topicIds: ['topic'],
    });
    expect(page.dialog()).toBe(false);
    expect(feedback.done).toHaveBeenCalled();
  });
  it('rejects lessons outside the applicable enrollment and invalid manual topics', async () => {
    const { page, api } = setup();
    page.form.patchValue({ lessonId: 'other', topicId: 'topic' });
    await page.create();
    expect(page.formError()).toContain('completed lesson');
    page.form.patchValue({ lessonId: 'lesson', topicId: '__manual', manualTopicId: 'invalid' });
    await page.create();
    expect(page.formError()).toContain('valid topic');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('requires a current exact assessment version and an explicit reason for a readiness decision', async () => {
    const { page, api, feedback } = setup();
    await page.selectAssessment(selection('practical-final'));
    page.readiness.set(readiness);
    await page.decide('Approved');
    expect(api.decide).not.toHaveBeenCalled();
    page.decisionForm.controls.reason.setValue('Verified prerequisites');
    page.readiness.set({ ...readiness, invalidated: true });
    await page.decide('Approved');
    expect(api.decide).not.toHaveBeenCalled();
    page.readiness.set({ ...readiness, revision: undefined });
    await page.decide('Approved');
    expect(feedback.fail).toHaveBeenCalled();
    page.readiness.set(readiness);
    await page.decide('Approved');
    expect(api.decide).toHaveBeenCalledWith(readiness, 3, 'Approved', 'Verified prerequisites');
    expect(page.readiness()?.decision).toBe('Approved');
  });
  it('reloads readiness after a rejected decision instead of reporting success', async () => {
    const { page, api, feedback } = setup();
    await page.selectAssessment(selection('practical-final'));
    page.readiness.set(readiness);
    page.decisionForm.controls.reason.setValue('Verified');
    api.decide.mockRejectedValueOnce(new Error('Conflict'));
    api.readiness.mockResolvedValueOnce({ ...readiness, revision: 4, invalidated: true });
    await page.decide('Approved');
    expect(page.readiness()?.revision).toBe(4);
    expect(page.readiness()?.invalidated).toBe(true);
    expect(feedback.done).not.toHaveBeenCalled();
  });
  it('ignores a delayed readiness response after changing the assessment', async () => {
    const { page, api } = setup();
    let resolve!: (value: Readiness) => void;
    api.readiness.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = page.selectAssessment(selection('practical-final'));
    api.readiness.mockResolvedValueOnce({
      ...readiness,
      assessmentDefinitionVersionId: 'theory-final',
    });
    await page.selectAssessment(selection('theory-final'));
    resolve(readiness);
    await pending;
    expect(page.readiness()?.assessmentDefinitionVersionId).toBe('theory-final');
  });
});
