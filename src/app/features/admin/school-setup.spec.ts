import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SchoolSetupPage } from './school-setup';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Branch, Group, SchoolDetails } from '../../domain/models/school-models';
const school: SchoolDetails = {
  schoolId: 'school',
  name: 'Driving school',
  status: 'Active',
  revision: 1,
};
const branch: Branch = {
  branchId: 'branch',
  schoolId: 'school',
  name: 'Main',
  addressLine: null,
  city: 'Vilnius',
  postalCode: null,
  countryCode: 'LT',
  status: 'Active',
  revision: 1,
};
const group: Group = {
  groupId: 'group',
  schoolId: 'school',
  branchId: 'branch',
  name: 'Group B',
  categoryCode: 'B',
  startedAt: '2026-01-01',
  endedAt: null,
  revision: 1,
  membershipVersion: 1,
};
function setup() {
  const api = {
    school: vi.fn().mockResolvedValue(school),
    branches: vi
      .fn()
      .mockResolvedValue([branch, { ...branch, branchId: 'closed', status: 'Inactive' }]),
    groups: vi.fn().mockResolvedValue([group]),
    teachers: vi.fn().mockResolvedValue([{ teacherId: 'teacher', userId: 'user' }]),
    rename: vi.fn().mockResolvedValue(school),
    createBranch: vi.fn().mockResolvedValue(branch),
    updateBranch: vi.fn().mockResolvedValue(branch),
    branchStatus: vi.fn().mockResolvedValue(branch),
    createGroup: vi.fn().mockResolvedValue(group),
    renameGroup: vi.fn().mockResolvedValue(group),
    assignGroupTeacher: vi.fn().mockResolvedValue(group),
  };
  const auth = {
    session: signal({ schoolId: 'school', name: 'My Name' }),
    profile: signal({ userId: 'user' }),
    reloadCatalog: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [SchoolSetupPage],
    providers: [
      { provide: SchoolAdminApi, useValue: api },
      { provide: SessionStore, useValue: auth },
      { provide: Feedback, useValue: { done: vi.fn(), fail: vi.fn() } },
    ],
  });
  TestBed.overrideComponent(SchoolSetupPage, { set: { template: '' } });
  return { page: TestBed.createComponent(SchoolSetupPage).componentInstance, api, auth };
}
describe('School setup workflows', () => {
  it('loads school-scoped configuration and offers only active branches', async () => {
    const { page, api } = setup();
    await page.data.load();
    expect(api.school).toHaveBeenCalledWith('school');
    expect(page.activeBranches()).toEqual([branch]);
    expect(page.branchName('branch')).toBe('Main');
    expect(page.address(branch)).toBe('Vilnius, LT');
    expect(page.teacherLabel({ teacherId: 'teacher', userId: 'user' })).toBe('My Name');
  });
  it('validates and trims a school rename before refreshing authoritative data', async () => {
    const { page, api, auth } = setup();
    await page.data.load();
    page.openRename();
    expect(page.schoolForm.value.name).toBe('Driving school');
    page.schoolForm.controls.name.setValue('');
    await page.rename();
    expect(api.rename).not.toHaveBeenCalled();
    page.schoolForm.controls.name.setValue(' New name ');
    await page.rename();
    expect(api.rename).toHaveBeenCalledWith(school, 'New name');
    expect(page.renameOpen()).toBe(false);
    expect(auth.reloadCatalog).toHaveBeenCalled();
  });
  it('creates a branch with normalized optional fields and retries without changing the key', async () => {
    const { page, api } = setup();
    page.openBranch('new');
    page.branchForm.patchValue({ name: ' New branch ', countryCode: 'lt' });
    await page.saveBranch();
    expect(api.createBranch).not.toHaveBeenCalled();
    page.branchForm.patchValue({ countryCode: 'LT', city: ' Vilnius ' });
    api.createBranch.mockRejectedValueOnce(new Error('Network'));
    await page.saveBranch();
    expect(page.branchTarget()).toBe('new');
    await page.saveBranch();
    expect(api.createBranch).toHaveBeenCalledWith(
      'school',
      {
        name: 'New branch',
        addressLine: null,
        city: 'Vilnius',
        postalCode: null,
        countryCode: 'LT',
      },
      expect.any(String),
    );
    expect(api.createBranch.mock.calls[0]).toEqual(api.createBranch.mock.calls[1]);
    expect(page.branchTarget()).toBeNull();
  });
  it('updates an existing branch and toggles its state using server revision', async () => {
    const { page, api } = setup();
    page.openBranch(branch);
    page.branchForm.controls.name.setValue('Renamed');
    await page.saveBranch();
    expect(api.updateBranch).toHaveBeenCalledWith(
      branch,
      expect.objectContaining({ name: 'Renamed' }),
    );
    await page.toggleBranch(branch);
    expect(api.branchStatus).toHaveBeenCalledWith(branch, 'Inactive');
    await page.toggleBranch({ ...branch, status: 'Inactive' });
    expect(api.branchStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Inactive' }),
      'Active',
    );
  });
  it('creates groups and does not change immutable associations on rename', async () => {
    const { page, api } = setup();
    await page.data.load();
    page.openGroup('new');
    expect(page.groupForm.controls.branchId.value).toBe('branch');
    page.groupForm.controls.name.setValue(' New group ');
    await page.saveGroup();
    expect(api.createGroup).toHaveBeenCalledWith(
      'school',
      { name: 'New group', branchId: 'branch', categoryCode: 'B' },
      expect.any(String),
    );
    page.openGroup(group);
    expect(page.groupForm.controls.branchId.disabled).toBe(true);
    expect(page.groupForm.controls.categoryCode.disabled).toBe(true);
    page.groupForm.controls.name.setValue('Renamed');
    await page.saveGroup();
    expect(api.renameGroup).toHaveBeenCalledWith(group, 'Renamed');
    page.openGroup('new');
    expect(page.groupForm.controls.branchId.enabled).toBe(true);
  });
  it('assigns the selected teacher and refreshes the group configuration', async () => {
    const { page, api } = setup();
    await page.data.load();
    page.openTeacher(group);
    page.teacherForm.controls.teacherId.setValue('');
    await page.assignTeacher();
    expect(api.assignGroupTeacher).not.toHaveBeenCalled();
    page.teacherForm.controls.teacherId.setValue('teacher');
    await page.assignTeacher();
    expect(api.assignGroupTeacher).toHaveBeenCalledWith(group, 'teacher');
    expect(page.teacherTarget()).toBeNull();
  });
});
