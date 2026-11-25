import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect } from 'vitest';
import { LearningApi } from '../../domain/api/learning-api';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { ApiContext } from '../../core/api-context';
import { APP_CONFIG } from '../../core/config';
import {
  AssessmentAppointmentRequest,
  AssessmentResult,
  AssessmentResultRequest,
} from '../../domain/models/assessment-models';
import { appointmentInterval, assessmentResultError } from './assessment';

const NOW = Date.parse('2030-01-10T10:00:00Z');
const DEF = '11111111-1111-4111-8111-111111111111';
const appointmentRequest: AssessmentAppointmentRequest = {
  schoolId: 's1',
  enrollmentId: 'e1',
  assessmentDefinitionVersionId: DEF,
  readinessEvaluationId: 'ev1',
  teacherId: 't1',
  branchId: 'b1',
  startsAt: '2030-01-15T08:00:00.000Z',
  endsAt: '2030-01-15T09:00:00.000Z',
  reason: 'Repeated final assessment',
  vehicleId: 'v1',
};
const resultRequest: AssessmentResultRequest = {
  schoolId: 's1',
  enrollmentId: 'e1',
  assessmentDefinitionVersionId: DEF,
  mark: 8,
  assessedAt: '2030-01-15T08:30:00.000Z',
  readinessDecisionId: 'd1',
  appointmentId: null,
  comment: null,
};
const result: AssessmentResult = {
  assessmentId: 'a1',
  resultVersionId: 'rv1',
  enrollmentId: 'e1',
  assessmentDefinitionVersionId: DEF,
  attemptNumber: 1,
  revision: 1,
  version: 1,
  mark: 8,
  outcome: 'Passed',
  status: 'Recorded',
  assessedAt: '2030-01-15T08:30:00Z',
  readinessDecisionId: 'd1',
};
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
    ],
  });
  TestBed.inject(ApiContext).schoolId.set('s1');
  return {
    scheduling: TestBed.inject(SchedulingApi),
    learning: TestBed.inject(LearningApi),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('appointmentInterval', () => {
  it('converts a Vilnius wall-clock start plus duration into UTC instants', () => {
    expect(appointmentInterval('2030-01-15T10:00', 60, NOW)).toEqual({
      startsAt: '2030-01-15T08:00:00.000Z',
      endsAt: '2030-01-15T09:00:00.000Z',
    });
    // Summer time: UTC+3.
    expect(appointmentInterval('2030-07-15T10:00', 45, NOW).startsAt).toBe(
      '2030-07-15T07:00:00.000Z',
    );
  });
  it('rejects past, DST-gap, out-of-range and cross-midnight intervals', () => {
    expect(() => appointmentInterval('2030-01-01T10:00', 60, NOW)).toThrow('future');
    expect(() => appointmentInterval('2030-03-31T03:30', 60, NOW)).toThrow('daylight saving');
    expect(() => appointmentInterval('2030-01-15T10:00', 10, NOW)).toThrow('15–240');
    expect(() => appointmentInterval('2030-01-15T10:00', 30.5, NOW)).toThrow('15–240');
    expect(() => appointmentInterval('2030-01-15T23:30', 60, NOW)).toThrow('same Vilnius day');
  });
});

describe('assessmentResultError', () => {
  const scale = { id: DEF, name: 'Final', stage: 'Final', minimumMark: 0, maximumMark: 10 };
  it('checks the assessment, whole mark within the visible scale and a past time', () => {
    expect(assessmentResultError('', scale, 8, '2030-01-09T10:00:00Z', null, '', NOW)).toContain(
      'Select',
    );
    expect(assessmentResultError(DEF, scale, 7.5, '2030-01-09T10:00:00Z', null, '', NOW)).toContain(
      'whole',
    );
    expect(assessmentResultError(DEF, scale, 11, '2030-01-09T10:00:00Z', null, '', NOW)).toContain(
      'between 0 and 10',
    );
    expect(assessmentResultError(DEF, undefined, 11, '2030-01-09T10:00:00Z', null, '', NOW)).toBe(
      null,
    );
    expect(assessmentResultError(DEF, scale, 8, '2030-01-11T10:00:00Z', null, '', NOW)).toContain(
      'future',
    );
  });
  it('keeps the assessment time within the selected appointment', () => {
    const appointment = { startsAt: '2030-01-09T08:00:00Z', endsAt: '2030-01-09T09:00:00Z' };
    expect(
      assessmentResultError(DEF, scale, 8, '2030-01-09T10:00:00Z', appointment, '', NOW),
    ).toContain('within the selected appointment');
    expect(
      assessmentResultError(DEF, scale, 8, '2030-01-09T08:30:00Z', appointment, '', NOW),
    ).toBeNull();
  });
});

describe('Assessment API adapters', () => {
  it('books an appointment with the caller-supplied Idempotency-Key and exact request', async () => {
    const { scheduling, http } = setup();
    const answer = scheduling.scheduleAssessment(appointmentRequest, 'key-1');
    const req = http.expectOne('/api/v1/assessment-appointments?schoolId=s1');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.body).toEqual(appointmentRequest);
    req.flush({ appointmentId: 'ap1', schoolId: 's1', status: 'Scheduled', version: 1 });
    expect(await answer).toMatchObject({ appointmentId: 'ap1' });
    http.verify();
  });
  it('reads and cancels an appointment by ID with its expected version', async () => {
    const { scheduling, http } = setup();
    const read = scheduling.assessmentAppointment('ap1');
    http.expectOne('/api/v1/assessment-appointments/ap1?schoolId=s1').flush({
      appointmentId: 'ap1',
      version: 2,
    });
    expect((await read).version).toBe(2);
    const cancel = scheduling.cancelAssessment(
      {
        appointmentId: 'ap1',
        schoolId: 's1',
        status: 'Scheduled',
        version: 2,
        startsAt: '',
        endsAt: '',
      },
      'Learner ill',
      'key-2',
    );
    const req = http.expectOne('/api/v1/assessment-appointments/ap1/cancellation?schoolId=s1');
    expect(req.request.body).toEqual({ expectedVersion: 2, reason: 'Learner ill' });
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-2');
    req.flush({ appointmentId: 'ap1', status: 'Cancelled', version: 3 });
    expect((await cancel).status).toBe('Cancelled');
    http.verify();
  });
  it('records and lists assessment results for the enrollment', async () => {
    const { learning, http } = setup();
    const recorded = learning.recordAssessment(resultRequest, 'key-3');
    const req = http.expectOne('/api/v1/student-trainings/e1/assessments?schoolId=s1');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-3');
    expect(req.request.body).toEqual(resultRequest);
    req.flush(result, { status: 201, statusText: 'Created' });
    expect((await recorded).outcome).toBe('Passed');
    const list = learning.assessments('e1');
    const get = http.expectOne('/api/v1/student-trainings/e1/assessments?schoolId=s1');
    expect(get.request.method).toBe('GET');
    get.flush([result]);
    expect(await list).toHaveLength(1);
    http.verify();
  });
});
