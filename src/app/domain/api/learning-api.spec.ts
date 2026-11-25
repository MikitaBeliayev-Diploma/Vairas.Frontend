import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiReadiness, LearningApi } from './learning-api';
import { ApiContext } from '../../core/api-context';
import { APP_CONFIG } from '../../core/config';
import { PracticalRecord, TheoryRecord } from '../models/learning-models';
const readiness: ApiReadiness = {
  enrollmentId: 'e',
  evaluationId: 'evaluation',
  assessmentDefinitionVersionId: 'final',
  revision: 2,
  formalStatus: 'Incomplete',
  requirements: [
    {
      requirementId: 'hours',
      status: 'Incomplete',
      observedMinutes: 30,
      observedMark: null,
      explanation: 'More hours required',
    },
    {
      requirementId: 'theory',
      status: 'Satisfied',
      observedMinutes: 45,
      observedMark: null,
      explanation: 'Complete',
    },
  ],
  decision: null,
};
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
    sourceSnapshotId: 'snapshot',
    trainingMinutes: 45,
    distanceKm: 10,
    topicIds: ['topic'],
  },
  responses: [],
};
const theory: TheoryRecord = {
  recordId: 'theory',
  revision: 7,
  factVersion: 2,
  status: 'Confirmed',
  confirmedAt: '2026-01-01',
  confirmedBy: 'teacher',
  facts: {
    schoolId: 'school',
    lessonId: 'lesson',
    sourceSnapshotId: 'snapshot',
    trainingMinutes: 45,
    attendanceRows: [{ enrollmentId: 'e', studentId: 'student', attendance: 'Present' }],
  },
};
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
    ],
  });
  TestBed.inject(ApiContext).schoolId.set('school');
  return { api: TestBed.inject(LearningApi), http: TestBed.inject(HttpTestingController) };
}
describe('Learning Tracking HTTP contracts', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('selects the exact non-invalidated assessment evaluation and maps formal prerequisites', async () => {
    const { api, http } = setup();
    const result = api.readiness('e', 'final');
    http.expectOne('/api/v1/student-trainings/e/readiness?schoolId=school').flush([
      readiness,
      { ...readiness, evaluationId: 'obsolete', invalidated: true },
      {
        ...readiness,
        assessmentDefinitionVersionId: 'other',
        evaluationId: 'unrelated',
        formalStatus: 'Satisfied',
      },
    ]);
    expect(await result).toEqual(
      expect.objectContaining({
        evaluationId: 'evaluation',
        prerequisitesSatisfied: false,
        decision: 'Pending',
        outstandingRequirements: ['More hours required'],
      }),
    );
    const absent = api.readiness('e', 'missing');
    http.expectOne('/api/v1/student-trainings/e/readiness?schoolId=school').flush([readiness]);
    expect(await absent).toBeNull();
  });
  it('retains historical invalidation when no current assessment exists', async () => {
    const { api, http } = setup();
    const result = api.readiness('e', 'final');
    http
      .expectOne('/api/v1/student-trainings/e/readiness?schoolId=school')
      .flush([{ ...readiness, invalidated: true }]);
    expect((await result)?.invalidated).toBe(true);
  });
  it('evaluates exact assessment definitions and sends human decisions against the exact evaluation revision', async () => {
    const { api, http } = setup();
    const evalResult = api.evaluate('e', 'final');
    const e = http.expectOne('/api/v1/student-trainings/e/readiness-evaluations?schoolId=school');
    expect(e.request.method).toBe('POST');
    expect(e.request.body).toEqual({ assessmentDefinitionVersionId: 'final' });
    e.flush({ ...readiness, formalStatus: 'Satisfied', requirements: [] });
    const evaluated = await evalResult;
    expect(evaluated.prerequisitesSatisfied).toBe(true);
    const result = api.decide(evaluated, 2, 'Approved', 'Verified');
    const d = http.expectOne('/api/v1/student-trainings/e/readiness-decisions?schoolId=school');
    expect(d.request.body).toEqual({
      evaluationId: 'evaluation',
      expectedRevision: 2,
      decision: 'Approved',
      reason: 'Verified',
    });
    d.flush({ ...readiness, formalStatus: 'Satisfied', requirements: [], decision: 'Approved' });
    expect((await result).decision).toBe('Approved');
  });
  it('creates and corrects practical facts and confirms or disputes exact record revisions', async () => {
    const { api, http } = setup();
    const created = api.create(record.facts);
    const c = http.expectOne('/api/v1/practical-records?schoolId=school');
    expect(c.request.body).toEqual(record.facts);
    c.flush(record);
    await created;
    const revised = api.revise(record, {
      ...record.facts,
      trainingMinutes: 50,
      correctionReason: 'Corrected duration',
    });
    const r = http.expectOne('/api/v1/practical-records/record/versions?schoolId=school');
    expect(r.request.body).toEqual({
      ...record.facts,
      trainingMinutes: 50,
      correctionReason: 'Corrected duration',
      expectedRevision: 3,
    });
    r.flush({ ...record, revision: 4, factVersion: 3 });
    const next = await revised;
    const confirmed = api.confirm(next);
    const f = http.expectOne('/api/v1/practical-records/record/confirmations?schoolId=school');
    expect(f.request.body).toEqual({ revision: 4 });
    f.flush({});
    await confirmed;
    const disputed = api.dispute(next, 'Incorrect');
    const d = http.expectOne('/api/v1/practical-records/record/disputes?schoolId=school');
    expect(d.request.body).toEqual({ revision: 4, reason: 'Incorrect' });
    d.flush({});
    await disputed;
  });
  it('corrects theory facts using the record revision and supplied idempotency key', async () => {
    const { api, http } = setup();
    const facts = { ...theory.facts, correctionReason: 'Corrected attendance' };
    const result = api.reviseTheoryRecord(theory, facts, 'exact-key');
    const r = http.expectOne('/api/v1/theory-records/theory/versions?schoolId=school');
    expect(r.request.method).toBe('POST');
    expect(r.request.headers.get('Idempotency-Key')).toBe('exact-key');
    expect(r.request.body).toEqual({ ...facts, expectedRevision: 7 });
    r.flush({ ...theory, revision: 8, status: 'Pending', confirmedAt: null });
    expect((await result).status).toBe('Pending');
  });
  it('requests scoped progress and source verification without substituting local calculations', async () => {
    const { api, http } = setup();
    const result = api.progress('e');
    http
      .expectOne('/api/v1/student-trainings/e/progress?schoolId=school')
      .flush({ enrollmentId: 'e', practicalMinutes: 45 });
    expect((await result).practicalMinutes).toBe(45);
    const source = api.source('lesson');
    const r = http.expectOne('/api/v1/lessons/lesson/source-verifications?schoolId=school');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toBeNull();
    r.flush({ sourceSnapshotId: 'current' });
    expect((await source).sourceSnapshotId).toBe('current');
  });
});
