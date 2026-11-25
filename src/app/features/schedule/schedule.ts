import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { Feedback } from '../../core/feedback';
import { Booking, Lesson, SchedulingOperation } from '../../domain/models/scheduling-models';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
import { AsyncState } from '../../shared/async-state';
import { SchoolDatePipe, localValue, schoolTimeToUtc } from '../../shared/school-date';
import { BookingForm, TheoryBooking } from './booking-form';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { HttpErrorResponse } from '@angular/common/http';

import { problemOf } from '../records/theory-attendance';

/** Booking-specific explanations for Scheduling codes the administrator can act on. */
export const bookingCodeMessages: Record<string, string> = {
  IDEMPOTENCY_KEY_REUSED:
    'This booking request was already sent with different details (for example another reason). Review the form and submit again — a new request identity is used.',
  VALIDATION_FAILED:
    'Scheduling rejected the booking fields. Check the values; an optional reason may have at most 500 characters.',
  REQUIREMENT_NOT_APPLICABLE:
    'Learning Tracking reports no outstanding practical requirement for this enrollment, so an additional lesson with a reason cannot be linked to it. Nothing was booked.',
  TRAINING_REQUIREMENT_UNAVAILABLE:
    'Outstanding requirements could not be verified right now. Nothing was booked; try again later.',
};
@Component({
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    TableModule,
    PageHeader,
    Status,
    AsyncState,
    SchoolDatePipe,
    BookingForm,
  ],
  templateUrl: './schedule.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage implements OnInit {
  readonly auth = inject(SessionStore);
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(SchedulingApi);
  private readonly lessonsAdmin = inject(LessonAdminApi);
  private readonly feedback = inject(Feedback);

  readonly search = signal('');
  readonly status = signal('All');
  readonly dialog = signal(false);
  readonly selected = signal<Lesson | null>(null);
  readonly action = signal<'reschedule' | 'cancel' | 'complete' | 'correct'>('reschedule');
  readonly busy = signal(false);
  readonly localError = signal('');
  readonly pending = signal<SchedulingOperation | null>(null);
  private key = '';
  /** Practical booking keeps one Idempotency-Key per exact payload (reason included). */
  private bookingKey = '';
  private bookingPayload = '';
  readonly bookingError = signal('');
  readonly changeForm = inject(FormBuilder).nonNullable.group({
    startsAt: [''],
    endsAt: [''],
    reason: ['', [Validators.required, Validators.maxLength(1000)]],
  });
  readonly filtered = computed(() =>
    this.store
      .lessons()
      .filter(
        (l) =>
          (this.status() === 'All' || l.status === this.status()) &&
          [l.title, l.teacherName, l.studentName, l.kind]
            .join(' ')
            .toLowerCase()
            .includes(this.search().toLowerCase()),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );
  ngOnInit() {
    void this.store.load();
  }
  open(lesson: Lesson, action: 'reschedule' | 'cancel' | 'complete' | 'correct') {
    this.selected.set(lesson);
    this.action.set(action);
    this.localError.set('');
    this.key = crypto.randomUUID();
    this.changeForm.reset({
      startsAt: localValue(
        new Date((action === 'correct' && lesson.actualStart) || lesson.startsAt),
      ),
      endsAt: localValue(new Date((action === 'correct' && lesson.actualEnd) || lesson.endsAt)),
      reason: action === 'complete' ? 'Completed by assigned instructor' : '',
    });
  }
  /**
   * An identical retry (same learner, resources, interval and reason) reuses the Idempotency-Key, so
   * a lost response cannot create a second lesson; any change — including the reason — gets a new key.
   */
  bookingKeyFor(booking: Booking) {
    const payload = JSON.stringify(booking);
    if (payload !== this.bookingPayload) {
      this.bookingPayload = payload;
      this.bookingKey = crypto.randomUUID();
    }
    return this.bookingKey;
  }
  async book(booking: Booking) {
    if (this.busy() || this.pending()) return;
    this.key = this.bookingKeyFor(booking);
    this.bookingError.set('');
    await this.mutate(async () => {
      let result: Lesson | SchedulingOperation;
      try {
        result = await this.api.book(booking, this.key);
      } catch (error) {
        const code = problemOf(error).code;
        if (error instanceof HttpErrorResponse && code && bookingCodeMessages[code]) {
          // Keep the dialog open; the next submit must use a fresh request identity.
          this.bookingPayload = '';
          this.bookingError.set(bookingCodeMessages[code]);
          return;
        }
        throw error;
      }
      if ('operationId' in result) {
        this.pending.set(result);
        return;
      }
      this.bookingPayload = '';
      this.dialog.set(false);
      this.feedback.done('Practical lesson booked.');
      await this.store.load();
    });
  }
  async bookTheory(booking: TheoryBooking) {
    if (this.busy() || this.pending()) return;
    this.key = crypto.randomUUID();
    await this.mutate(async () => {
      await this.lessonsAdmin.createTheory(
        {
          schoolId: booking.schoolId,
          branchId: booking.branchId,
          teacherId: booking.teacherId,
          groupId: booking.groupId,
          category: booking.category,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        },
        this.key,
      );
      this.dialog.set(false);
      this.feedback.done('Theory lesson booked for the group.');
      await this.store.load();
    });
  }
  canManage(lesson: Lesson) {
    return lesson.status === 'Scheduled' && this.auth.has('Administrator');
  }
  canComplete(lesson: Lesson) {
    return (
      lesson.status === 'Scheduled' &&
      this.auth.has('Instructor') &&
      Date.parse(lesson.startsAt) <= Date.now()
    );
  }
  canCorrect(lesson: Lesson) {
    return lesson.status === 'Completed' && this.auth.has('Administrator', 'Instructor');
  }
  /** US-012: only the assigned teacher records attendance, and only after physical completion. */
  canRecordTheory(lesson: Lesson) {
    const teacherId = this.auth.profile()?.teacherId;
    return (
      lesson.kind === 'Theory' &&
      lesson.status === 'Completed' &&
      this.auth.has('Instructor') &&
      !!teacherId &&
      lesson.teacherId === teacherId
    );
  }
  async change() {
    this.changeForm.markAllAsTouched();
    if (this.changeForm.invalid || this.busy() || this.pending()) return;
    this.localError.set('');
    await this.mutate(async () => {
      const l = this.selected()!;
      const v = this.changeForm.getRawValue();
      let result: Lesson | SchedulingOperation;
      if (this.action() === 'cancel') result = await this.api.cancel(l, v.reason, this.key);
      else {
        const start = schoolTimeToUtc(v.startsAt);
        const end = schoolTimeToUtc(v.endsAt);
        if (Date.parse(end) <= Date.parse(start)) throw new Error('End must be after start.');
        result =
          this.action() === 'complete'
            ? await this.api.complete(l, start, end)
            : this.action() === 'correct'
              ? await this.lessonsAdmin.correctInterval(l, start, end, v.reason)
              : await this.api.reschedule(l, start, end, v.reason, this.key);
      }
      if ('operationId' in result) {
        this.pending.set(result);
        return;
      }
      this.selected.set(null);
      this.feedback.done('Lesson updated.');
      await this.store.load();
    });
  }
  async reconcile() {
    if (!this.pending()) return;
    this.busy.set(true);
    try {
      const op = await this.api.operation(this.pending()!.operationId);
      this.pending.set(op);
      if (['Committed', 'Rejected'].includes(op.status)) {
        this.pending.set(null);
        this.selected.set(null);
        this.dialog.set(false);
        await this.store.load();
        this.feedback.done('Operation outcome: ' + op.status);
      }
    } catch {
      /* Global error is shown; preserve pending identity. */
    } finally {
      this.busy.set(false);
    }
  }
  private async mutate(task: () => Promise<void>) {
    this.busy.set(true);
    try {
      await task();
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 0 || error.status >= 500)
          this.pending.set({
            operationId: this.key,
            status: 'ReconciliationPending',
            lessonIds: [],
          });
        else if (error.status === 409) {
          this.selected.set(null);
          this.dialog.set(false);
          await this.store.load();
        }
      } else
        this.localError.set(error instanceof Error ? error.message : 'Check the lesson details.');
    } finally {
      this.busy.set(false);
    }
  }
}
