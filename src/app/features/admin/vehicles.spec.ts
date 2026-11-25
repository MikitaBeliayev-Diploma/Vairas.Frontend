import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { VehiclesPage } from './vehicles';
import { VehicleApi } from '../../domain/api/vehicle-api';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Vehicle } from '../../domain/models/vehicle-models';
const vehicle: Vehicle = {
  vehicleId: 'vehicle',
  schoolId: 'school',
  branchId: 'branch',
  registrationCountryCode: 'LT',
  registrationNumber: 'ABC123',
  manufacturer: 'Toyota',
  model: 'Yaris',
  manufactureYear: 2020,
  transmission: 'Manual',
  status: 'Active',
  revision: 1,
  categories: ['B'],
  teacherAssignments: [
    { teacherId: 'teacher', schoolMembershipId: 'member', assignedAt: '2026-01-01' },
  ],
};
function setup() {
  const api = {
    list: vi.fn().mockResolvedValue([vehicle]),
    create: vi.fn().mockResolvedValue(vehicle),
    update: vi.fn().mockResolvedValue({ resource: { ...vehicle, revision: 2 } }),
    categories: vi
      .fn()
      .mockResolvedValue({ resource: { ...vehicle, revision: 3, categories: ['BE'] } }),
    teachers: vi.fn().mockResolvedValue(vehicle),
    changeState: vi.fn().mockResolvedValue({ operationId: 'op', status: 'Pending' }),
    stateChange: vi.fn().mockResolvedValue({
      operationId: 'op',
      status: 'Completed',
      resultVehicleStatus: 'Inactive',
    }),
  };
  const feedback = { done: vi.fn(), fail: vi.fn() };
  TestBed.configureTestingModule({
    imports: [VehiclesPage],
    providers: [
      { provide: VehicleApi, useValue: api },
      {
        provide: SchoolAdminApi,
        useValue: {
          branches: vi
            .fn()
            .mockResolvedValue([{ branchId: 'branch', status: 'Active', name: 'Main' }]),
          teachers: vi.fn().mockResolvedValue([{ teacherId: 'teacher', userId: 'user' }]),
        },
      },
      {
        provide: SessionStore,
        useValue: {
          session: signal({ schoolId: 'school', name: 'My Name' }),
          profile: signal({ userId: 'user' }),
        },
      },
      { provide: Feedback, useValue: feedback },
    ],
  });
  TestBed.overrideComponent(VehiclesPage, { set: { template: '' } });
  return { page: TestBed.createComponent(VehiclesPage).componentInstance, api, feedback };
}
describe('Vehicle administration', () => {
  it('loads school-specific resources and creates a validated normalized vehicle', async () => {
    const { page, api } = setup();
    await page.data.load();
    expect(api.list).toHaveBeenCalledWith('school');
    expect(page.branchName('branch')).toBe('Main');
    expect(page.teacherLabel('teacher')).toBe('My Name');
    page.openEdit('new');
    expect(page.form.controls.branchId.value).toBe('branch');
    await page.save();
    expect(api.create).not.toHaveBeenCalled();
    page.form.patchValue({
      registrationNumber: ' abc123 ',
      manufacturer: 'Toyota',
      model: 'Yaris',
      manufactureYear: 2020,
    });
    await page.save();
    expect(api.create).toHaveBeenCalledWith(
      'school',
      expect.objectContaining({ registrationNumber: 'ABC123', categories: ['B'] }),
      expect.any(String),
    );
    expect(page.editTarget()).toBeNull();
  });
  it('uses the updated revision for category changes and keeps the branch immutable', async () => {
    const { page, api } = setup();
    page.openEdit(vehicle);
    expect(page.form.controls.branchId.disabled).toBe(true);
    page.toggleCategory('BE');
    page.toggleCategory('B');
    await page.save();
    expect(api.update).toHaveBeenCalledWith(
      vehicle,
      expect.objectContaining({ registrationNumber: 'ABC123' }),
    );
    expect(api.categories).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }), ['BE']);
    expect(page.editTarget()).toBeNull();
  });
  it('does not send a redundant category update', async () => {
    const { page, api } = setup();
    page.openEdit(vehicle);
    await page.save();
    expect(api.update).toHaveBeenCalled();
    expect(api.categories).not.toHaveBeenCalled();
  });
  it('submits the selected teacher assignments', async () => {
    const { page, api } = setup();
    page.openAssign(vehicle);
    expect(page.teacherIds()).toEqual(['teacher']);
    page.toggleTeacher('teacher');
    page.toggleTeacher('another');
    await page.saveTeachers();
    expect(api.teachers).toHaveBeenCalledWith(vehicle, ['another']);
    expect(page.assignTarget()).toBeNull();
  });
  it('requires a reason and waits for authoritative state transition completion', async () => {
    const { page, api, feedback } = setup();
    page.stateTarget.set(vehicle);
    await page.changeState();
    expect(api.changeState).not.toHaveBeenCalled();
    page.stateForm.controls.reason.setValue('Unavailable');
    await page.changeState();
    expect(api.changeState).toHaveBeenCalledWith(
      vehicle,
      'Deactivate',
      'Unavailable',
      expect.any(String),
    );
    expect(api.stateChange).toHaveBeenCalledWith('vehicle', 'op');
    expect(page.operations()['vehicle'].status).toBe('Completed');
    expect(feedback.done).toHaveBeenCalledWith('Vehicle is now Inactive.');
  });
  it('reports a rejected activation rather than a successful state change', async () => {
    const { page, api, feedback } = setup();
    api.stateChange.mockResolvedValue({
      operationId: 'op',
      status: 'Rejected',
      errorCode: 'CONFLICT',
    });
    page.stateTarget.set({ ...vehicle, status: 'Inactive' });
    page.stateForm.controls.reason.setValue('Available');
    await page.changeState();
    expect(api.changeState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Inactive' }),
      'Reactivate',
      'Available',
      expect.any(String),
    );
    expect(feedback.fail).toHaveBeenCalledWith(expect.stringContaining('CONFLICT'));
    expect(page.operations()['vehicle'].status).toBe('Rejected');
  });
});
