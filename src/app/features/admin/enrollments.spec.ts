import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { EnrollmentsAdminPage } from './enrollments';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { LearningApi } from '../../domain/api/learning-api';
import { ProgramApi } from '../../domain/api/program-api';
import { ProgramRegistry } from './program-registry';
import { SchoolEnrollment } from '../../domain/models/school-models';

const enrollment: SchoolEnrollment = {
  enrollmentId: 'enrollment',
  schoolId: 'school',
  studentId: 'student',
  licenseCategory: 'B',
  status: 'Active',
  version: 3,
  startedAt: '2026-01-01',
  endedAt: null,
  groupId: 'group',
  programVersionId: 'programme',
};
function setup() {
  const school = {
    enrollments: vi.fn().mockResolvedValue([enrollment]),
    groups: vi.fn().mockResolvedValue([]),
    planningInputs: vi.fn().mockResolvedValue(null),
    enrollment: vi.fn().mockResolvedValue(enrollment),
    assignGroup: vi.fn().mockResolvedValue({ state: 'Committed' }),
    activationOperation: vi.fn(),
    createEnrollment: vi.fn().mockResolvedValue(enrollment),
    removeFromGroup: vi.fn().mockResolvedValue(enrollment),
    terminateEnrollment: vi.fn().mockResolvedValue(enrollment),
  };
  const learning = { progress: vi.fn().mockResolvedValue({ state: 'AwaitingProgramme' }) };
  const programs = { startTraining: vi.fn().mockResolvedValue({ programVersionId: 'programme' }) };
  const auth = {
    session: signal({ schoolId: 'school' }),
    reloadCatalog: vi.fn().mockResolvedValue(undefined),
  };
  const feedback = { done: vi.fn(), fail: vi.fn() };
  TestBed.configureTestingModule({
    imports: [EnrollmentsAdminPage],
    providers: [
      { provide: SchoolAdminApi, useValue: school },
      { provide: LearningApi, useValue: learning },
      { provide: ProgramApi, useValue: programs },
      { provide: ProgramRegistry, useValue: { versions: vi.fn().mockResolvedValue([]) } },
      { provide: SessionStore, useValue: auth },
      { provide: Feedback, useValue: feedback },
    ],
  });
  TestBed.overrideComponent(EnrollmentsAdminPage, { set: { template: '' } });
  const page = TestBed.createComponent(EnrollmentsAdminPage).componentInstance;
  return { page, school, learning, programs, auth, feedback };
}
describe('Enrollment administration and recovery', () => {
  it('filters server enrollments and validates student identifiers before creation', async () => {
    const { page, school } = setup();
    await page.data.load();
    expect(page.rows()).toEqual([enrollment]);
    page.search.set('unknown');
    expect(page.rows()).toEqual([]);
    page.search.set('active');
    expect(page.rows()).toEqual([enrollment]);
    page.createForm.controls.studentId.setValue('not-a-uuid');
    await page.create();
    expect(school.createEnrollment).not.toHaveBeenCalled();
    expect(page.createForm.controls.studentId.hasError('uuid')).toBe(true);
    const id = '11111111-1111-4111-8111-111111111111';
    page.createForm.controls.studentId.setValue(id);
    page.createOpen.set(true);
    await page.create();
    expect(school.createEnrollment).toHaveBeenCalledWith('school', id, 'B', expect.any(String));
    expect(page.createOpen()).toBe(false);
  });
  it('does not pin training while school assignment remains pending', async () => {
    const { page, school, programs } = setup();
    school.assignGroup.mockResolvedValue({ state: 'Pending', operationId: 'op' });
    page.openAssign(enrollment);
    await page.assign();
    expect(programs.startTraining).not.toHaveBeenCalled();
    expect(page.assignmentPending()?.operationId).toBe('op');
    page.openAssign({ ...enrollment, enrollmentId: 'other' });
    expect(page.assignTarget()?.enrollmentId).toBe('enrollment');
    school.activationOperation.mockResolvedValue({ state: 'Committed' });
    await page.checkAssignment();
    expect(school.activationOperation).toHaveBeenCalledWith('school', 'op');
    expect(page.assignmentPending()).toBeNull();
    expect(page.assignTarget()).toBeNull();
  });
  it('recovers a failed programme registration using the same operation identity', async () => {
    const { page, programs, school } = setup();
    programs.startTraining.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    page.openAssign(enrollment);
    await page.assign();
    expect(page.trainingNotice()).toContain('not confirmed');
    expect(page.assignTarget()).toBeNull();
    await page.configureTraining(enrollment);
    expect(school.assignGroup).toHaveBeenCalledTimes(1);
    expect(programs.startTraining).toHaveBeenCalledTimes(2);
    expect(programs.startTraining.mock.calls[0]).toEqual(programs.startTraining.mock.calls[1]);
    expect(page.trainingNotice()).toContain('pinned');
  });
  it('does not register a programme for another school, inactive enrollment or unknown progress', async () => {
    const { page, school, learning, programs } = setup();
    await page.configureTraining({ ...enrollment, schoolId: 'other' });
    expect(school.enrollment).not.toHaveBeenCalled();
    school.enrollment.mockResolvedValueOnce({ ...enrollment, status: 'Completed' });
    await page.configureTraining(enrollment);
    expect(learning.progress).not.toHaveBeenCalled();
    learning.progress.mockResolvedValueOnce({ state: 'Unknown' });
    await page.configureTraining(enrollment);
    expect(programs.startTraining).not.toHaveBeenCalled();
    expect(page.trainingNotice()).toContain('No write');
  });
  it('verifies an already assigned programme against the School association instead of assuming it', async () => {
    const { page, learning, programs } = setup();
    learning.progress.mockResolvedValue({ state: 'Assigned' });
    await page.configureTraining(enrollment);
    expect(programs.startTraining).toHaveBeenCalledWith(
      'school',
      'enrollment',
      'programme',
      expect.any(String),
    );
    expect(page.trainingNotice()).toContain('already pinned');
  });
  it('does not report success when Learning keeps a different pinned programme', async () => {
    const { page, learning, programs, feedback } = setup();
    learning.progress.mockResolvedValue({ state: 'Assigned' });
    programs.startTraining.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { code: 'PROGRAMME_TRANSFER_UNSUPPORTED' } }),
    );
    await page.configureTraining(enrollment);
    expect(page.trainingNotice()).not.toContain('already pinned');
    expect(page.trainingNotice()).toContain('not confirmed');
    expect(feedback.done).not.toHaveBeenCalledWith(expect.stringContaining('pinned'));
  });
  it('reports a mismatching programme confirmation and does not claim success', async () => {
    const { page, programs, feedback } = setup();
    programs.startTraining.mockResolvedValue({ programVersionId: 'different' });
    await page.configureTraining(enrollment);
    expect(feedback.fail).toHaveBeenCalledWith(expect.stringContaining('does not match'));
    expect(page.trainingNotice()).toContain('not confirmed');
  });
  it('refreshes after removing a group or ending an enrollment', async () => {
    const { page, school, auth } = setup();
    await page.removeGroup(enrollment);
    expect(school.removeFromGroup).toHaveBeenCalledWith(enrollment);
    page.endTarget.set(enrollment);
    await page.end();
    expect(school.terminateEnrollment).toHaveBeenCalledWith(enrollment, 'Completed');
    expect(page.endTarget()).toBeNull();
    expect(auth.reloadCatalog).toHaveBeenCalledTimes(2);
  });
});
