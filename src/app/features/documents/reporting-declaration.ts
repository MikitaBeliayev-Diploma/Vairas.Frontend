import { DestroyRef } from '@angular/core';
import { SessionStore } from '../../core/session';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { LearningApi } from '../../domain/api/learning-api';
import { Feedback } from '../../core/feedback';
import { TrainingEvidence } from '../../domain/models/document-models';
import {
  DECLARATION_STATEMENT_MAX,
  KnownDeclaration,
  ReportingDeclarations,
  declarationStatementError,
} from './reporting';
import { SchoolDatePipe } from '../../shared/school-date';

/**
 * US-016 AC-080: an Administrator records that external reporting (e.g. to Regitra) was performed
 * manually for a reviewed, published-ready internal completion report. Vairas transmits nothing; the
 * result is labelled a user-recorded declaration with actor and time. API mode only.
 */
@Component({
  selector: 'app-reporting-declaration',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, InputTextModule, SchoolDatePipe],
  templateUrl: './reporting-declaration.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportingDeclarationPanel {
  readonly enrollmentId = input.required<string>();
  readonly snapshotId = input.required<string>();
  private readonly learning = inject(LearningApi);
  private readonly declarations = inject(ReportingDeclarations);

  private readonly feedback = inject(Feedback);
  readonly statementMax = DECLARATION_STATEMENT_MAX;
  readonly recorded = signal<KnownDeclaration[]>([]);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly evidence = signal<TrainingEvidence | null>(null);
  readonly evidenceUnavailable = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    statement: ['', [Validators.required]],
    acknowledged: [false, [Validators.requiredTrue]],
  });
  private readonly session = inject(SessionStore);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  readonly historyLoading = signal(false);
  readonly historyFailed = signal(false);
  constructor() {
    effect(() => {
      this.session.session();
      const snapshotId = this.snapshotId();
      const enrollmentId = this.enrollmentId();
      untracked(() => {
        void this.loadHistory(enrollmentId, snapshotId);
      });
    });
  }
  async loadHistory(enrollmentId = this.enrollmentId(), snapshotId = this.snapshotId()) {
    const generation = ++this.generation;
    const session = this.session.session();
    const current = () =>
      generation === this.generation &&
      !this.destroy.destroyed &&
      session === this.session.session();
    this.recorded.set([]);
    this.historyLoading.set(true);
    this.historyFailed.set(false);
    try {
      const rows = await this.learning.reportingDeclarations(enrollmentId);
      if (!current()) return;
      this.recorded.set(
        rows
          .filter((row) => row.snapshotId === snapshotId)
          .map((row) => ({
            ...row,
            enrollmentId,
            actorName: row.actorUserId,
          })),
      );
    } catch {
      if (current()) this.historyFailed.set(true);
    } finally {
      if (current()) this.historyLoading.set(false);
    }
  }
  async start() {
    this.form.reset({ statement: '', acknowledged: false });
    this.error.set('');
    this.evidence.set(null);
    this.evidenceUnavailable.set(false);
    this.open.set(true);
    // Show which evidence snapshot the declaration references and whether it is still current.
    try {
      this.evidence.set(await this.learning.trainingEvidence(this.snapshotId()));
    } catch {
      this.evidenceUnavailable.set(true);
    }
  }
  statementError() {
    const control = this.form.controls.statement;
    return control.touched ? declarationStatementError(control.value) : null;
  }
  async submit() {
    this.form.markAllAsTouched();
    if (this.busy()) return;
    const v = this.form.getRawValue();
    this.error.set('');
    this.busy.set(true);
    try {
      const declaration = await this.declarations.declare(
        this.enrollmentId(),
        this.snapshotId(),
        v.statement,
        v.acknowledged,
      );
      await this.loadHistory();
      if (!this.recorded().some((d) => d.declarationId === declaration.declarationId))
        this.recorded.update((list) => [...list, declaration]);
      this.open.set(false);
      this.feedback.done(
        'User-recorded declaration saved. Vairas did not transmit anything to Regitra.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The declaration was not recorded.');
    } finally {
      this.busy.set(false);
    }
  }
}
