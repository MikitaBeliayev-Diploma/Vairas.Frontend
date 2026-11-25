import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ASSESSMENT_REASON_MAX, appointmentInterval } from './assessment';

export interface AppointmentSubmission {
  teacherId: string;
  branchId: string;
  vehicleId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string;
}
type Option = { id: string; name?: string; label?: string };

/**
 * US-010 booking of an assessment appointment. `vehicleRequired` is true for a practical assessment,
 * false for a theory assessment (Scheduling rejects a vehicle) and null when the kind is not visible.
 */
@Component({
  selector: 'app-assessment-appointment-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule],
  templateUrl: './assessment-appointment-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentAppointmentForm {
  readonly teachers = input.required<Option[]>();
  readonly branches = input.required<Option[]>();
  readonly vehicles = input.required<Option[]>();
  readonly defaultBranchId = input('');
  readonly vehicleRequired = input<boolean | null>(null);
  readonly busy = input(false);
  readonly locked = input(false);
  readonly submitted = output<AppointmentSubmission>();
  readonly error = signal('');
  readonly reasonMax = ASSESSMENT_REASON_MAX;
  readonly form = inject(FormBuilder).nonNullable.group({
    teacherId: ['', Validators.required],
    branchId: ['', Validators.required],
    vehicleId: [''],
    startsAt: ['', Validators.required],
    duration: [60, [Validators.required, Validators.min(15), Validators.max(240)]],
    reason: ['', [Validators.required, Validators.maxLength(ASSESSMENT_REASON_MAX)]],
  });
  constructor() {
    effect(() => {
      const branchId = this.defaultBranchId();
      untracked(() => {
        if (branchId && !this.form.controls.branchId.value)
          this.form.controls.branchId.setValue(branchId);
      });
    });
  }
  submit() {
    this.form.markAllAsTouched();
    this.error.set('');
    const v = this.form.getRawValue();
    try {
      if (!v.teacherId) throw new Error('Select the assessor.');
      if (!v.branchId) throw new Error('Select a branch.');
      const reason = v.reason.trim();
      if (!reason) throw new Error('Enter the reason for this assessment appointment.');
      if (reason.length > ASSESSMENT_REASON_MAX)
        throw new Error(`Use no more than ${ASSESSMENT_REASON_MAX} characters for the reason.`);
      if (this.vehicleRequired() === true && !v.vehicleId)
        throw new Error('A practical assessment needs a vehicle.');
      const interval = appointmentInterval(v.startsAt, Number(v.duration));
      if (this.busy() || this.locked()) return;
      this.submitted.emit({
        teacherId: v.teacherId,
        branchId: v.branchId,
        vehicleId: this.vehicleRequired() === false ? null : v.vehicleId || null,
        ...interval,
        reason,
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Check the appointment fields.');
    }
  }
}
