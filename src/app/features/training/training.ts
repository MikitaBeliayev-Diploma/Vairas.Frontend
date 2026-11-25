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
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { LearningApi } from '../../domain/api/learning-api';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { Feedback } from '../../core/feedback';
import { Lesson } from '../../domain/models/scheduling-models';
import { PracticalRecord, Progress, Readiness } from '../../domain/models/learning-models';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
import { AsyncState } from '../../shared/async-state';
import { SchoolDatePipe } from '../../shared/school-date';
import { AssessmentsPanel } from './assessments-panel';
@Component({
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DialogModule,
    PageHeader,
    Status,
    AsyncState,
    SchoolDatePipe,
    AssessmentsPanel,
  ],
  templateUrl: './training.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingPage {
  readonly enrollmentId = input.required<string>();
  readonly auth = inject(SessionStore);
  readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(LearningApi);
  private readonly feedback = inject(Feedback);
  private readonly fb = inject(FormBuilder);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly progress = signal<Progress | null>(null);
  readonly records = signal<PracticalRecord[]>([]);
  readonly readiness = signal<(Readiness & { revision?: number }) | null>(null);
  readonly dialog = signal(false);
  readonly formError = signal('');
  readonly enrollment = computed(() =>
    this.auth.enrollments().find((e) => e.enrollmentId === this.enrollmentId()),
  );
  readonly curriculum = computed(() => {
    const id = this.enrollment()?.programVersionId;
    return id ? this.auth.catalog()?.curricula?.[id] : undefined;
  });
  /** Topics from the curriculum; teachers cannot read curricula, so known record topics are offered. */
  readonly topics = computed(() => {
    const fromCurriculum = this.curriculum()?.topics;
    if (fromCurriculum?.length) return fromCurriculum;
    const ids = [...new Set(this.records().flatMap((r) => r.facts.topicIds))];
    return ids.map((id) => ({ id, name: 'Topic ' + id.slice(0, 8) }));
  });
  readonly assessmentDefinitionId = signal('');
  readonly assessmentDefinitions = signal<AssessmentDefinition[]>([]);
  private readinessGeneration = 0;
  readonly selectedFinalAssessment = computed(
    () =>
      this.assessmentDefinitions().find(
        (d) => d.definitionVersionId === this.assessmentDefinitionId(),
      )?.stage === 'Final',
  );
  readonly availableLessons = computed(() =>
    this.workspace
      .lessons()
      .filter(
        (l) =>
          l.enrollmentId === this.enrollmentId() &&
          l.status === 'Completed' &&
          l.kind === 'Practical' &&
          !this.records().some((r) => r.facts.lessonId === l.lessonId),
      ),
  );
  readonly form = this.fb.nonNullable.group({
    lessonId: ['', Validators.required],
    trainingMinutes: [45, [Validators.required, Validators.min(1)]],
    distanceKm: [0, [Validators.required, Validators.min(0)]],
    topicId: ['', Validators.required],
    manualTopicId: [''],
  });
  readonly decisionForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1000)]],
  });
  constructor() {
    effect(() => {
      const id = this.enrollmentId();
      this.generation++;
      this.readinessGeneration++;
      this.progress.set(null);
      this.records.set([]);
      this.readiness.set(null);
      this.assessmentDefinitionId.set('');
      this.assessmentDefinitions.set([]);
      void this.load(id);
      void this.workspace.load();
    });
  }
  async load(id = this.enrollmentId()) {
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [progress, records, definitions] = await Promise.all([
        this.api.progress(id),
        this.api.records(id),
        this.api.assessmentDefinitions(id),
      ]);
      if (!this.destroy.destroyed && generation === this.generation) {
        this.progress.set(progress);
        this.records.set(records);
        this.assessmentDefinitions.set(definitions);
      }
    } catch {
      if (!this.destroy.destroyed && generation === this.generation) this.failed.set(true);
    } finally {
      if (!this.destroy.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  async create() {
    this.form.markAllAsTouched();
    this.formError.set('');
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      const l = this.availableLessons().find((l) => l.lessonId === v.lessonId);
      if (!l) throw new Error('Select a completed lesson without an existing record.');
      const topicId = v.topicId === '__manual' ? v.manualTopicId.trim() : v.topicId;
      if (!topicId || (v.topicId === '__manual' && !/^[0-9a-f-]{36}$/i.test(topicId)))
        throw new Error('Select a topic or enter a valid topic ID.');
      const source = await this.api.source(l.lessonId);
      const enrollment = this.enrollment()!;
      await this.api.create({
        schoolId: enrollment.schoolId,
        enrollmentId: enrollment.enrollmentId,
        lessonId: l.lessonId,
        programVersionId: enrollment.programVersionId,
        sourceSnapshotId: source.sourceSnapshotId,
        trainingMinutes: v.trainingMinutes,
        distanceKm: v.distanceKm,
        topicIds: [topicId],
      });
      this.dialog.set(false);
      this.form.reset({
        lessonId: '',
        trainingMinutes: 45,
        distanceKm: 0,
        topicId: '',
        manualTopicId: '',
      });
      await this.load();
      this.feedback.done('Practical record created. Review and confirm its current version.');
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Check the record facts.');
    } finally {
      this.busy.set(false);
    }
  }
  async selectAssessment(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    const definition = this.assessmentDefinitions().find((d) => d.definitionVersionId === id);
    this.assessmentDefinitionId.set(definition?.definitionVersionId ?? '');
    this.readiness.set(null);
    const generation = ++this.readinessGeneration;
    if (!definition) return;
    const enrollment = this.enrollmentId();
    try {
      const readiness = await this.api.readiness(enrollment, definition.definitionVersionId);
      if (
        !this.destroy.destroyed &&
        generation === this.readinessGeneration &&
        enrollment === this.enrollmentId()
      )
        this.readiness.set(readiness);
    } catch {
      /* HTTP interceptor reports the failure. */
    }
  }
  async evaluate() {
    const definition = this.assessmentDefinitionId();
    if (!definition || !this.selectedFinalAssessment() || this.busy()) return;
    const enrollment = this.enrollmentId();
    this.busy.set(true);
    try {
      const result = await this.api.evaluate(enrollment, definition);
      if (
        !this.destroy.destroyed &&
        enrollment === this.enrollmentId() &&
        definition === this.assessmentDefinitionId()
      )
        this.readiness.set(result);
    } catch {
      /* HTTP interceptor reports the failure. */
    } finally {
      this.busy.set(false);
    }
  }
  async decide(decision: 'Approved' | 'NotApproved') {
    this.decisionForm.markAllAsTouched();
    const readiness = this.readiness();
    if (
      !readiness ||
      this.decisionForm.invalid ||
      this.busy() ||
      readiness.invalidated ||
      readiness.enrollmentId !== this.enrollmentId() ||
      readiness.assessmentDefinitionVersionId !== this.assessmentDefinitionId()
    )
      return;
    if (readiness.revision === undefined) {
      this.feedback.fail('Evaluate prerequisites again before deciding.');
      return;
    }
    const generation = ++this.readinessGeneration;
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.readinessGeneration &&
      readiness.enrollmentId === this.enrollmentId() &&
      readiness.assessmentDefinitionVersionId === this.assessmentDefinitionId();
    this.busy.set(true);
    try {
      const result = await this.api.decide(
        readiness,
        readiness.revision,
        decision,
        this.decisionForm.getRawValue().reason,
      );
      if (!current()) return;
      this.readiness.set(result);
      this.decisionForm.reset();
      this.feedback.done('Readiness decision recorded.');
    } catch {
      // A conflict means the evaluation changed; reload the current one.
      if (current()) {
        const refreshed = await this.api
          .readiness(readiness.enrollmentId, readiness.assessmentDefinitionVersionId)
          .catch(() => null);
        if (current()) this.readiness.set(refreshed);
      }
    } finally {
      this.busy.set(false);
    }
  }
  lessonLabel(lesson: Lesson) {
    return (
      (lesson.title ?? 'Practical lesson') +
      ' · ' +
      new Date(lesson.startsAt).toLocaleDateString('en-GB', { timeZone: 'Europe/Vilnius' })
    );
  }
}
