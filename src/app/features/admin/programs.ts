import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgramApi } from '../../domain/api/program-api';
import { ProgramRegistry } from './program-registry';
import { SessionStore } from '../../core/session';
import { Curriculum, ProgramVersion, TrainingProgram } from '../../domain/models/programme-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { LICENSE_CATEGORIES, Mutations, Resource, isUuid } from '../../shared/resource';

/** Topic lines are "key | name"; a missing key is derived from the name. */
export function parseTopics(text: string, existing: Curriculum['topics'] = []) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !!line)
    .map((line) => {
      const [first, ...rest] = line.split('|').map((x) => x.trim());
      const name = rest.length ? rest.join(' | ') : first;
      const key = (rest.length ? first : first)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const previous = existing.find((t) => t.key === key || t.name === name);
      return { topicId: previous?.topicId ?? crypto.randomUUID(), key: key || 'topic', name };
    });
}

@Component({
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PageHeader,
    AsyncState,
    Status,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './programs.html',
})
export class ProgramsPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(ProgramApi);
  private readonly registry = inject(ProgramRegistry);
  private readonly fb = inject(FormBuilder);
  readonly m = new Mutations();
  readonly categories = LICENSE_CATEGORIES;
  readonly schoolId = computed(() => this.auth.session()?.schoolId ?? '');
  readonly data = new Resource<{ programs: TrainingProgram[]; versions: ProgramVersion[] }>(
    { programs: [], versions: [] },
    async () => {
      const programs = await this.api.list();
      const versions = await this.registry.versions(programs);
      return { programs, versions };
    },
  );
  readonly programOpen = signal(false);
  readonly editor = signal<{ program: TrainingProgram; version: ProgramVersion | null } | null>(
    null,
  );
  readonly trackOpen = signal(false);
  readonly programForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    categoryCode: ['B', Validators.required],
  });
  readonly trackForm = this.fb.nonNullable.group({ versionId: ['', Validators.required] });
  readonly form = this.fb.nonNullable.group({
    pathwayCode: ['standard', [Validators.required, Validators.maxLength(60)]],
    requiredTheoryMinutes: [1350, [Validators.required, Validators.min(0)]],
    requiredPracticalMinutes: [1350, [Validators.required, Validators.min(0)]],
    theoryMinutesPerUnit: [45, [Validators.required, Validators.min(1)]],
    practicalMinutesPerUnit: [45, [Validators.required, Validators.min(1)]],
    lessonMinutes: [45, [Validators.required, Validators.min(15)]],
    effectiveFrom: [new Date().toISOString().slice(0, 10), Validators.required],
    effectiveTo: [''],
    checklistVersionId: ['', Validators.required],
    topics: ['', Validators.required],
    assessmentName: ['Final assessment', Validators.required],
    assessmentKind: ['Practical' as 'Practical' | 'Theory', Validators.required],
    minimumMark: [0, Validators.required],
    maximumMark: [10, Validators.required],
    passingMark: [7, Validators.required],
    minimumPracticalMinutes: [1350, [Validators.required, Validators.min(0)]],
    ruleCode: ['', Validators.required],
    sourceUri: ['', [Validators.required, Validators.pattern(/^https:\/\//)]],
    edition: ['', Validators.required],
    applicability: ['', Validators.required],
    unitDescription: ['academic hour = 45 minutes', Validators.required],
    verified: [false],
  });
  ngOnInit() {
    void this.data.load();
  }
  versionsOf(program: TrainingProgram) {
    return this.data
      .value()
      .versions.filter((v) => v.programId === program.programId)
      .sort((a, b) => b.version - a.version);
  }
  async createProgram() {
    this.programForm.markAllAsTouched();
    if (this.programForm.invalid) return;
    const v = this.programForm.getRawValue();
    if (
      await this.m.run(
        () =>
          this.api.create(this.schoolId(), v.categoryCode, v.name.trim(), this.m.key('program')),
        'Programme created. Add its first curriculum version.',
        'program',
      )
    ) {
      this.programOpen.set(false);
      this.programForm.reset({ name: '', categoryCode: 'B' });
      await this.data.load();
    }
  }
  async track() {
    const id = this.trackForm.getRawValue().versionId.trim();
    if (!isUuid(id)) {
      this.trackForm.controls.versionId.setErrors({ uuid: true });
      return;
    }
    const found = await this.m.run(() => this.api.version(id));
    if (found) {
      this.trackOpen.set(false);
      this.trackForm.reset();
      await this.data.load();
    }
  }
  openEditor(program: TrainingProgram, version: ProgramVersion | null, copy = false) {
    const c = version?.curriculum;
    const a = c?.assessments[0];
    const s = c?.sources[0];
    const practical = c?.planningPolicies.find((p) => p.kind === 'Practical');
    this.form.reset({
      pathwayCode: c?.pathwayCode ?? 'standard',
      requiredTheoryMinutes: c?.requiredTheoryMinutes ?? 1350,
      requiredPracticalMinutes: c?.requiredPracticalMinutes ?? 1350,
      theoryMinutesPerUnit: c?.theoryMinutesPerUnit ?? 45,
      practicalMinutesPerUnit: c?.practicalMinutesPerUnit ?? 45,
      lessonMinutes: practical?.lessonMinutes ?? 45,
      effectiveFrom: c?.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      effectiveTo: c?.effectiveTo?.slice(0, 10) ?? '',
      checklistVersionId: c?.checklistVersionId ?? '',
      topics: (c?.topics ?? []).map((t) => t.key + ' | ' + t.name).join('\n'),
      assessmentName: a?.name ?? 'Final assessment',
      assessmentKind: a?.trainingKind ?? 'Practical',
      minimumMark: a?.minimumMark ?? 0,
      maximumMark: a?.maximumMark ?? 10,
      passingMark: a?.passingMark ?? 7,
      minimumPracticalMinutes:
        (a?.requirements.find((r) => r.kind === 'MinimumPracticalMinutes')
          ?.minimumMinutes as number) ??
        c?.requiredPracticalMinutes ??
        1350,
      ruleCode: s?.ruleCode ?? '',
      sourceUri: s?.sourceUri ?? '',
      edition: s?.edition ?? '',
      applicability: s?.applicability ?? '',
      unitDescription: s?.unitDescription ?? 'academic hour = 45 minutes',
      verified: s?.verified ?? false,
    });
    this.editor.set({ program, version: copy ? null : version });
    this.base = version;
  }
  private base: ProgramVersion | null = null;
  private curriculum(revision: number): Curriculum {
    const v = this.form.getRawValue();
    const prev = this.base?.curriculum;
    const topics = parseTopics(v.topics, prev?.topics);
    const a = prev?.assessments[0];
    const s = prev?.sources[0];
    const requirement = a?.requirements.find((r) => r.kind === 'MinimumPracticalMinutes');
    return {
      schoolId: this.schoolId(),
      expectedRevision: revision,
      pathwayCode: v.pathwayCode.trim(),
      requiredTheoryMinutes: Number(v.requiredTheoryMinutes),
      requiredPracticalMinutes: Number(v.requiredPracticalMinutes),
      theoryMinutesPerUnit: Number(v.theoryMinutesPerUnit),
      practicalMinutesPerUnit: Number(v.practicalMinutesPerUnit),
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo || null,
      checklistVersionId: v.checklistVersionId.trim(),
      topics,
      assessments: [
        {
          definitionId: a?.definitionId ?? crypto.randomUUID(),
          definitionVersionId: a?.definitionVersionId ?? crypto.randomUUID(),
          code: a?.code ?? 'final',
          name: v.assessmentName.trim(),
          trainingKind: v.assessmentKind,
          stage: 'Final',
          minimumMark: Number(v.minimumMark),
          maximumMark: Number(v.maximumMark),
          passingMark: Number(v.passingMark),
          requiredForCompletion: true,
          topicIds: topics.map((t) => t.topicId),
          requirements: [
            {
              requirementId: requirement?.requirementId ?? crypto.randomUUID(),
              code: requirement?.code ?? 'practical',
              kind: 'MinimumPracticalMinutes',
              minimumMinutes: Number(v.minimumPracticalMinutes),
            },
          ],
        },
        ...(prev?.assessments.slice(1) ?? []),
      ],
      sources: [
        {
          sourceId: s?.sourceId ?? crypto.randomUUID(),
          ruleCode: v.ruleCode.trim(),
          sourceUri: v.sourceUri.trim(),
          edition: v.edition.trim(),
          applicability: v.applicability.trim(),
          effectiveFrom: v.effectiveFrom,
          effectiveTo: v.effectiveTo || null,
          unitDescription: v.unitDescription.trim(),
          verified: v.verified,
        },
        ...(prev?.sources.slice(1) ?? []),
      ],
      planningPolicies: (['Theory', 'Practical'] as const).map((kind) => ({
        kind,
        lessonMinutes: Number(v.lessonMinutes),
        allowShortFinalLesson: true,
        minimumFinalLessonMinutes: 15,
      })),
    };
  }
  async saveVersion() {
    const target = this.editor();
    this.form.markAllAsTouched();
    if (!target || this.form.invalid) return;
    if (!isUuid(this.form.controls.checklistVersionId.value)) {
      this.form.controls.checklistVersionId.setErrors({ uuid: true });
      return;
    }
    const saved = await this.m.run(
      () =>
        target.version
          ? this.api.updateVersion(target.version, this.curriculum(target.version.revision))
          : this.api.createVersion(
              target.program.programId,
              this.curriculum(target.program.revision),
              this.m.key('version-' + target.program.programId),
            ),
      'Curriculum version saved as draft.',
      'version-' + target.program.programId,
    );
    if (saved) {
      this.editor.set(null);
      await this.data.load();
    }
  }
  async transition(version: ProgramVersion, transition: 'publish' | 'retire') {
    if (
      await this.m.run(
        () => this.api.transition(version, transition),
        transition === 'publish' ? 'Version published.' : 'Version retired.',
      )
    ) {
      await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
    }
  }
  copyId(id: string) {
    void navigator.clipboard?.writeText(id);
  }
}
