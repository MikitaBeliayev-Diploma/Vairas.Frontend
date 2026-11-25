import { KnownAppointment } from '../../domain/models/assessment-models';
import { AssessmentDefinition } from '../../domain/models/programme-models';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LearningApi } from '../../domain/api/learning-api';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { ASSESSMENT_REASON_MAX, assessmentCodeMessages } from './assessment';
import {
  AssessmentAppointment,
  AssessmentAppointmentRequest,
  AssessmentResult,
  AssessmentResultRequest,
  AssessmentVersionHistory,
  AssessmentCorrectionRequest,
} from '../../domain/models/assessment-models';
import { CatalogAssessment } from '../../domain/models/school-models';
import { Readiness } from '../../domain/models/learning-models';
import { SchedulingOperation } from '../../domain/models/scheduling-models';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { problemOf } from '../records/theory-attendance';
import { AppointmentSubmission, AssessmentAppointmentForm } from './assessment-appointment-form';
import { AssessmentResultForm, AssessmentResultSubmission } from './assessment-result-form';

/** Turns a rejected assessment command into a safe, code-specific explanation. */
export function explainAssessmentError(error: unknown, fallback: string) {
  const problem = problemOf(error);
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  const reference = problem.correlationId ? ' Reference: ' + problem.correlationId + '.' : '';
  const known = problem.code ? assessmentCodeMessages[problem.code] : undefined;
  if (known) return known + reference;
  if (status === 0 || status >= 500)
    return (
      'The outcome is unknown. Submitting the same values again reuses the same Idempotency-Key, so nothing is duplicated.' +
      reference
    );
  if (status === 403) return 'You do not have permission for this action.' + reference;
  if (status === 404) return 'The enrollment or appointment is not available to you.' + reference;
  return fallback + reference;
}

/** True when a Scheduling assessment answer is an unfinished operation (HTTP 202 problem body). */
export function isPendingAnswer(value: unknown): boolean {
  return !value || typeof value !== 'object' || !('appointmentId' in value);
}

/**
 * US-010 (AC-024–AC-026) booking of an assessment appointment by an Administrator and
 * US-016 AC-040 / US-024 assessment results recorded by an Assessor. API mode only.
 */
@Component({
  selector: 'app-assessments-panel',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    Status,
    SchoolDatePipe,
    AssessmentAppointmentForm,
    AssessmentResultForm,
  ],
  templateUrl: './assessments-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentsPanel {
  readonly enrollmentId = input.required<string>();
  readonly availableDefinitions = input<AssessmentDefinition[]>([]);
  readonly readiness = input<Readiness | null>(null);
  readonly auth = inject(SessionStore);
  private readonly scheduling = inject(SchedulingApi);
  private readonly learning = inject(LearningApi);

  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  /** One Idempotency-Key per exact payload: an identical retry reuses it, changed values get a new one. */
  private bookingKey = '';
  private bookingPayload = '';
  private bookingRequest: AssessmentAppointmentRequest | null = null;
  private resultKey = '';
  private resultPayload = '';
  private cancelKey = '';
  private cancelPayload = '';
  readonly results = signal<AssessmentResult[]>([]);
  readonly resultsFailed = signal(false);
  readonly selectedResult = signal<AssessmentResult | null>(null);
  readonly history = signal<AssessmentVersionHistory[]>([]);
  readonly historyLoading = signal(false);
  readonly historyFailed = signal(false);
  private historyGeneration = 0;
  private correctionPayload = '';
  private correctionKey = '';
  readonly correctionMark = new FormControl<number | null>(null, [Validators.required]);
  readonly correctionReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });
  readonly correctionStatus = new FormControl<'Recorded' | 'Annulled'>('Recorded', {
    nonNullable: true,
  });
  /** A held result can be reviewed only against the authoritative invalidation time from the server. */
  readonly reviewing = computed(() => {
    const r = this.selectedResult();
    return r?.status === 'ReviewRequired' && !!r.readinessInvalidatedAt;
  });
  readonly canCorrectResult = computed(
    () =>
      this.isAssessor() &&
      (this.selectedResult()?.status === 'Recorded' || this.reviewing()) &&
      this.history().some(
        (h) => h.current && h.resultVersionId === this.selectedResult()?.resultVersionId,
      ),
  );
  readonly appointments = signal<KnownAppointment[]>([]);
  readonly busy = signal(false);
  readonly bookingError = signal('');
  readonly resultError = signal('');
  readonly pending = signal<SchedulingOperation | null>(null);
  readonly created = signal<AssessmentAppointment | null>(null);
  readonly cancelling = signal<KnownAppointment | null>(null);
  readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(ASSESSMENT_REASON_MAX)],
  });
  readonly isAdmin = computed(() => this.auth.has('Administrator'));
  readonly isAssessor = computed(
    () => this.auth.has('Instructor') && !!this.auth.session()?.assessor,
  );
  readonly enrollment = computed(() =>
    this.auth.enrollments().find((e) => e.enrollmentId === this.enrollmentId()),
  );
  readonly curriculum = computed(() => {
    const id = this.enrollment()?.programVersionId;
    return id ? this.auth.catalog()?.curricula?.[id] : undefined;
  });
  /** The approved, still valid readiness that authorises a (repeated) assessment, if any. */
  readonly approved = computed(() => {
    const r = this.readiness();
    return r && r.decision === 'Approved' && !r.invalidated && r.assessmentDefinitionVersionId
      ? r
      : null;
  });
  readonly approvedDefinition = computed(() => {
    const id = this.approved()?.assessmentDefinitionVersionId;
    return id ? this.definitions().find((a) => a.id === id) : undefined;
  });
  /** Practical assessments need a vehicle, theory ones must not have one; null when not visible. */
  readonly vehicleRequired = computed(() => {
    const kind = this.approvedDefinition()?.trainingKind;
    return kind === 'Practical' ? true : kind === 'Theory' ? false : null;
  });
  /** Assessments the assessor can choose: curriculum (Administrator only), readiness and past results. */
  readonly definitions = computed<CatalogAssessment[]>(() => {
    const map = new Map<string, CatalogAssessment>();
    for (const a of this.curriculum()?.assessments ?? []) map.set(a.id, a);
    for (const a of this.availableDefinitions())
      map.set(a.definitionVersionId, { ...a, id: a.definitionVersionId });
    const r = this.readiness();
    if (r?.assessmentDefinitionVersionId && !map.has(r.assessmentDefinitionVersionId))
      map.set(r.assessmentDefinitionVersionId, {
        id: r.assessmentDefinitionVersionId,
        name: 'Readiness-approved assessment',
        stage: 'Final',
      });
    for (const x of this.results())
      if (!map.has(x.assessmentDefinitionVersionId))
        map.set(x.assessmentDefinitionVersionId, {
          id: x.assessmentDefinitionVersionId,
          name: 'Assessment ' + x.assessmentDefinitionVersionId.slice(0, 8),
          stage: '',
        });
    return [...map.values()];
  });
  constructor() {
    effect(() => {
      const id = this.enrollmentId();
      untracked(() => {
        this.pending.set(null);
        this.created.set(null);
        this.bookingError.set('');
        this.resultError.set('');
        this.results.set([]);
        this.cancelling.set(null);
        this.closeHistory();
        void this.load(id);
      });
    });
  }
  closeHistory() {
    this.historyGeneration++;
    this.selectedResult.set(null);
    this.history.set([]);
    this.historyLoading.set(false);
    this.historyFailed.set(false);
  }
  async openHistory(result: AssessmentResult) {
    if (this.busy() || result.enrollmentId !== this.enrollmentId()) return;
    const generation = ++this.historyGeneration;
    this.selectedResult.set(result);
    this.history.set([]);
    this.historyFailed.set(false);
    this.historyLoading.set(true);
    this.resultError.set('');
    this.correctionMark.reset(result.mark);
    this.correctionReason.reset('');
    this.correctionStatus.reset('Recorded');
    try {
      const history = await this.learning.assessmentHistory(result.assessmentId);
      if (!this.destroy.destroyed && generation === this.historyGeneration)
        this.history.set(history);
    } catch {
      if (generation === this.historyGeneration) this.historyFailed.set(true);
    } finally {
      if (generation === this.historyGeneration) this.historyLoading.set(false);
    }
  }
  async correctResult() {
    const result = this.selectedResult();
    const version = this.history().find(
      (h) => h.current && h.resultVersionId === result?.resultVersionId,
    );
    const status = this.correctionStatus.value;
    const mark = status === 'Annulled' ? result?.mark : this.correctionMark.value;
    const reason = this.correctionReason.value.trim();
    this.correctionMark.markAsTouched();
    this.correctionReason.markAsTouched();
    if (!result || !version || !this.canCorrectResult() || this.busy()) return;
    const definition = this.definitions().find(
      (d) => d.id === result.assessmentDefinitionVersionId,
    );
    if (
      mark == null ||
      !Number.isInteger(mark) ||
      (definition?.minimumMark !== undefined && mark < definition.minimumMark) ||
      (definition?.maximumMark !== undefined && mark > definition.maximumMark) ||
      !reason ||
      this.correctionReason.invalid
    ) {
      this.resultError.set(
        'Enter a whole mark within the assessment scale and a correction reason.',
      );
      return;
    }
    const request: AssessmentCorrectionRequest = {
      expectedRevision: result.revision,
      mark,
      status,
      correctionReason: reason,
      topicMarks: version.topicMarks,
    };
    if (this.reviewing()) request.reviewedInvalidationAt = result.readinessInvalidatedAt;
    const payload = JSON.stringify([result.assessmentId, request]);
    if (payload !== this.correctionPayload) {
      this.correctionPayload = payload;
      this.correctionKey = crypto.randomUUID();
    }
    const generation = this.historyGeneration;
    this.busy.set(true);
    this.resultError.set('');
    try {
      const updated = await this.learning.reviseAssessment(
        result.assessmentId,
        request,
        this.correctionKey,
      );
      if (this.destroy.destroyed || generation !== this.historyGeneration) return;
      this.correctionPayload = '';
      this.feedback.done('Assessment correction saved as a new result version.');
      this.busy.set(false);
      await this.load();
      if (generation === this.historyGeneration) await this.openHistory(updated);
    } catch (error) {
      if (generation !== this.historyGeneration) return;
      this.resultError.set(explainAssessmentError(error, 'The correction was not recorded.'));
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.closeHistory();
        await this.load();
      }
    } finally {
      this.busy.set(false);
    }
  }
  definitionName(id: string) {
    return this.definitions().find((d) => d.id === id)?.name ?? 'Assessment ' + id.slice(0, 8);
  }
  async load(id = this.enrollmentId()) {
    const generation = ++this.generation;
    const current = () => !this.destroy.destroyed && generation === this.generation;
    this.appointments.set([]);
    this.resultsFailed.set(false);
    const [results] = await Promise.all([
      this.learning.assessments(id).catch(() => null),
      this.isAdmin() ? this.refreshAppointments(id, current) : Promise.resolve(),
    ]);
    if (!current()) return;
    if (results) this.results.set([...results].sort((a, b) => a.attemptNumber - b.attemptNumber));
    else {
      this.results.set([]);
      this.resultsFailed.set(true);
    }
  }
  readonly appointmentsFailed = signal(false);
  private async refreshAppointments(id: string, current: () => boolean) {
    this.appointmentsFailed.set(false);
    try {
      const rows = await this.scheduling.assessmentAppointments(id);
      if (current()) this.appointments.set(rows);
    } catch {
      if (current()) {
        this.appointments.set([]);
        this.appointmentsFailed.set(true);
      }
    }
  }
  async book(submission: AppointmentSubmission) {
    const readiness = this.approved();
    const enrollment = this.enrollment();
    if (!readiness || !enrollment || this.busy() || this.pending()) return;
    const request: AssessmentAppointmentRequest = {
      schoolId: enrollment.schoolId || this.auth.session()!.schoolId,
      enrollmentId: enrollment.enrollmentId,
      assessmentDefinitionVersionId: readiness.assessmentDefinitionVersionId!,
      readinessEvaluationId: readiness.evaluationId,
      teacherId: submission.teacherId,
      branchId: submission.branchId,
      startsAt: submission.startsAt,
      endsAt: submission.endsAt,
      reason: submission.reason,
      vehicleId: submission.vehicleId,
    };
    const payload = JSON.stringify(request);
    if (payload !== this.bookingPayload) {
      this.bookingPayload = payload;
      this.bookingKey = crypto.randomUUID();
    }
    this.bookingRequest = request;
    this.busy.set(true);
    this.bookingError.set('');
    try {
      await this.accept(await this.scheduling.scheduleAssessment(request, this.bookingKey));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : -1;
      const code = problemOf(error).code;
      // A lost response or an unexplained failure leaves the outcome unknown: reconcile by operation.
      if (status === 0 || (status >= 500 && (!code || !assessmentCodeMessages[code])))
        this.markPending();
      else
        this.bookingError.set(
          explainAssessmentError(error, 'The appointment was not booked. Review the details.'),
        );
    } finally {
      this.busy.set(false);
    }
  }
  private markPending() {
    this.pending.set({
      operationId: this.bookingKey,
      status: 'ReconciliationPending',
      lessonIds: [],
    });
  }
  private async accept(answer: unknown) {
    if (isPendingAnswer(answer)) {
      this.markPending();
      return;
    }
    const appointment = answer as AssessmentAppointment;
    const request = this.bookingRequest!;
    this.pending.set(null);
    this.created.set(appointment);
    await this.load(request.enrollmentId);
    this.bookingPayload = '';
    this.feedback.done('Assessment appointment booked.');
    // Read the stored allocation back so the user sees what Scheduling retained.
    const stored = await this.scheduling
      .assessmentAppointment(appointment.appointmentId)
      .catch(() => null);
    if (stored) this.created.set(stored);
  }
  /**
   * Checks the operation status under the same identity. A committed booking is fetched by replaying
   * the identical command with the same Idempotency-Key, which returns the saved appointment.
   */
  async reconcile() {
    const pending = this.pending();
    if (!pending || !this.bookingRequest || this.busy()) return;
    this.busy.set(true);
    try {
      const op = await this.scheduling.operation(pending.operationId);
      if (op.status === 'Committed')
        await this.accept(
          await this.scheduling.scheduleAssessment(this.bookingRequest, this.bookingKey),
        );
      else if (op.status === 'Rejected') {
        this.pending.set(null);
        this.bookingPayload = '';
        this.bookingError.set(
          (op.code && assessmentCodeMessages[op.code]) ||
            'Scheduling rejected the booking' + (op.code ? ' (' + op.code + ').' : '.'),
        );
      } else this.pending.set(op);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        // No operation was recorded: nothing was booked. An identical retry keeps the same key.
        this.pending.set(null);
        this.bookingError.set(
          'Scheduling has no record of this booking, so nothing was booked. Submit again to retry with the same Idempotency-Key.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
  startCancel(appointment: KnownAppointment) {
    this.cancelling.set(appointment);
    this.cancelReason.reset('');
  }
  async cancel() {
    const appointment = this.cancelling();
    this.cancelReason.markAsTouched();
    const reason = this.cancelReason.value.trim();
    if (!appointment || !reason || this.cancelReason.invalid || this.busy()) return;
    if (appointment.version === undefined) {
      this.bookingError.set('Reload the appointment before cancelling it.');
      return;
    }
    const payload = JSON.stringify([appointment.appointmentId, appointment.version, reason]);
    if (payload !== this.cancelPayload) {
      this.cancelPayload = payload;
      this.cancelKey = crypto.randomUUID();
    }
    this.busy.set(true);
    try {
      await this.scheduling.cancelAssessment(
        {
          appointmentId: appointment.appointmentId,
          schoolId: this.auth.session()!.schoolId,
          status: appointment.status ?? 'Scheduled',
          version: appointment.version,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
        },
        reason,
        this.cancelKey,
      );
      await this.load();
      this.cancelling.set(null);
      this.feedback.done('Assessment appointment cancelled. Readiness and results are unchanged.');
    } catch (error) {
      this.bookingError.set(
        explainAssessmentError(error, 'The appointment was not cancelled. Review the details.'),
      );
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.cancelling.set(null);
        await this.load();
      }
    } finally {
      this.busy.set(false);
    }
  }
  async record(submission: AssessmentResultSubmission) {
    const enrollment = this.enrollment();
    const schoolId = enrollment?.schoolId || this.auth.session()?.schoolId;
    if (!schoolId || this.busy()) return;
    const readiness = this.readiness();
    // A final assessment carries the current approved decision; other assessments carry none.
    const decisionId =
      !readiness?.invalidated &&
      readiness?.decision === 'Approved' &&
      readiness.decisionId &&
      readiness.assessmentDefinitionVersionId === submission.assessmentDefinitionVersionId
        ? readiness.decisionId
        : null;
    const request: AssessmentResultRequest = {
      schoolId,
      enrollmentId: this.enrollmentId(),
      assessmentDefinitionVersionId: submission.assessmentDefinitionVersionId,
      mark: submission.mark,
      assessedAt: submission.assessedAt,
      readinessDecisionId: decisionId,
      appointmentId: submission.appointmentId,
      comment: submission.comment,
    };
    const payload = JSON.stringify(request);
    if (payload !== this.resultPayload) {
      this.resultPayload = payload;
      this.resultKey = crypto.randomUUID();
    }
    this.busy.set(true);
    this.resultError.set('');
    try {
      const result = await this.learning.recordAssessment(request, this.resultKey);
      this.resultPayload = '';
      this.feedback.done(
        'Assessment result recorded: ' + result.outcome + ' (mark ' + result.mark + ').',
      );
      await this.load();
    } catch (error) {
      this.resultError.set(
        explainAssessmentError(error, 'The result was not recorded. Review the details.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
