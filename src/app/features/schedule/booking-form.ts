import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { AvailabilitySlot, Booking } from '../../domain/models/scheduling-models';
import { Catalog } from '../../domain/models/school-models';
import { SchoolDatePipe, localValue, schoolTimeToUtc } from '../../shared/school-date';

/** Scheduling limit for the optional practical booking reason, counted after trimming. */
export const LESSON_REASON_MAX = 500;

/** Trimmed reason, or undefined when blank (Scheduling treats blank as omitted). */
export function bookingReason(value: string | null | undefined): string | undefined {
  const reason = (value ?? '').trim();
  return reason ? reason : undefined;
}

/** Rejects a reason longer than the Scheduling limit after trimming. */
export function trimmedMaxLength(max: number) {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const length = (control.value ?? '').trim().length;
    return length > max ? { maxlength: { requiredLength: max, actualLength: length } } : null;
  };
}

export interface TheoryBooking {
  kind: 'Theory';
  schoolId: string;
  branchId: string;
  teacherId: string;
  groupId: string;
  category: string;
  startsAt: string;
  endsAt: string;
}

@Component({
  selector: 'app-booking-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, SchoolDatePipe],
  templateUrl: './booking-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingForm {
  readonly catalog = input.required<Catalog>();
  readonly schoolId = input.required<string>();
  readonly busy = input(false);
  readonly locked = input(false);
  readonly booked = output<Booking>();
  readonly bookedTheory = output<TheoryBooking>();
  private readonly lessons = inject(LessonAdminApi);
  readonly kind = signal<'Practical' | 'Theory'>('Practical');
  readonly error = signal('');
  readonly slots = signal<AvailabilitySlot[] | null>(null);
  readonly searching = signal(false);
  readonly categories = computed(() => [
    ...new Set(
      this.catalog()
        .enrollments.map((e) => e.category)
        .concat(['B']),
    ),
  ]);
  readonly activeEnrollments = computed(() =>
    this.catalog().enrollments.filter((e) => e.status === 'Active'),
  );
  readonly form = inject(FormBuilder).nonNullable.group({
    branchId: [''],
    enrollmentId: [''],
    groupId: [''],
    category: ['B'],
    teacherId: ['', Validators.required],
    vehicleId: [''],
    startsAt: ['', Validators.required],
    duration: [45, [Validators.required, Validators.min(15), Validators.max(240)]],
    searchDay: [localValue(new Date(Date.now() + 86400000)).slice(0, 10)],
    reason: ['', trimmedMaxLength(LESSON_REASON_MAX)],
  });
  readonly reasonMax = LESSON_REASON_MAX;
  constructor() {
    effect(() => {
      const branchId = this.catalog().branchId;
      if (branchId && !this.form.controls.branchId.value)
        this.form.controls.branchId.setValue(branchId);
    });
  }
  setKind(kind: 'Practical' | 'Theory') {
    this.kind.set(kind);
    this.error.set('');
    this.slots.set(null);
  }
  private interval() {
    const v = this.form.getRawValue();
    const startsAt = schoolTimeToUtc(v.startsAt);
    const endsAt = new Date(Date.parse(startsAt) + Number(v.duration) * 60000).toISOString();
    if (Date.parse(startsAt) <= Date.now()) throw new Error('Choose a start time in the future.');
    return { startsAt, endsAt };
  }
  /** Asks Scheduling for free slots of the chosen teacher, learner and vehicle on one day. */
  async findSlots() {
    const v = this.form.getRawValue();
    const e = this.catalog().enrollments.find((x) => x.enrollmentId === v.enrollmentId);
    if (!v.teacherId || !v.branchId || !v.searchDay) {
      this.error.set('Select a branch, an instructor and a day first.');
      return;
    }
    this.error.set('');
    this.searching.set(true);
    try {
      const from = schoolTimeToUtc(v.searchDay + 'T06:00');
      const to = schoolTimeToUtc(v.searchDay + 'T22:00');
      const result = await this.lessons.availability(this.schoolId(), {
        branchId: v.branchId,
        teacherId: v.teacherId,
        category: this.kind() === 'Practical' ? (e?.category ?? v.category) : v.category,
        from,
        to,
        durationMinutes: Number(v.duration),
        enrollmentId: this.kind() === 'Practical' ? e?.enrollmentId : undefined,
        studentId: this.kind() === 'Practical' ? e?.studentId : undefined,
        vehicleId: this.kind() === 'Practical' ? v.vehicleId || undefined : undefined,
      });
      this.slots.set(result.slots.filter((s) => Date.parse(s.startsAt) > Date.now()).slice(0, 24));
    } catch {
      this.slots.set(null);
    } finally {
      this.searching.set(false);
    }
  }
  pick(slot: AvailabilitySlot) {
    this.form.controls.startsAt.setValue(localValue(new Date(slot.startsAt)));
  }
  submit() {
    this.form.markAllAsTouched();
    this.error.set('');
    const v = this.form.getRawValue();
    try {
      if (this.kind() === 'Practical' && this.form.controls.reason.invalid)
        throw new Error(`Use no more than ${LESSON_REASON_MAX} characters for the reason.`);
      // The reason is optional and applies to practical lessons only.
      const fieldsInvalid = Object.entries(this.form.controls).some(
        ([name, control]) => name !== 'reason' && control.invalid,
      );
      if (fieldsInvalid || !v.branchId) throw new Error('Complete all booking fields.');
      const { startsAt, endsAt } = this.interval();
      if (this.kind() === 'Theory') {
        if (!v.groupId) throw new Error('Select a group for the theory lesson.');
        this.bookedTheory.emit({
          kind: 'Theory',
          schoolId: this.schoolId(),
          branchId: v.branchId,
          teacherId: v.teacherId,
          groupId: v.groupId,
          category: v.category,
          startsAt,
          endsAt,
        });
        return;
      }
      const e = this.catalog().enrollments.find((x) => x.enrollmentId === v.enrollmentId);
      if (!e || !v.vehicleId) throw new Error('Select a learner and a vehicle.');
      const reason = bookingReason(v.reason);
      this.booked.emit({
        schoolId: this.schoolId(),
        branchId: v.branchId,
        enrollmentId: e.enrollmentId,
        studentId: e.studentId,
        teacherId: v.teacherId,
        vehicleId: v.vehicleId,
        category: e.category,
        startsAt,
        endsAt,
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Check the booking fields.');
    }
  }
}
