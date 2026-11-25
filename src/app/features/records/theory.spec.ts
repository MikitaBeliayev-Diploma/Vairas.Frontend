import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect } from 'vitest';
import { LearningApi } from '../../domain/api/learning-api';
import { ApiContext } from '../../core/api-context';
import { APP_CONFIG } from '../../core/config';

import { TheoryFacts, TheoryRecord } from '../../domain/models/learning-models';
import { creditedMinutes, physicalMinutes } from './theory';

const facts: TheoryFacts = {
  schoolId: 's1',
  lessonId: 'l1',
  sourceSnapshotId: 'snap',
  trainingMinutes: 90,
  attendanceRows: [{ enrollmentId: 'e1', studentId: 'st1', attendance: 'Present' }],
  durationExplanation: null,
};
const record: TheoryRecord = {
  recordId: 'r1',
  revision: 1,
  factVersion: 1,
  status: 'Pending',
  facts,
  confirmedBy: null,
  confirmedAt: null,
  sourceCurrent: true,
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
  return { api: TestBed.inject(LearningApi), http: TestBed.inject(HttpTestingController) };
}
describe('Theory record API adapter', () => {
  it('creates a theory record with the caller-supplied Idempotency-Key and exact facts', async () => {
    const { api, http } = setup();
    const result = api.createTheoryRecord(facts, 'key-1');
    const req = http.expectOne('/api/v1/theory-records?schoolId=s1');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.body).toEqual(facts);
    req.flush(record, { status: 201, statusText: 'Created' });
    expect((await result).recordId).toBe('r1');
    http.verify();
  });
  it('reads a record by ID within the active school', async () => {
    const { api, http } = setup();
    const result = api.theoryRecord('r1');
    const req = http.expectOne('/api/v1/theory-records/r1?schoolId=s1');
    expect(req.request.method).toBe('GET');
    req.flush(record);
    expect((await result).facts.attendanceRows).toHaveLength(1);
    http.verify();
  });
  it('confirms the exact record revision, not the fact version', async () => {
    const { api, http } = setup();
    const result = api.confirmTheoryRecord({ ...record, revision: 3, factVersion: 2 }, 'key-2');
    const req = http.expectOne('/api/v1/theory-records/r1/confirmations?schoolId=s1');
    expect(req.request.body).toEqual({ revision: 3 });
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-2');
    req.flush({ ...record, status: 'Confirmed', confirmedAt: '2030-01-15T12:00:00Z' });
    expect((await result).status).toBe('Confirmed');
    http.verify();
  });
});
describe('Theory roster helpers', () => {
  it('retrieves historical participants from the backend instead of filtering current memberships', async () => {
    const { api, http } = setup();
    const roster = api.theoryRoster('l1');
    http.expectOne('/api/v1/lessons/l1/theory-roster?schoolId=s1').flush({
      schoolId: 's1',
      groupId: 'g1',
      membershipVersion: 4,
      participants: [{ enrollmentId: 'left-group', studentId: 'historic-student' }],
    });
    expect((await roster).participants).toEqual([
      { enrollmentId: 'left-group', studentId: 'historic-student' },
    ]);
    http.verify();
  });
  it('discovers an existing theory record without a locally remembered identifier', async () => {
    const { api, http } = setup();
    const records = api.theoryRecords('l1');
    http.expectOne('/api/v1/lessons/l1/theory-records?schoolId=s1').flush([record]);
    expect((await records)[0].recordId).toBe('r1');
    http.verify();
  });
  it('derives physical minutes and credits Present fully and Absent with zero', () => {
    expect(physicalMinutes('2030-01-15T10:00:00Z', '2030-01-15T11:30:00Z')).toBe(90);
    expect(physicalMinutes(null, '2030-01-15T11:30:00Z')).toBeNull();
    expect(physicalMinutes('2030-01-15T11:30:00Z', '2030-01-15T10:00:00Z')).toBeNull();
    expect(creditedMinutes(record, 'Present')).toBe(90);
    expect(creditedMinutes(record, 'Absent')).toBe(0);
  });
});
