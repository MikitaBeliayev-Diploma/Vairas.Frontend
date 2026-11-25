import { KnownAppointment } from '../../domain/models/assessment-models';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ASSESSMENT_COMMENT_MAX, UUID, assessmentResultError } from './assessment';
import { CatalogAssessment } from '../../domain/models/school-models';
import { SchoolDatePipe, localValue, schoolTimeToUtc } from '../../shared/school-date';

export interface AssessmentResultSubmission {
  assessmentDefinitionVersionId: string;
  mark: number;
  assessedAt: string;
  appointmentId: string | null;
  comment: string | null;
}

/**
 * US-016 AC-040 / US-024: the assessor records the mark of a performed assessment. The outcome
 * (Passed/Failed) is derived by Learning Tracking from the pinned passing mark; it is previewed only
 * when the scale is visible to the caller.
 */
@Component({
  selector: 'app-assessment-result-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SchoolDatePipe],
  templateUrl: './assessment-result-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentResultForm {
  readonly definitions = input.required<CatalogAssessment[]>();
  readonly appointments = input<KnownAppointment[]>([]);
  readonly busy = input(false);
  readonly submitted = output<AssessmentResultSubmission>();
  readonly error = signal('');
  readonly commentMax = ASSESSMENT_COMMENT_MAX;
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    definitionId: this.fb.nonNullable.control(''),
    mark: this.fb.control<number | null>(null),
    assessedAt: this.fb.nonNullable.control(localValue(new Date())),
    appointmentId: this.fb.nonNullable.control(''),
    manualAppointmentId: this.fb.nonNullable.control(''),
    comment: this.fb.nonNullable.control(''),
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly definition = computed(() =>
    this.definitions().find((d) => d.id === this.values().definitionId),
  );
  /** The marking scale, when the definition is visible to the caller (Administrator curricula). */
  readonly scale = computed(() => {
    const d = this.definition();
    return d?.passingMark !== undefined &&
      d.minimumMark !== undefined &&
      d.maximumMark !== undefined
      ? d
      : null;
  });
  /** Preview of the service-derived outcome when the passing mark is known. */
  readonly outcome = computed(() => {
    const d = this.definition();
    const mark = this.values().mark;
    if (d?.passingMark === undefined || mark === null || mark === undefined) return null;
    return Number(mark) >= d.passingMark ? 'Passed' : 'Failed';
  });
  readonly selectableAppointments = computed(() =>
    this.appointments().filter(
      (a) =>
        a.status !== 'Cancelled' &&
        (!this.values().definitionId ||
          a.assessmentDefinitionVersionId === this.values().definitionId),
    ),
  );
  submit() {
    this.form.markAllAsTouched();
    this.error.set('');
    const v = this.form.getRawValue();
    let assessedAt: string | null = null;
    try {
      assessedAt = v.assessedAt ? schoolTimeToUtc(v.assessedAt) : null;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Enter a valid assessment time.');
      return;
    }
    const manual = v.appointmentId === '__manual';
    const appointmentId = manual ? v.manualAppointmentId.trim() : v.appointmentId;
    if (manual && !UUID.test(appointmentId)) {
      this.error.set('Enter the appointment ID (UUID) or choose “No appointment”.');
      return;
    }
    const appointment = this.appointments().find((a) => a.appointmentId === appointmentId) ?? null;
    const mark = v.mark === null || (v.mark as unknown) === '' ? null : Number(v.mark);
    const error = assessmentResultError(
      v.definitionId,
      this.definition(),
      mark,
      assessedAt,
      appointment,
      v.comment,
    );
    this.error.set(error ?? '');
    if (error || this.busy()) return;
    const comment = v.comment.trim();
    this.submitted.emit({
      assessmentDefinitionVersionId: v.definitionId,
      mark: mark!,
      assessedAt: assessedAt!,
      appointmentId: appointmentId || null,
      comment: comment || null,
    });
  }
}
