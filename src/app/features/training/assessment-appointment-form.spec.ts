import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { AssessmentAppointmentForm } from './assessment-appointment-form';

function setup(vehicleRequired: boolean | null) {
  TestBed.configureTestingModule({ imports: [AssessmentAppointmentForm] });
  const fixture = TestBed.createComponent(AssessmentAppointmentForm);
  fixture.componentRef.setInput('teachers', [{ id: 't1', name: 'Assessor' }]);
  fixture.componentRef.setInput('branches', [{ id: 'b1', name: 'Main' }]);
  fixture.componentRef.setInput('vehicles', [{ id: 'v1', label: 'ABC123' }]);
  fixture.componentRef.setInput('defaultBranchId', 'b1');
  fixture.componentRef.setInput('vehicleRequired', vehicleRequired);
  fixture.detectChanges();
  const emit = vi.fn();
  fixture.componentInstance.submitted.subscribe(emit);
  return { fixture, form: fixture.componentInstance.form, emit };
}

describe('AssessmentAppointmentForm', () => {
  it('requires a reason and shows the validation message', () => {
    const { fixture, form, emit } = setup(false);
    expect(form.controls.branchId.value).toBe('b1');
    form.patchValue({ teacherId: 't1', startsAt: '2099-01-15T10:00', reason: '   ' });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('reason');
  });
  it('requires a vehicle for a practical assessment and emits UTC instants', () => {
    const { fixture, form, emit } = setup(true);
    form.patchValue({
      teacherId: 't1',
      startsAt: '2099-01-15T10:00',
      duration: 60,
      reason: 'Retake',
    });
    fixture.componentInstance.submit();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('vehicle');
    form.patchValue({ vehicleId: 'v1' });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith({
      teacherId: 't1',
      branchId: 'b1',
      vehicleId: 'v1',
      startsAt: '2099-01-15T08:00:00.000Z',
      endsAt: '2099-01-15T09:00:00.000Z',
      reason: 'Retake',
    });
  });
  it('hides the vehicle for a theory assessment and rejects a cross-midnight interval', () => {
    const { fixture, form, emit } = setup(false);
    expect(fixture.nativeElement.querySelector('#appointment-vehicle')).toBeNull();
    form.patchValue({
      teacherId: 't1',
      startsAt: '2099-01-15T23:30',
      duration: 60,
      reason: 'Extra',
    });
    fixture.componentInstance.submit();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('same Vilnius day');
    form.patchValue({ startsAt: '2099-01-15T10:00', vehicleId: 'v1' });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: null }));
  });
});
