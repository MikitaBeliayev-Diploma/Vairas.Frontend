import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SchedulingApi } from './scheduling-api';
import { ApiContext } from '../../core/api-context';
import { APP_CONFIG } from '../../core/config';
import {
  Booking,
  DraftInputSet,
  Lesson,
  ScheduleProposal,
  SchedulingRequest,
} from '../models/scheduling-models';
const request: SchedulingRequest = {
  requestId: 'request',
  revision: 4,
  schoolId: 'school',
  status: 'Draft',
  missingItems: [],
};
const inputs: DraftInputSet = {
  schoolId: 'school',
  enrollmentIds: ['e1', 'e2'],
  teacherIds: ['t1', 't2'],
  vehicleIds: ['v1', 'v2'],
};
const proposal: ScheduleProposal = {
  requestId: 'request',
  revision: 4,
  status: 'Ready',
  lessons: [],
  theoryLessons: [],
  issues: [],
};
const booking: Booking = {
  schoolId: 'school',
  branchId: 'branch',
  enrollmentId: 'e1',
  studentId: 'student',
  teacherId: 't1',
  vehicleId: 'v1',
  category: 'B',
  startsAt: '2026-01-01T10:00:00Z',
  endsAt: '2026-01-01T11:00:00Z',
  reason: 'Additional training',
};
const lesson: Lesson = {
  lessonId: 'lesson',
  kind: 'Practical',
  status: 'Scheduled',
  version: 7,
  startsAt: booking.startsAt,
  endsAt: booking.endsAt,
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
  return { api: TestBed.inject(SchedulingApi), http: TestBed.inject(HttpTestingController) };
}
describe('Scheduling HTTP contracts', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('lists requests with pagination and retrieves exact saved proposals without a write', async () => {
    const { api, http } = setup();
    const list = api.requests(20);
    const r = http.expectOne('/api/v1/scheduling-requests?offset=20&limit=20&schoolId=school');
    expect(r.request.method).toBe('GET');
    r.flush({ items: [], nextOffset: 40 });
    expect((await list).nextOffset).toBe(40);
    const saved = api.savedProposal('request', 4);
    const p = http.expectOne('/api/v1/scheduling-requests/request/proposals/4?schoolId=school');
    expect(p.request.method).toBe('GET');
    p.flush(proposal);
    expect(await saved).toEqual(proposal);
  });
  it('reads request details and inputs from school-scoped endpoints', async () => {
    const { api, http } = setup();
    const details = api.request('request');
    const d = http.expectOne('/api/v1/scheduling-requests/request?schoolId=school');
    expect(d.request.method).toBe('GET');
    d.flush(request);
    expect(await details).toEqual(request);
    const source = api.requestInputs('request');
    const i = http.expectOne('/api/v1/scheduling-requests/request/inputs?schoolId=school');
    expect(i.request.method).toBe('GET');
    i.flush(inputs);
    expect(await source).toEqual(inputs);
  });
  it('creates and revises drafts with all resource selections and an expected revision', async () => {
    const { api, http } = setup();
    const created = api.createDraft(inputs);
    const c = http.expectOne('/api/v1/scheduling-requests?schoolId=school');
    expect(c.request.method).toBe('POST');
    expect(c.request.body).toEqual(inputs);
    expect(c.request.headers.has('Idempotency-Key')).toBe(true);
    c.flush(request);
    await created;
    const updated = api.updateDraft(request, inputs);
    const u = http.expectOne('/api/v1/scheduling-requests/request?schoolId=school');
    expect(u.request.method).toBe('PUT');
    expect(u.request.body).toEqual({ ...inputs, expectedRevision: 4 });
    u.flush({ ...request, revision: 5 });
    expect((await updated).revision).toBe(5);
  });
  it('submits, generates and confirms the selected revision with explicit operation identity', async () => {
    const { api, http } = setup();
    const submitted = api.submit(request);
    const s = http.expectOne('/api/v1/scheduling-requests/request/submissions?schoolId=school');
    expect(s.request.method).toBe('POST');
    expect(s.request.body).toEqual({ expectedRevision: 4 });
    s.flush({ ...request, status: 'Submitted' });
    await submitted;
    const generated = api.proposal(request);
    const g = http.expectOne('/api/v1/scheduling-requests/request/proposals?schoolId=school');
    expect(g.request.body).toEqual({ expectedRevision: 4 });
    g.flush(proposal);
    await generated;
    const confirmed = api.confirm(proposal, 'exact-key');
    const c = http.expectOne('/api/v1/scheduling-requests/request/confirmations?schoolId=school');
    expect(c.request.body).toEqual({ expectedRevision: 4 });
    expect(c.request.headers.get('Idempotency-Key')).toBe('exact-key');
    c.flush(
      { operationId: 'op', status: 'ReconciliationPending', lessonIds: [] },
      { status: 202, statusText: 'Accepted' },
    );
    expect((await confirmed).status).toBe('ReconciliationPending');
    const check = api.operation('op');
    http
      .expectOne('/api/v1/scheduling-operations/op?schoolId=school')
      .flush({ operationId: 'op', status: 'Committed', lessonIds: ['lesson'] });
    expect((await check).status).toBe('Committed');
  });
  it('books practical lessons using the explicit reason and idempotency key', async () => {
    const { api, http } = setup();
    const result = api.book(booking, 'booking-key');
    const r = http.expectOne('/api/v1/practical-lessons?schoolId=school');
    expect(r.request.method).toBe('POST');
    expect(r.request.headers.get('Idempotency-Key')).toBe('booking-key');
    expect(r.request.body).toEqual(booking);
    r.flush(lesson);
    expect(await result).toEqual(lesson);
  });
  for (const kind of ['Theory', 'Practical'] as const) {
    it(`uses the correct ${kind.toLowerCase()} lesson route and exact version for lifecycle writes`, async () => {
      const { api, http } = setup();
      const item = { ...lesson, kind };
      const base =
        '/api/v1/' + (kind === 'Theory' ? 'theory-lessons' : 'practical-lessons') + '/lesson/';
      const rescheduled = api.reschedule(
        item,
        booking.startsAt,
        booking.endsAt,
        'Changed',
        'reschedule-key',
      );
      const r = http.expectOne(base + 'rescheduling?schoolId=school');
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({
        expectedVersion: 7,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        reason: 'Changed',
      });
      expect(r.request.headers.get('Idempotency-Key')).toBe('reschedule-key');
      r.flush(item);
      await rescheduled;
      const cancelled = api.cancel(item, 'Cancelled', 'cancel-key');
      const c = http.expectOne(base + 'cancellation?schoolId=school');
      expect(c.request.body).toEqual({ expectedVersion: 7, reason: 'Cancelled' });
      expect(c.request.headers.get('Idempotency-Key')).toBe('cancel-key');
      c.flush({ ...item, status: 'Cancelled' });
      await cancelled;
      const completed = api.complete(item, booking.startsAt, booking.endsAt);
      const f = http.expectOne(base + 'completion?schoolId=school');
      expect(f.request.body).toEqual({
        expectedVersion: 7,
        actualStart: booking.startsAt,
        actualEnd: booking.endsAt,
      });
      f.flush({ ...item, status: 'Completed' });
      expect((await completed).status).toBe('Completed');
    });
  }
});
