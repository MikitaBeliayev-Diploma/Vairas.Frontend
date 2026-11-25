import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { AssessmentResultForm } from './assessment-result-form';

const DEF = '11111111-1111-4111-8111-111111111111';
const APPOINTMENT = '22222222-2222-4222-8222-222222222222';

function setup() {
  TestBed.configureTestingModule({ imports: [AssessmentResultForm] });
  const fixture = TestBed.createComponent(AssessmentResultForm);
  fixture.componentRef.setInput('definitions', [
    { id: DEF, name: 'Final', stage: 'Final', minimumMark: 0, maximumMark: 10, passingMark: 7 },
  ]);
  fixture.componentRef.setInput('appointments', [
    {
      appointmentId: APPOINTMENT,
      assessmentDefinitionVersionId: DEF,
      readinessEvaluationId: 'ev',
      teacherId: 't1',
      startsAt: '2026-01-15T08:00:00Z',
      endsAt: '2026-01-15T09:00:00Z',
    },
  ]);
  fixture.detectChanges();
  const emit = vi.fn();
  fixture.componentInstance.submitted.subscribe(emit);
  return { fixture, form: fixture.componentInstance.form, emit };
}

describe('AssessmentResultForm', () => {
  it('rejects a mark outside the visible scale and previews the derived outcome', () => {
    const { fixture, form, emit } = setup();
    form.patchValue({ definitionId: DEF, mark: 12, assessedAt: '2026-01-15T10:30' });
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'between 0 and 10',
    );
    form.patchValue({ mark: 6 });
    expect(fixture.componentInstance.outcome()).toBe('Failed');
    form.patchValue({ mark: 7 });
    expect(fixture.componentInstance.outcome()).toBe('Passed');
  });
  it('emits the result linked to the appointment with a UTC assessment time', () => {
    const { fixture, form, emit } = setup();
    form.patchValue({
      definitionId: DEF,
      mark: 8,
      assessedAt: '2026-01-15T10:30',
      appointmentId: APPOINTMENT,
      comment: '  Confident driving ',
    });
    fixture.componentInstance.submit();
    expect(emit).toHaveBeenCalledWith({
      assessmentDefinitionVersionId: DEF,
      mark: 8,
      assessedAt: '2026-01-15T08:30:00.000Z',
      appointmentId: APPOINTMENT,
      comment: 'Confident driving',
    });
  });
  it('requires the assessment time to lie within the appointment and a valid manual ID', () => {
    const { fixture, form, emit } = setup();
    form.patchValue({
      definitionId: DEF,
      mark: 8,
      assessedAt: '2026-01-15T12:30',
      appointmentId: APPOINTMENT,
    });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toContain('within the selected appointment');
    form.patchValue({ appointmentId: '__manual', manualAppointmentId: 'not-an-id' });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toContain('UUID');
    expect(emit).not.toHaveBeenCalled();
  });
});
