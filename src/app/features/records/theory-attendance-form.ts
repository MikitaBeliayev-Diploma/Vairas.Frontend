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
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TheoryAttendance, TheoryAttendanceRow } from '../../domain/models/learning-models';
import { TheoryRosterEntry } from './theory';

export interface TheoryAttendanceSubmission {
  trainingMinutes: number;
  durationExplanation: string | null;
  attendanceRows: TheoryAttendanceRow[];
}

/**
 * Mirrors the Learning Tracking theory rules so the teacher sees problems before submitting:
 * a complete roster, every learner Present or Absent (no partial attendance), whole teaching minutes
 * within the physical interval, and an explanation when fewer minutes than the interval were taught.
 */
export function theoryAttendanceError(
  roster: TheoryRosterEntry[],
  physicalMinutes: number,
  trainingMinutes: number | null,
  explanation: string,
  marks: (TheoryAttendance | null)[],
): string | null {
  if (!roster.length)
    return 'No learners are on this group roster, so attendance cannot be recorded.';
  if (marks.length !== roster.length || marks.some((m) => m !== 'Present' && m !== 'Absent'))
    return 'Mark every learner as Present or Absent. Partial attendance is not supported.';
  if (trainingMinutes === null || !Number.isInteger(trainingMinutes) || trainingMinutes < 1)
    return 'Enter whole teaching minutes greater than zero.';
  if (trainingMinutes > physicalMinutes)
    return `Teaching minutes cannot exceed the actual lesson interval (${physicalMinutes} min).`;
  if (trainingMinutes < physicalMinutes && !explanation.trim())
    return 'Explain why fewer minutes than the actual interval were taught.';
  if (explanation.length > 1000) return 'Use no more than 1000 characters for the explanation.';
  return null;
}

@Component({
  selector: 'app-theory-attendance-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule],
  templateUrl: './theory-attendance-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TheoryAttendanceForm {
  readonly roster = input.required<TheoryRosterEntry[]>();
  readonly physicalMinutes = input.required<number>();
  readonly busy = input(false);
  readonly initial = input<TheoryAttendanceSubmission | null>(null);
  readonly submitLabel = input('Submit theory attendance');
  readonly submitted = output<TheoryAttendanceSubmission>();
  readonly error = signal('');
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    trainingMinutes: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    durationExplanation: this.fb.nonNullable.control('', Validators.maxLength(1000)),
    attendance: this.fb.array<FormControl<TheoryAttendance | null>>([]),
  });
  constructor() {
    effect(() => {
      const roster = this.roster();
      const minutes = this.physicalMinutes();
      const initial = this.initial();
      untracked(() => {
        this.form.controls.attendance.clear();
        for (let i = 0; i < roster.length; i++)
          this.form.controls.attendance.push(
            this.fb.control<TheoryAttendance | null>(
              initial?.attendanceRows.find(
                (row) =>
                  row.enrollmentId === roster[i].enrollmentId &&
                  row.studentId === roster[i].studentId,
              )?.attendance ?? null,
              Validators.required,
            ),
          );
        this.form.patchValue({
          trainingMinutes: initial?.trainingMinutes ?? minutes,
          durationExplanation: initial?.durationExplanation ?? '',
        });
        this.error.set('');
      });
    });
  }
  /** Shortens the common case; each mark can still be changed before submitting. */
  markAll(value: TheoryAttendance) {
    for (const control of this.form.controls.attendance.controls) control.setValue(value);
  }
  presentCount() {
    return this.form.controls.attendance.controls.filter((c) => c.value === 'Present').length;
  }
  submit() {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    const error = theoryAttendanceError(
      this.roster(),
      this.physicalMinutes(),
      v.trainingMinutes,
      v.durationExplanation,
      v.attendance,
    );
    this.error.set(error ?? '');
    if (error || this.busy()) return;
    const explanation = v.durationExplanation.trim();
    this.submitted.emit({
      trainingMinutes: v.trainingMinutes!,
      durationExplanation: explanation || null,
      attendanceRows: this.roster().map((r, i) => ({
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        attendance: v.attendance[i]!,
      })),
    });
  }
}
