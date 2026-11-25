import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { PlanningForm } from './planning-form';
import { Catalog } from '../../domain/models/school-models';
const catalog: Catalog = {
  schools: [],
  enrollments: [
    {
      enrollmentId: 'e',
      studentId: 's',
      schoolId: 'school',
      name: 'Alex',
      category: 'B',
      programVersionId: 'program',
      groupId: 'group',
      revision: 1,
      status: 'Active',
    },
  ],
  teachers: [{ id: 'teacher', name: 'Teacher' }],
  vehicles: [{ id: 'vehicle', label: 'Car' }],
  topics: [],
  programVersionId: 'program',
  branchId: 'branch',
  assessmentDefinitionVersionId: 'assessment',
};
function setup() {
  TestBed.configureTestingModule({ imports: [PlanningForm] });
  const fixture = TestBed.createComponent(PlanningForm);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('schoolId', 'school');
  fixture.detectChanges();
  return fixture;
}
describe('PlanningForm', () => {
  it('rejects incomplete draft inputs and exposes an actionable validation message', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Select a learner',
    );
  });
  it('emits school-scoped UTC inputs and preserves enrollment and programme identity', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.form.patchValue({
      enrollmentIds: ['e'],
      teacherIds: ['teacher'],
      vehicleIds: ['vehicle'],
      startsAt: '2030-01-15T12:00',
      endsAt: '2030-01-15T13:00',
    });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school',
        programVersionId: 'program',
        enrollmentIds: ['e'],
        windows: [{ startsAt: '2030-01-15T10:00:00.000Z', endsAt: '2030-01-15T11:00:00.000Z' }],
      }),
    );
  });
  it('rejects a reversed time window without emitting a draft', () => {
    const fixture = setup();
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.form.patchValue({
      enrollmentIds: ['e'],
      teacherIds: ['teacher'],
      vehicleIds: ['vehicle'],
      startsAt: '2030-01-15T13:00',
      endsAt: '2030-01-15T12:00',
    });
    fixture.componentInstance.submit();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('end after');
  });
  it('serializes every selected resource without adding unselected group memberships', () => {
    const fixture = setup();
    fixture.componentRef.setInput('catalog', {
      ...catalog,
      enrollments: [...catalog.enrollments, { ...catalog.enrollments[0], enrollmentId: 'e2' }],
      teachers: [...catalog.teachers, { id: 'teacher2', name: 'Second teacher' }],
      vehicles: [...catalog.vehicles, { id: 'vehicle2', label: 'Second car' }],
      groups: [{ id: 'g2', name: 'Theory group', categoryCode: 'B' }],
    });
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.form.patchValue({
      enrollmentIds: ['e', 'e2'],
      teacherIds: ['teacher', 'teacher2'],
      vehicleIds: ['vehicle', 'vehicle2'],
      groupIds: ['g2'],
      startsAt: '2030-01-15T12:00',
      endsAt: '2030-01-15T13:00',
    });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentIds: ['e', 'e2'],
        teacherIds: ['teacher', 'teacher2'],
        vehicleIds: ['vehicle', 'vehicle2'],
        groupIds: ['g2'],
      }),
    );
  });
  it('restores all selected resources and availability windows from persisted draft inputs', () => {
    const fixture = setup();
    fixture.componentRef.setInput('initialInputs', {
      schoolId: 'school',
      programVersionId: 'program',
      enrollmentIds: ['e'],
      groupIds: [],
      teacherIds: ['teacher'],
      vehicleIds: ['vehicle'],
      planningStart: '2030-01-15',
      planningEnd: '2030-01-20',
      windows: [
        { startsAt: '2030-01-15T10:00:00.000Z', endsAt: '2030-01-15T11:00:00.000Z' },
        { startsAt: '2030-01-20T10:00:00.000Z', endsAt: '2030-01-20T11:00:00.000Z' },
      ],
    });
    fixture.detectChanges();
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentIds: ['e'],
        planningEnd: '2030-01-20',
        windows: [
          { startsAt: '2030-01-15T10:00:00.000Z', endsAt: '2030-01-15T11:00:00.000Z' },
          { startsAt: '2030-01-20T10:00:00.000Z', endsAt: '2030-01-20T11:00:00.000Z' },
        ],
      }),
    );
  });
  it('does not silently retain an obsolete window from restored inputs', () => {
    const fixture = setup();
    fixture.componentRef.setInput('initialInputs', {
      schoolId: 'school',
      windows: [{ startsAt: '2030-01-15T10:00:00.000Z', endsAt: '2030-01-15T11:00:00.000Z' }],
    });
    fixture.detectChanges();
    const emit = vi.fn();
    fixture.componentInstance.saved.subscribe(emit);
    fixture.componentInstance.form.patchValue({ startsAt: '', endsAt: '' });
    fixture.componentInstance.savePartial();
    expect(emit).toHaveBeenCalled();
    expect(emit.mock.calls[0][0].windows).toBeUndefined();
  });
  it('clears resources, dates, validation errors and extra windows on reset even without restored input', () => {
    const fixture = setup(),
      page = fixture.componentInstance;
    page.form.patchValue({
      enrollmentIds: ['e'],
      teacherIds: ['teacher'],
      startsAt: '2030-01-15T12:00',
    });
    page.addWindow();
    page.error.set('Old validation');
    fixture.componentRef.setInput('resetVersion', 1);
    fixture.detectChanges();
    expect(page.form.getRawValue()).toMatchObject({
      enrollmentIds: [],
      teacherIds: [],
      vehicleIds: [],
      groupIds: [],
      startsAt: '',
      endsAt: '',
    });
    expect(page.extraWindows.length).toBe(0);
    expect(page.error()).toBe('');
  });
});
