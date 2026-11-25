import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { LearningApi } from '../../domain/api/learning-api';
import { ProgramApi } from '../../domain/api/program-api';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { ProgramRegistry } from './program-registry';
import { SessionStore } from '../../core/session';
import { Group, PlanningInputs, SchoolEnrollment } from '../../domain/models/school-models';
import { ProgramVersion } from '../../domain/models/programme-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { LICENSE_CATEGORIES, Mutations, Resource, isUuid, shortId } from '../../shared/resource';

interface EnrollmentData {
  enrollments: SchoolEnrollment[];
  groups: Group[];
  versions: ProgramVersion[];
  planning: PlanningInputs | null;
}

/** US-001 / US-002 / US-003: enrollments, group and programme assignment, planning inputs. */
@Component({
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    PageHeader,
    AsyncState,
    Status,
    SchoolDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './enrollments.html',
})
export class EnrollmentsAdminPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly school = inject(SchoolAdminApi);
  private readonly programs = inject(ProgramApi);
  private readonly learning = inject(LearningApi);
  private readonly registry = inject(ProgramRegistry);
  private readonly fb = inject(FormBuilder);
  readonly m = new Mutations();
  readonly categories = LICENSE_CATEGORIES;
  readonly terminalStatuses = ['Completed', 'Withdrawn', 'Transferred', 'Cancelled'];
  readonly shortId = shortId;
  readonly data = new Resource<EnrollmentData>(
    { enrollments: [], groups: [], versions: [], planning: null },
    async () => {
      const schoolId = this.schoolId();
      const [enrollments, groups, versions, planning] = await Promise.all([
        this.school.enrollments(schoolId),
        this.school.groups(schoolId),
        this.registry.versions(),
        this.school.planningInputs(schoolId),
      ]);
      return { enrollments, groups, versions, planning };
    },
  );
  readonly search = signal('');
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.data
      .value()
      .enrollments.filter(
        (e) =>
          !q ||
          (e.studentId + ' ' + e.enrollmentId + ' ' + e.licenseCategory + ' ' + e.status)
            .toLowerCase()
            .includes(q),
      );
  });
  readonly createOpen = signal(false);
  readonly assignTarget = signal<SchoolEnrollment | null>(null);
  readonly assignmentNotice = signal('');
  readonly assignmentPending = signal<{
    schoolId: string;
    operationId: string;
    enrollmentId: string;
  } | null>(null);
  readonly trainingNotice = signal('');
  readonly endTarget = signal<SchoolEnrollment | null>(null);
  readonly createForm = this.fb.nonNullable.group({
    studentId: ['', [Validators.required]],
    licenseCategory: ['B', Validators.required],
  });
  readonly assignForm = this.fb.nonNullable.group({
    groupId: ['', Validators.required],
    programVersionId: ['', Validators.required],
    pin: [true],
  });
  readonly endForm = this.fb.nonNullable.group({ status: ['Completed', Validators.required] });
  readonly publishedVersions = computed(() =>
    this.data.value().versions.filter((v) => v.status === 'Published'),
  );
  private schoolId() {
    return this.auth.session()?.schoolId ?? '';
  }
  ngOnInit() {
    void this.data.load();
  }
  groupName(id: string | null | undefined) {
    if (!id) return '—';
    return this.data.value().groups.find((g) => g.groupId === id)?.name ?? shortId(id);
  }
  versionLabel(id: string | null | undefined) {
    if (!id) return '—';
    const v = this.data.value().versions.find((x) => x.programVersionId === id);
    return v ? v.curriculum.pathwayCode + ' v' + v.version : shortId(id);
  }
  openAssign(e: SchoolEnrollment) {
    if (this.assignmentPending()) return;
    this.assignmentNotice.set('');
    this.assignForm.reset({
      groupId: e.groupId ?? '',
      programVersionId: e.programVersionId ?? this.publishedVersions()[0]?.programVersionId ?? '',
      pin: true,
    });
    this.assignTarget.set(e);
  }
  async create() {
    this.createForm.markAllAsTouched();
    const v = this.createForm.getRawValue();
    if (this.createForm.invalid) return;
    if (!isUuid(v.studentId)) {
      this.createForm.controls.studentId.setErrors({ uuid: true });
      return;
    }
    const done = await this.m.run(
      () =>
        this.school.createEnrollment(
          this.schoolId(),
          v.studentId.trim(),
          v.licenseCategory,
          this.m.key('create-enrollment'),
        ),
      'Enrollment created.',
      'create-enrollment',
    );
    if (done) {
      this.createOpen.set(false);
      this.createForm.reset({ studentId: '', licenseCategory: 'B' });
      await this.refresh();
    }
  }
  async assign() {
    const target = this.assignTarget();
    this.assignForm.markAllAsTouched();
    if (!target || this.assignForm.invalid || this.assignmentPending() || this.m.busy()) return;
    const v = this.assignForm.getRawValue();
    const scope = JSON.stringify([
      'assign',
      target.enrollmentId,
      target.version,
      v.groupId,
      v.programVersionId,
    ]);
    const key = this.m.key(scope);
    this.assignmentNotice.set('');
    const done = await this.m.run(async () => {
      const result = await this.school.assignGroup(target, v.groupId, v.programVersionId, key);
      if (result.state !== 'Committed') {
        this.assignmentPending.set({
          schoolId: target.schoolId,
          enrollmentId: target.enrollmentId,
          operationId: result.operationId,
        });
        this.assignmentNotice.set(
          'School assignment is not yet confirmed. Check the operation before continuing.',
        );
        return false;
      }
      this.m.forget(scope);
      this.assignmentNotice.set('School group and programme association saved.');
      this.assignTarget.set(null);
      return true;
    });
    if (done) {
      await this.refresh();
      if (v.pin) {
        const current = this.data
          .value()
          .enrollments.find((e) => e.enrollmentId === target.enrollmentId);
        if (current) await this.configureTraining(current);
      }
    } else if (done === undefined && !this.assignmentPending()) {
      this.assignmentNotice.set(
        'The school assignment was not confirmed. Retry the exact selection or reload the enrollment before changing it.',
      );
    }
  }
  async checkAssignment() {
    const pending = this.assignmentPending();
    if (!pending || this.m.busy()) return;
    await this.m.run(async () => {
      const result = await this.school.activationOperation(pending.schoolId, pending.operationId);
      this.assignmentNotice.set('School assignment status: ' + result.state);
      if (['Committed', 'Aborted', 'Rejected'].includes(result.state)) {
        this.assignmentPending.set(null);
        this.assignTarget.set(null);
        await this.refresh();
      }
    });
  }
  async configureTraining(e: SchoolEnrollment) {
    if (this.m.busy() || e.schoolId !== this.schoolId()) return;
    this.trainingNotice.set('Checking authoritative enrollment configuration…');
    const done = await this.m.run(async () => {
      const latest = await this.school.enrollment(e.schoolId, e.enrollmentId);
      if (!latest.groupId || !latest.programVersionId || latest.status !== 'Active') {
        this.trainingNotice.set('Assign an active group and applicable programme first.');
        return false;
      }
      const progress = await this.learning.progress(e.enrollmentId);
      // 'Assigned' alone does not prove the pinned version equals School's association: the idempotent
      // pin below re-validates it server-side (same version → confirmed, different → PROGRAMME_TRANSFER_UNSUPPORTED).
      if (progress.state !== 'AwaitingProgramme' && progress.state !== 'Assigned') {
        this.trainingNotice.set(
          'Training configuration could not be determined. No write was attempted.',
        );
        return false;
      }
      const scope = JSON.stringify([
        'pin',
        latest.schoolId,
        latest.enrollmentId,
        latest.programVersionId,
      ]);
      const result = await this.programs.startTraining(
        latest.schoolId,
        latest.enrollmentId,
        latest.programVersionId,
        this.m.key(scope),
      );
      if (result.programVersionId !== latest.programVersionId)
        throw new Error('Programme confirmation does not match the selected version.');
      this.m.forget(scope);
      this.trainingNotice.set(
        progress.state === 'Assigned'
          ? 'Learning Tracking confirms the selected programme version is already pinned.'
          : 'Training programme pinned in Learning Tracking.',
      );
      return true;
    });
    if (done === undefined)
      this.trainingNotice.set(
        'Training configuration was not confirmed. The school assignment is retained; use Check / configure training again to recover.',
      );
    if (done) await this.refresh();
  }
  async removeGroup(e: SchoolEnrollment) {
    if (await this.m.run(() => this.school.removeFromGroup(e), 'Removed from group.'))
      await this.refresh();
  }
  async end() {
    const target = this.endTarget();
    if (!target) return;
    const done = await this.m.run(
      () => this.school.terminateEnrollment(target, this.endForm.getRawValue().status),
      'Enrollment status updated.',
    );
    if (done) {
      this.endTarget.set(null);
      await this.refresh();
    }
  }
  private async refresh() {
    await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
  }
}
