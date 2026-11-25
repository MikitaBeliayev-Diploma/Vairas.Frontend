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
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TheoryAttendanceForm, TheoryAttendanceSubmission } from './theory-attendance-form';
import { TheoryRosterEntry, physicalMinutes } from './theory';
import { LessonSource } from '../../domain/models/learning-models';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { LearningApi } from '../../domain/api/learning-api';
import { shortId } from '../../domain/api/school-api';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { Feedback } from '../../core/feedback';
import { TheoryRecord } from '../../domain/models/learning-models';
import { creditedMinutes } from './theory';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { problemOf } from './theory-attendance';

@Component({
  imports: [
    RouterLink,
    ButtonModule,
    PageHeader,
    AsyncState,
    Status,
    SchoolDatePipe,
    ReactiveFormsModule,
    InputTextModule,
    TheoryAttendanceForm,
  ],
  templateUrl: './theory-record.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TheoryRecordPage {
  readonly recordId = input.required<string>();
  readonly auth = inject(SessionStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(LearningApi);

  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  /** Confirmation keys per exact record revision, so a retry never confirms a different revision. */
  private readonly keys = new Map<string, string>();
  readonly record = signal<TheoryRecord | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly correction = signal<{
    source: LessonSource;
    roster: TheoryRosterEntry[];
    initial: TheoryAttendanceSubmission;
    minutes: number;
  } | null>(null);
  readonly correctionReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });
  private correctionKey = '';
  private correctionPayload = '';
  readonly canCorrect = computed(() => this.auth.has('Instructor') && !!this.record());
  readonly lesson = computed(() => {
    const id = this.record()?.facts.lessonId;
    return this.workspace.lessons().find((l) => l.lessonId === id) ?? null;
  });
  readonly rows = computed(() => {
    const record = this.record();
    if (!record) return [];
    const names = new Map(this.auth.enrollments().map((e) => [e.enrollmentId, e.name]));
    return record.facts.attendanceRows.map((row) => ({
      ...row,
      name: names.get(row.enrollmentId) ?? 'Learner ' + shortId(row.studentId),
      minutes: creditedMinutes(record, row.attendance),
    }));
  });
  readonly presentCount = computed(
    () => this.rows().filter((r) => r.attendance === 'Present').length,
  );
  readonly canConfirm = computed(
    () =>
      this.auth.has('Instructor') &&
      this.record()?.status === 'Pending' &&
      !this.record()?.confirmedAt,
  );
  constructor() {
    effect(() => {
      void this.load(this.recordId());
    });
    void this.workspace.load();
  }
  async load(id = this.recordId()) {
    const generation = ++this.generation;
    const current = () => !this.destroy.destroyed && generation === this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.record.set(null);
    this.correction.set(null);
    try {
      const record = await this.api.theoryRecord(id);
      if (!current()) return;
      this.record.set(record);
    } catch {
      if (current()) this.failed.set(true);
    } finally {
      if (current()) this.loading.set(false);
    }
  }
  async startCorrection() {
    const record = this.record();
    if (!record || !this.canCorrect() || this.busy()) return;
    const generation = this.generation;
    const current = () => !this.destroy.destroyed && generation === this.generation;
    this.busy.set(true);
    this.error.set('');
    try {
      const [source, historical] = await Promise.all([
        this.api.source(record.facts.lessonId),
        this.api.theoryRoster(record.facts.lessonId),
      ]);
      if (!current()) return;
      const minutes = physicalMinutes(source.actualStart, source.actualEnd);
      if (
        !source.physicallyCompleted ||
        minutes === null ||
        historical.schoolId !== record.facts.schoolId ||
        !historical.participants.length
      ) {
        this.error.set(
          'The completed lesson source or historical roster is not available for correction.',
        );
        return;
      }
      const names = new Map(this.auth.enrollments().map((e) => [e.enrollmentId, e.name]));
      this.correctionReason.reset('');
      this.correction.set({
        source,
        minutes,
        roster: historical.participants.map((p) => ({
          ...p,
          name: names.get(p.enrollmentId) ?? 'Learner ' + shortId(p.studentId),
        })),
        initial: {
          trainingMinutes: record.facts.trainingMinutes,
          durationExplanation: record.facts.durationExplanation ?? null,
          attendanceRows: record.facts.attendanceRows,
        },
      });
    } catch {
      if (current())
        this.error.set('Could not retrieve the authorized lesson facts for correction.');
    } finally {
      if (current()) this.busy.set(false);
    }
  }
  async revise(submission: TheoryAttendanceSubmission) {
    const record = this.record(),
      correction = this.correction();
    this.correctionReason.markAsTouched();
    const reason = this.correctionReason.value.trim();
    if (
      !record ||
      !correction ||
      !reason ||
      this.correctionReason.invalid ||
      this.busy() ||
      !this.canCorrect()
    )
      return;
    const generation = this.generation;
    const current = () => !this.destroy.destroyed && generation === this.generation;
    const facts = {
      schoolId: record.facts.schoolId,
      lessonId: record.facts.lessonId,
      sourceSnapshotId: correction.source.sourceSnapshotId,
      ...submission,
      correctionReason: reason,
    };
    const payload = JSON.stringify([record.recordId, record.revision, facts]);
    if (payload !== this.correctionPayload) {
      this.correctionPayload = payload;
      this.correctionKey = crypto.randomUUID();
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.api.reviseTheoryRecord(record, facts, this.correctionKey);
      if (!current()) return;
      this.record.set(updated);
      this.correction.set(null);
      this.correctionPayload = '';
      this.feedback.done(
        'Correction recorded. Confirm the new version before training credit is restored.',
      );
    } catch (error) {
      if (!current()) return;
      this.error.set(
        'Correction was not confirmed. Review any service error; retrying the same facts keeps the operation identity.',
      );
      if (error instanceof HttpErrorResponse && error.status === 409) await this.load();
    } finally {
      this.busy.set(false);
    }
  }
  async confirm() {
    const record = this.record();
    if (!record || !this.canConfirm() || this.busy()) return;
    const scope = record.recordId + ':' + record.revision;
    const key = this.keys.get(scope) ?? crypto.randomUUID();
    this.keys.set(scope, key);
    this.busy.set(true);
    this.error.set('');
    try {
      this.record.set(await this.api.confirmTheoryRecord(record, key));
      this.feedback.done(
        'Theory attendance confirmed. Present learners now receive the teaching minutes.',
      );
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : -1;
      const problem = problemOf(error);
      const reference = problem.correlationId ? ' Reference: ' + problem.correlationId + '.' : '';
      if (status === 0 || status >= 500)
        this.error.set(
          'The outcome is unknown. Confirming again reuses the same Idempotency-Key for this revision.' +
            reference,
        );
      else if (status === 409) {
        this.error.set(
          'The record or its lesson changed. It was reloaded; review it before confirming.' +
            reference,
        );
        await this.load();
      } else if (problem.code === 'ROSTER_MISMATCH')
        this.error.set(
          'The recorded learners no longer match the retained group roster of this lesson.' +
            reference,
        );
      else
        this.error.set(
          (status === 403
            ? 'Only the teacher assigned to this lesson can confirm its attendance.'
            : 'The confirmation was not recorded. Review the record.') + reference,
        );
    } finally {
      this.busy.set(false);
    }
  }
}
