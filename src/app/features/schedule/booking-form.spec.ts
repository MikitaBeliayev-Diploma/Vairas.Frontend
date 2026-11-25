import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { Catalog } from '../../domain/models/school-models';
import { BookingForm, LESSON_REASON_MAX, bookingReason } from './booking-form';

const catalog: Catalog = {
  schools: [],
  enrollments: [
    {
      enrollmentId: 'e1',
      studentId: 'st1',
      schoolId: 's1',
      name: 'Alex',
      category: 'B',
      programVersionId: 'p1',
      groupId: 'g1',
      revision: 1,
      status: 'Active',
    },
  ],
  teachers: [{ id: 't1', name: 'Teacher' }],
  vehicles: [{ id: 'v1', label: 'Car' }],
  topics: [],
  programVersionId: 'p1',
  branchId: 'b1',
  assessmentDefinitionVersionId: '',
  groups: [{ id: 'g1', name: 'Group', categoryCode: 'B' }],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [BookingForm],
    providers: [{ provide: LessonAdminApi, useValue: { availability: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(BookingForm);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('schoolId', 's1');
  fixture.detectChanges();
  const booked = vi.fn();
  const theory = vi.fn();
  fixture.componentInstance.booked.subscribe(booked);
  fixture.componentInstance.bookedTheory.subscribe(theory);
  const form = fixture.componentInstance.form;
  form.patchValue({
    enrollmentId: 'e1',
    teacherId: 't1',
    vehicleId: 'v1',
    startsAt: '2099-01-15T10:00',
    duration: 45,
  });
  return { fixture, form, booked, theory };
}

describe('BookingForm reason (US-010 AC-024)', () => {
  it('omits a blank reason and sends a trimmed one', () => {
    expect(bookingReason('   ')).toBeUndefined();
    const { fixture, form, booked } = setup();
    form.patchValue({ reason: '   ' });
    fixture.componentInstance.submit();
    expect(booked).toHaveBeenCalledTimes(1);
    expect('reason' in booked.mock.calls[0][0]).toBe(false);
    form.patchValue({ reason: '  Additional lesson for outstanding night driving  ' });
    fixture.componentInstance.submit();
    expect(booked.mock.calls[1][0]).toMatchObject({
      enrollmentId: 'e1',
      reason: 'Additional lesson for outstanding night driving',
    });
  });
  it('rejects a reason longer than 500 characters after trimming', () => {
    const { fixture, form, booked } = setup();
    form.patchValue({ reason: '  ' + 'x'.repeat(LESSON_REASON_MAX) + '  ' });
    expect(form.controls.reason.valid).toBe(true);
    form.patchValue({ reason: 'x'.repeat(LESSON_REASON_MAX + 1) });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(booked).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('500');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('500');
  });
  it('offers the reason for practical lessons only and never sends it for theory', () => {
    const { fixture, form, theory } = setup();
    expect(fixture.nativeElement.querySelector('#booking-reason')).not.toBeNull();
    form.patchValue({ reason: 'x'.repeat(LESSON_REASON_MAX + 1), groupId: 'g1' });
    fixture.componentInstance.setKind('Theory');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#booking-reason')).toBeNull();
    fixture.componentInstance.submit();
    expect(theory).toHaveBeenCalledTimes(1);
    expect('reason' in theory.mock.calls[0][0]).toBe(false);
  });
});
