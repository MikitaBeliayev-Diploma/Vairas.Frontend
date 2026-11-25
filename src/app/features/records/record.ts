import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LearningApi } from '../../domain/api/learning-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { PracticalRecord } from '../../domain/models/learning-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { SchoolDatePipe } from '../../shared/school-date';
import { RecordReview } from './record-review';
@Component({
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PageHeader,
    AsyncState,
    SchoolDatePipe,
    RecordReview,
  ],
  templateUrl: './record.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordPage {
  readonly recordId = input.required<string>();
  readonly auth = inject(SessionStore);
  private readonly api = inject(LearningApi);
  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  readonly record = signal<PracticalRecord | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly editing = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    trainingMinutes: [50, [Validators.required, Validators.min(1)]],
    distanceKm: [0, [Validators.required, Validators.min(0)]],
    reason: ['', [Validators.required, Validators.maxLength(1000)]],
  });
  constructor() {
    effect(() => {
      void this.load(this.recordId());
    });
  }
  async load(id = this.recordId()) {
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.record.set(null);
    try {
      const record = await this.api.record(id);
      if (!this.destroy.destroyed && generation === this.generation) this.record.set(record);
    } catch {
      if (!this.destroy.destroyed && generation === this.generation) this.failed.set(true);
    } finally {
      if (!this.destroy.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  async confirm() {
    await this.perform(async () => {
      await this.api.confirm(this.record()!);
      this.feedback.done('Your confirmation was recorded for the exact fact version.');
      await this.load();
    });
  }
  async dispute(reason: string) {
    await this.perform(async () => {
      await this.api.dispute(this.record()!, reason);
      this.feedback.done(
        'Dispute recorded. These minutes do not count until corrected and reconfirmed.',
      );
      await this.load();
    });
  }
  edit() {
    this.form.patchValue({
      trainingMinutes: this.record()!.facts.trainingMinutes,
      distanceKm: this.record()!.facts.distanceKm,
      reason: '',
    });
    this.editing.set(true);
  }
  async revise() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    await this.perform(async () => {
      const record = this.record()!;
      const source = await this.api.source(record.facts.lessonId);
      const v = this.form.getRawValue();
      await this.api.revise(record, {
        ...record.facts,
        sourceSnapshotId: source.sourceSnapshotId,
        trainingMinutes: v.trainingMinutes,
        distanceKm: v.distanceKm,
        correctionReason: v.reason,
      });
      this.editing.set(false);
      this.feedback.done('A new fact version was created. Previous confirmations no longer count.');
      await this.load();
    });
  }
  private async perform(task: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await task();
    } catch {
      this.error.set(
        'The action could not be completed. Reload the record before reviewing it again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
