import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LearningApi } from '../../domain/api/learning-api';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Lesson } from '../../domain/models/scheduling-models';
import { LessonSource, TheoryFacts } from '../../domain/models/learning-models';
import { Problem } from '../../domain/models/http-models';
import { physicalMinutes, TheoryRosterEntry } from './theory';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { TheoryAttendanceForm, TheoryAttendanceSubmission } from './theory-attendance-form';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Explanations for the Learning Tracking theory rule codes the teacher can act on. */
export const theoryCodeMessages: Record<string, string> = {
  THEORY_RECORD_EXISTS:
    'A theory record already exists for this lesson. Open it by its record ID instead of creating another.',
  ROSTER_MISMATCH:
    'The submitted learners differ from the retained group roster of this lesson (group changes after the lesson are not applied). Ask an administrator to check the group membership.',
  SOURCE_STALE:
    'The lesson changed after it was verified. The source was verified again; review the facts and submit again.',
  COMPLETED_SOURCE_REQUIRED:
    'Scheduling does not report this lesson as physically completed with a valid actual interval.',
  THEORY_SOURCE_REQUIRED: 'This lesson is not a theory lesson.',
  TRAINING_MINUTES_OUTSIDE_INTERVAL:
    'Teaching minutes must be greater than zero and within the actual interval.',
  DURATION_EXPLANATION_REQUIRED: 'Explain why fewer minutes than the actual interval were taught.',
  ROSTER_STUDENT_MISMATCH:
    'A learner on the roster does not match the enrolled student. Ask an administrator to check the enrollment.',
};

export function problemOf(error: unknown): Partial<Problem> {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as Partial<Problem>)
    : {};
}

@Component({
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PageHeader,
    AsyncState,
    Status,
    SchoolDatePipe,
    TheoryAttendanceForm,
  ],
  templateUrl: './theory-attendance.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TheoryAttendancePage {
  readonly lessonId = input.required<string>();
  readonly auth = inject(SessionStore);
  private readonly learning = inject(LearningApi);
  private readonly lessons = inject(LessonAdminApi);

  private readonly feedback = inject(Feedback);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  /** One Idempotency-Key per exact payload: a retry of the same facts reuses it, new facts get a new one. */
  private key = '';
  private payload = '';
  readonly lesson = signal<Lesson | null>(null);
  readonly source = signal<LessonSource | null>(null);
  readonly knownRecordId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly existingId = signal('');
  readonly askForExisting = signal(false);
  readonly roster = signal<TheoryRosterEntry[]>([]);
  readonly assigned = computed(() => {
    const teacherId = this.auth.profile()?.teacherId;
    return !!teacherId && this.lesson()?.teacherId === teacherId && this.auth.has('Instructor');
  });
  readonly minutes = computed(() => {
    const s = this.source();
    return s ? physicalMinutes(s.actualStart, s.actualEnd) : null;
  });
  /** Why attendance cannot be recorded here, or null when the form can be used. */
  readonly blocker = computed(() => {
    const lesson = this.lesson();
    if (!lesson) return null;
    if (lesson.kind !== 'Theory')
      return 'This is not a theory lesson. Practical lessons use practical records with dual confirmation.';
    if (lesson.status !== 'Completed')
      return 'Attendance can be recorded only after the assigned teacher records the physical completion of this lesson in Schedule.';
    if (!this.assigned())
      return 'Only the teacher assigned to this lesson can record its attendance.';
    if (!lesson.groupId) return 'This theory lesson has no group, so there is no roster to record.';
    const source = this.source();
    if (source && !source.physicallyCompleted)
      return 'Learning Tracking could not verify this lesson as physically completed.';
    if (source && this.minutes() === null)
      return 'The verified lesson source has no actual interval, so teaching minutes cannot be checked.';
    if (!this.roster().length)
      return 'None of the learners of this group are visible to you, so the roster cannot be completed. Ask an administrator to check the group membership.';
    return null;
  });
  constructor() {
    effect(() => {
      void this.load(this.lessonId());
    });
  }
  async load(id = this.lessonId()) {
    const generation = ++this.generation;
    const current = () => !this.destroy.destroyed && generation === this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.lesson.set(null);
    this.source.set(null);
    this.error.set('');
    this.knownRecordId.set(null);
    this.roster.set([]);
    try {
      const lesson = await this.lessons.lesson({ lessonId: id, kind: 'Theory' });
      if (!current()) return;
      this.lesson.set(lesson);
      if (lesson.kind === 'Theory' && lesson.status === 'Completed') {
        const records = await this.learning.theoryRecords(id);
        if (!current()) return;
        this.knownRecordId.set(records[0]?.recordId ?? null);
      }
      if (
        lesson.kind === 'Theory' &&
        lesson.status === 'Completed' &&
        this.assigned() &&
        !this.knownRecordId()
      ) {
        const historical = await this.learning.theoryRoster(id);
        if (!current()) return;
        this.roster.set(
          historical.participants.map((p) => ({
            ...p,
            name:
              this.auth.enrollments().find((e) => e.enrollmentId === p.enrollmentId)?.name ??
              'Learner ' + p.studentId.slice(0, 8),
          })),
        );
        const source = (await this.learning.source(id)) as LessonSource;
        if (current()) this.source.set(source);
      }
    } catch {
      if (current()) this.failed.set(true);
    } finally {
      if (current()) this.loading.set(false);
    }
  }
  async submit(submission: TheoryAttendanceSubmission) {
    const lesson = this.lesson();
    const source = this.source();
    if (!lesson || !source || this.blocker() || this.busy()) return;
    const facts: TheoryFacts = {
      schoolId: lesson.schoolId ?? this.auth.session()!.schoolId,
      lessonId: lesson.lessonId,
      sourceSnapshotId: source.sourceSnapshotId,
      trainingMinutes: submission.trainingMinutes,
      attendanceRows: submission.attendanceRows,
      durationExplanation: submission.durationExplanation,
    };
    const payload = JSON.stringify(facts);
    if (payload !== this.payload) {
      this.payload = payload;
      this.key = crypto.randomUUID();
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const record = await this.learning.createTheoryRecord(facts, this.key);

      this.feedback.done(
        'Theory attendance recorded. Confirm the record once so that present learners receive the minutes.',
      );
      await this.router.navigate(['/records/theory', record.recordId]);
    } catch (error) {
      await this.explain(error);
    } finally {
      this.busy.set(false);
    }
  }
  private async explain(error: unknown) {
    const problem = problemOf(error);
    const status = error instanceof HttpErrorResponse ? error.status : -1;
    const reference = problem.correlationId ? ' Reference: ' + problem.correlationId + '.' : '';
    if (status === 0 || status >= 500) {
      this.error.set(
        'The outcome is unknown. Submitting the same attendance again reuses the same Idempotency-Key, so no duplicate record is created.' +
          reference,
      );
      return;
    }
    const known = problem.code ? theoryCodeMessages[problem.code] : undefined;
    this.error.set(
      (known ??
        (status === 403
          ? 'Only the assigned teacher of this lesson can record its attendance.'
          : status === 404
            ? 'The lesson or one of its enrollments is not available to you.'
            : 'The attendance was not recorded. Review the details.')) + reference,
    );
    if (problem.code === 'THEORY_RECORD_EXISTS') this.askForExisting.set(true);
    if (problem.code === 'SOURCE_STALE') {
      const source = (await this.learning
        .source(this.lessonId())
        .catch(() => null)) as LessonSource | null;
      if (source) this.source.set(source);
    }
  }
  openExisting() {
    const id = this.existingId().trim();
    if (!UUID.test(id)) {
      this.error.set('Enter the record ID (UUID) of the existing theory record.');
      return;
    }
    void this.router.navigate(['/records/theory', id]);
  }
}
