import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { PlanningPage } from './planning';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { Feedback } from '../../core/feedback';
import { SchedulingRequest } from '../../domain/models/scheduling-models';
const id = '11111111-1111-4111-8111-111111111111';
function setup() {
  let resolve!: (value: SchedulingRequest) => void;
  const request = new Promise<SchedulingRequest>((r) => {
    resolve = r;
  });
  const api = {
    request: vi.fn(() => request),
    createDraft: vi.fn().mockResolvedValue(restored),
    submit: vi.fn().mockResolvedValue({ ...restored, status: 'Submitted' }),
    proposal: vi.fn().mockResolvedValue({
      requestId: id,
      revision: 1,
      status: 'Ready',
      lessons: [],
      theoryLessons: [],
      issues: [],
    }),
    confirm: vi
      .fn()
      .mockResolvedValue({ operationId: 'op', status: 'Committed', lessonIds: ['lesson'] }),
    operation: vi
      .fn()
      .mockResolvedValue({ operationId: 'op', status: 'Committed', lessonIds: ['lesson'] }),
    requestInputs: vi.fn().mockResolvedValue({ schoolId: 'school', enrollmentIds: ['e'] }),
    requests: vi
      .fn()
      .mockResolvedValue({ items: [{ request: { requestId: id } }], nextOffset: null }),
    updateDraft: vi.fn().mockResolvedValue({ ...restored, revision: 2, status: 'Draft' }),
    savedProposal: vi.fn().mockResolvedValue({
      requestId: id,
      revision: 1,
      status: 'Ready',
      lessons: [],
      theoryLessons: [],
      issues: [],
    }),
  };
  const feedback = { fail: vi.fn(), done: vi.fn() };
  const workspace = { load: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    imports: [PlanningPage],
    providers: [
      { provide: SchedulingApi, useValue: api },
      { provide: SchoolAdminApi, useValue: {} },
      { provide: SessionStore, useValue: { session: signal({ schoolId: 'school' }) } },
      { provide: WorkspaceStore, useValue: workspace },
      { provide: Feedback, useValue: feedback },
    ],
  });
  TestBed.overrideComponent(PlanningPage, { set: { template: '' } });
  const page = TestBed.createComponent(PlanningPage).componentInstance;
  return { page, api, resolve, feedback, workspace };
}
const restored: SchedulingRequest = {
  requestId: id,
  schoolId: 'school',
  revision: 1,
  status: 'Draft',
  missingItems: [],
};
describe('Scheduling request restoration and reset', () => {
  it('discards delayed restoration after New draft and clears restored inputs', async () => {
    const { page, resolve } = setup();
    const pending = page.openRequest(id);
    page.reset();
    resolve(restored);
    await pending;
    expect(page.request()).toBeNull();
    expect(page.restoredInputs()).toBeNull();
    expect(page.proposal()).toBeNull();
    expect(page.busy()).toBe(false);
  });
  it('loads a persisted proposal through GET without rerunning generation', async () => {
    const { page, api, resolve } = setup();
    const pending = page.openRequest(id, 1);
    resolve({ ...restored, status: 'Ready' });
    await pending;
    expect(api.savedProposal).toHaveBeenCalledWith(id, 1);
    expect(page.proposal()?.revision).toBe(1);
    page.reset();
    expect(page.restoredInputs()).toBeNull();
    expect(page.proposal()).toBeNull();
  });
  it('preserves an unresolved confirmation when another request is opened', async () => {
    const { page, api } = setup();
    page.operation.set({
      operationId: 'operation',
      status: 'ReconciliationPending',
      lessonIds: [],
    });
    await page.openRequest(id);
    page.reset();
    expect(api.request).not.toHaveBeenCalled();
    expect(page.operation()?.operationId).toBe('operation');
  });
  it('creates an editable revision using restored server inputs', async () => {
    const { page, api, resolve } = setup();
    const pending = page.openRequest(id);
    resolve({ ...restored, status: 'Submitted' });
    await pending;
    await page.createVersion();
    expect(api.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1 }),
      expect.objectContaining({ schoolId: 'school' }),
    );
    expect(page.request()?.revision).toBe(2);
  });
  it('lists server requests without a manually entered UUID', async () => {
    const { page, api } = setup();
    await page.loadRequests();
    expect(api.requests).toHaveBeenCalledWith(0);
    expect(page.requests()[0].request.requestId).toBe(id);
  });
});

describe('Planning submission and confirmation', () => {
  it('saves a multi-resource draft, submits the current revision and confirms a generated proposal', async () => {
    const { page, api, workspace } = setup();
    const inputs = {
      schoolId: 'school',
      enrollmentIds: ['e1', 'e2'],
      teacherIds: ['t1', 't2'],
      vehicleIds: ['v1', 'v2'],
    };
    await page.save(inputs);
    expect(api.createDraft).toHaveBeenCalledWith(inputs);
    expect(page.restoredInputs()).toEqual(inputs);
    await page.submit();
    expect(api.submit).toHaveBeenCalledWith(restored);
    await page.generate();
    expect(api.proposal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Submitted', revision: 1 }),
    );
    await page.confirm();
    expect(api.confirm).toHaveBeenCalledWith(page.proposal(), expect.any(String));
    expect(page.operation()?.status).toBe('Committed');
    expect(workspace.load).toHaveBeenCalled();
    await page.confirm();
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });
  it('does not submit incomplete drafts or confirm an infeasible proposal', async () => {
    const { page, api } = setup();
    page.request.set({ ...restored, missingItems: ['vehicles'] });
    await page.submit();
    expect(api.submit).not.toHaveBeenCalled();
    page.request.set({ ...restored, status: 'Submitted' });
    api.proposal.mockResolvedValueOnce({
      requestId: id,
      revision: 1,
      status: 'Infeasible',
      lessons: [],
      theoryLessons: [],
      issues: ['No available instructor'],
    });
    await page.generate();
    await page.confirm();
    expect(api.confirm).not.toHaveBeenCalled();
    expect(page.proposal()?.issues).toEqual(['No available instructor']);
  });
  it('reconciles an unknown confirmation result without replaying the write', async () => {
    const { page, api, workspace, feedback } = setup();
    page.request.set({ ...restored, status: 'Submitted' });
    await page.generate();
    api.confirm.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    await page.confirm();
    expect(page.operation()?.status).toBe('ReconciliationPending');
    expect(feedback.done).not.toHaveBeenCalled();
    const key = api.confirm.mock.calls[0][1];
    await page.reconcile();
    expect(api.operation).toHaveBeenCalledWith(key);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(workspace.load).toHaveBeenCalled();
    expect(feedback.done).toHaveBeenCalled();
  });
  it('marks a conflicting proposal stale and does not allow confirmation again', async () => {
    const { page, api } = setup();
    page.request.set({ ...restored, status: 'Submitted' });
    await page.generate();
    api.confirm.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    await page.confirm();
    expect(page.stale()).toBe(true);
    await page.confirm();
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });
  it('rejects restoration from a different school and leaves no selected request', async () => {
    const { page, resolve } = setup();
    const pending = page.openRequest(id);
    resolve({ ...restored, schoolId: 'different' });
    await pending;
    expect(page.request()).toBeNull();
    expect(page.restoreError()).toContain('Could not open');
  });
});
