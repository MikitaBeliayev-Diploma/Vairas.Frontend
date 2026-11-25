import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningApi } from '../../domain/api/learning-api';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { SessionStore } from '../../core/session';
import { Readiness } from '../../domain/models/learning-models';
import { AssessmentsPanel, explainAssessmentError } from './assessments-panel';

const DEF = '11111111-1111-4111-8111-111111111111';
const readiness: Readiness = {
  enrollmentId: 'e1',
  evaluationId: 'ev1',
  prerequisitesSatisfied: true,
  outstandingRequirements: [],
  decision: 'Approved',
  decisionId: 'd1',
  assessmentDefinitionVersionId: DEF,
  invalidated: false,
};
const submission = {
  teacherId: 't1',
  branchId: 'b1',
  vehicleId: null,
  startsAt: '2099-01-15T08:00:00.000Z',
  endsAt: '2099-01-15T09:00:00.000Z',
  reason: 'Retake',
};
const appointment = {
  appointmentId: 'ap1',
  schoolId: 's1',
  status: 'Scheduled' as const,
  version: 1,
  startsAt: submission.startsAt,
  endsAt: submission.endsAt,
};

function setup(role: 'Administrator' | 'Instructor', scheduling: Partial<SchedulingApi>) {
  const learning = {
    assessments: vi.fn().mockResolvedValue([]),
    recordAssessment: vi.fn(),
    assessmentHistory: vi.fn(),
    reviseAssessment: vi.fn(),
  };
  const session = {
    has: (...roles: string[]) => roles.includes(role),
    session: signal({ schoolId: 's1', assessor: role === 'Instructor' }),
    enrollments: signal([
      {
        enrollmentId: 'e1',
        schoolId: 's1',
        studentId: 'st1',
        programVersionId: '',
        status: 'Active',
      },
    ]),
    catalog: signal({ teachers: [], branches: [], vehicles: [], branchId: 'b1' }),
  };
  TestBed.configureTestingModule({
    imports: [AssessmentsPanel],
    providers: [
      provideRouter([]),
      { provide: SessionStore, useValue: session },
      { provide: LearningApi, useValue: learning },
      {
        provide: SchedulingApi,
        useValue: { assessmentAppointments: vi.fn().mockResolvedValue([]), ...scheduling },
      },
    ],
  });
  const fixture = TestBed.createComponent(AssessmentsPanel);
  fixture.componentRef.setInput('enrollmentId', 'e1');
  fixture.componentRef.setInput('readiness', readiness);
  fixture.detectChanges();
  return { panel: fixture.componentInstance, learning };
}

describe('AssessmentsPanel', () => {
  beforeEach(() => localStorage.clear());
  it('books with the approved readiness and reuses the key after a lost response', async () => {
    const keys: string[] = [];
    const scheduleAssessment = vi.fn((_: unknown, key: string) => {
      keys.push(key);
      return keys.length === 1
        ? Promise.reject(new HttpErrorResponse({ status: 0 }))
        : Promise.resolve(appointment);
    });
    const scheduling = {
      scheduleAssessment,
      assessmentAppointments: vi.fn().mockResolvedValue([
        {
          ...appointment,
          assessmentDefinitionVersionId: DEF,
          teacherId: 'teacher',
          readinessEvaluationId: 'ev1',
        },
      ]),
      assessmentAppointment: vi.fn().mockResolvedValue(appointment),
      operation: vi
        .fn()
        .mockResolvedValue({ operationId: 'x', status: 'Committed', lessonIds: [] }),
    } as unknown as SchedulingApi;
    const { panel } = setup('Administrator', scheduling);
    await panel.book(submission);
    expect(scheduleAssessment.mock.calls[0][0]).toMatchObject({
      enrollmentId: 'e1',
      readinessEvaluationId: 'ev1',
      assessmentDefinitionVersionId: DEF,
      reason: 'Retake',
    });
    expect(panel.pending()?.status).toBe('ReconciliationPending');
    await panel.reconcile();
    expect(keys[1]).toBe(keys[0]);
    expect(panel.pending()).toBeNull();
    expect(panel.created()?.appointmentId).toBe('ap1');
    expect(panel.appointments().map((a) => a.appointmentId)).toEqual(['ap1']);
  });
  it('treats a 202 RECONCILIATION_PENDING answer as an unfinished operation', async () => {
    const scheduling = {
      scheduleAssessment: vi
        .fn()
        .mockResolvedValue({ code: 'RECONCILIATION_PENDING', status: 202 }),
      assessmentAppointment: vi.fn(),
      operation: vi.fn().mockResolvedValue({
        operationId: 'x',
        status: 'Rejected',
        lessonIds: [],
        code: 'ASSESSMENT_NOT_READY',
      }),
    } as unknown as SchedulingApi;
    const { panel } = setup('Administrator', scheduling);
    await panel.book(submission);
    expect(panel.pending()).not.toBeNull();
    await panel.reconcile();
    expect(panel.pending()).toBeNull();
    expect(panel.bookingError()).toContain('not currently approved');
  });
  it('sends the readiness decision only for the readiness-approved assessment', async () => {
    const { panel, learning } = setup('Instructor', {} as SchedulingApi);
    learning.recordAssessment.mockResolvedValue({ outcome: 'Passed', mark: 8 });
    await panel.record({
      assessmentDefinitionVersionId: DEF,
      mark: 8,
      assessedAt: '2026-01-15T08:30:00.000Z',
      appointmentId: null,
      comment: null,
    });
    expect(learning.recordAssessment.mock.calls[0][0]).toMatchObject({
      readinessDecisionId: 'd1',
      mark: 8,
    });
    await panel.record({
      assessmentDefinitionVersionId: '33333333-3333-4333-8333-333333333333',
      mark: 5,
      assessedAt: '2026-01-15T08:30:00.000Z',
      appointmentId: null,
      comment: null,
    });
    expect(learning.recordAssessment.mock.calls[1][0].readinessDecisionId).toBeNull();
  });
  it('corrects the exact recorded version and preserves its topic marks', async () => {
    const { panel, learning } = setup('Instructor', {} as SchedulingApi);
    const result = {
      assessmentId: 'a',
      resultVersionId: 'v',
      enrollmentId: 'e1',
      assessmentDefinitionVersionId: DEF,
      attemptNumber: 1,
      revision: 3,
      version: 2,
      mark: 7,
      outcome: 'Passed' as const,
      status: 'Recorded' as const,
      assessedAt: '2026-01-15T08:30:00.000Z',
      readinessDecisionId: null,
    };
    const topicMarks = [{ assessmentTopicId: 'topic', mark: 5 }];
    learning.assessmentHistory.mockResolvedValue([
      { current: true, resultVersionId: 'v', topicMarks },
    ]);
    learning.reviseAssessment.mockResolvedValue({ ...result, mark: 8 });
    await panel.openHistory(result);
    panel.correctionMark.setValue(8);
    panel.correctionReason.setValue('Correct recorded mark');
    await panel.correctResult();
    expect(learning.reviseAssessment).toHaveBeenCalledWith(
      'a',
      {
        expectedRevision: 3,
        mark: 8,
        status: 'Recorded',
        correctionReason: 'Correct recorded mark',
        topicMarks,
      },
      expect.any(String),
    );
  });
  it('does not invent a timestamp for historical readiness review', async () => {
    const { panel, learning } = setup('Instructor', {} as SchedulingApi);
    learning.assessmentHistory.mockResolvedValue([
      { current: true, resultVersionId: 'v', topicMarks: [] },
    ]);
    await panel.openHistory({
      assessmentId: 'a',
      resultVersionId: 'v',
      enrollmentId: 'e1',
      assessmentDefinitionVersionId: DEF,
      attemptNumber: 1,
      revision: 3,
      version: 2,
      mark: 7,
      outcome: 'Passed',
      status: 'ReviewRequired',
      assessedAt: '2026-01-15T08:30:00.000Z',
      readinessDecisionId: 'd1',
    });
    panel.correctionReason.setValue('Review');
    await panel.correctResult();
    expect(learning.reviseAssessment).not.toHaveBeenCalled();
  });
  it('submits a historical review with the exact server invalidation timestamp', async () => {
    const { panel, learning } = setup('Instructor', {} as SchedulingApi);
    const invalidatedAt = '2026-01-20T10:15:30.123456+00:00';
    const held = {
      assessmentId: 'a',
      resultVersionId: 'v',
      enrollmentId: 'e1',
      assessmentDefinitionVersionId: DEF,
      attemptNumber: 1,
      revision: 3,
      version: 2,
      mark: 7,
      outcome: 'Passed' as const,
      status: 'ReviewRequired' as const,
      assessedAt: '2026-01-15T08:30:00.000Z',
      readinessDecisionId: 'd1',
      readinessInvalidatedAt: invalidatedAt,
    };
    learning.assessmentHistory.mockResolvedValue([
      { current: true, resultVersionId: 'v', topicMarks: [] },
    ]);
    learning.reviseAssessment.mockResolvedValue({ ...held, status: 'Recorded' });
    await panel.openHistory(held);
    expect(panel.reviewing()).toBe(true);
    expect(panel.canCorrectResult()).toBe(true);
    panel.correctionReason.setValue('Reviewed after readiness invalidation');
    await panel.correctResult();
    expect(learning.reviseAssessment).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        mark: 7,
        status: 'Recorded',
        reviewedInvalidationAt: invalidatedAt,
      }),
      expect.any(String),
    );
  });
  it('explains contract error codes', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { code: 'CURRENT_READINESS_APPROVAL_REQUIRED', correlationId: 'c1' },
    });
    expect(explainAssessmentError(error, 'x')).toContain('still valid readiness decision');
    expect(explainAssessmentError(error, 'x')).toContain('Reference: c1');
  });
});
