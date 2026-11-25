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
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import {
  Branch,
  BranchInput,
  Group,
  SchoolDetails,
  Teacher,
} from '../../domain/models/school-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { LICENSE_CATEGORIES, Mutations, Resource, shortId } from '../../shared/resource';

interface SetupData {
  school: SchoolDetails | null;
  branches: Branch[];
  groups: Group[];
  teachers: Teacher[];
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
  templateUrl: './school-setup.html',
})
export class SchoolSetupPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(SchoolAdminApi);
  private readonly fb = inject(FormBuilder);
  readonly m = new Mutations();
  readonly categories = LICENSE_CATEGORIES;
  readonly shortId = shortId;
  readonly data = new Resource<SetupData>(
    { school: null, branches: [], groups: [], teachers: [] },
    async () => {
      const id = this.auth.session()?.schoolId ?? '';
      const [school, branches, groups, teachers] = await Promise.all([
        this.api.school(id),
        this.api.branches(id),
        this.api.groups(id),
        this.api.teachers(id),
      ]);
      return { school, branches, groups, teachers };
    },
  );
  readonly activeBranches = computed(() =>
    this.data.value().branches.filter((b) => b.status === 'Active'),
  );
  readonly renameOpen = signal(false);
  readonly branchTarget = signal<Branch | 'new' | null>(null);
  readonly groupTarget = signal<Group | 'new' | null>(null);
  readonly teacherTarget = signal<Group | null>(null);
  readonly schoolForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
  });
  readonly branchForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    addressLine: [''],
    city: [''],
    postalCode: [''],
    countryCode: ['LT', Validators.pattern(/^[A-Z]{2}$|^$/)],
  });
  readonly groupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    branchId: [''],
    categoryCode: ['B'],
  });
  readonly teacherForm = this.fb.nonNullable.group({ teacherId: ['', Validators.required] });
  ngOnInit() {
    void this.data.load();
  }
  branchName(id: string | null) {
    return id
      ? (this.data.value().branches.find((b) => b.branchId === id)?.name ?? shortId(id))
      : '—';
  }
  address(b: Branch) {
    return (
      [b.addressLine, b.city, b.postalCode, b.countryCode].filter((x) => !!x).join(', ') ||
      'No address'
    );
  }
  teacherLabel(t: Teacher) {
    return t.userId === this.auth.profile()?.userId
      ? (this.auth.session()?.name ?? 'You')
      : 'Teacher ' + shortId(t.teacherId);
  }
  openRename() {
    this.schoolForm.reset({ name: this.data.value().school?.name ?? '' });
    this.renameOpen.set(true);
  }
  openBranch(branch: Branch | 'new') {
    this.branchForm.reset(
      branch === 'new'
        ? { name: '', addressLine: '', city: '', postalCode: '', countryCode: 'LT' }
        : {
            name: branch.name,
            addressLine: branch.addressLine ?? '',
            city: branch.city ?? '',
            postalCode: branch.postalCode ?? '',
            countryCode: branch.countryCode ?? '',
          },
    );
    this.branchTarget.set(branch);
  }
  openGroup(group: Group | 'new') {
    this.groupForm.reset(
      group === 'new'
        ? { name: '', branchId: this.activeBranches()[0]?.branchId ?? '', categoryCode: 'B' }
        : {
            name: group.name,
            branchId: group.branchId ?? '',
            categoryCode: group.categoryCode ?? '',
          },
    );
    if (group !== 'new') {
      this.groupForm.controls.branchId.disable();
      this.groupForm.controls.categoryCode.disable();
    } else {
      this.groupForm.controls.branchId.enable();
      this.groupForm.controls.categoryCode.enable();
    }
    this.groupTarget.set(group);
  }
  async rename() {
    const school = this.data.value().school;
    this.schoolForm.markAllAsTouched();
    if (!school || this.schoolForm.invalid) return;
    if (
      await this.m.run(
        () => this.api.rename(school, this.schoolForm.getRawValue().name.trim()),
        'School renamed.',
      )
    ) {
      this.renameOpen.set(false);
      await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
    }
  }
  async saveBranch() {
    const target = this.branchTarget();
    this.branchForm.markAllAsTouched();
    if (!target || this.branchForm.invalid) return;
    const v = this.branchForm.getRawValue();
    const input: BranchInput = {
      name: v.name.trim(),
      addressLine: v.addressLine.trim() || null,
      city: v.city.trim() || null,
      postalCode: v.postalCode.trim() || null,
      countryCode: v.countryCode.trim() || null,
    };
    const schoolId = this.auth.session()?.schoolId ?? '';
    const done = await this.m.run(
      () =>
        target === 'new'
          ? this.api.createBranch(schoolId, input, this.m.key('branch'))
          : this.api.updateBranch(target, input),
      'Branch saved.',
      'branch',
    );
    if (done) {
      this.branchTarget.set(null);
      await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
    }
  }
  async toggleBranch(branch: Branch) {
    const status = branch.status === 'Active' ? 'Inactive' : 'Active';
    if (
      await this.m.run(
        () => this.api.branchStatus(branch, status),
        'Branch ' + status.toLowerCase() + '.',
      )
    )
      await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
  }
  async saveGroup() {
    const target = this.groupTarget();
    this.groupForm.markAllAsTouched();
    if (!target || this.groupForm.invalid) return;
    const v = this.groupForm.getRawValue();
    const schoolId = this.auth.session()?.schoolId ?? '';
    const done = await this.m.run(
      () =>
        target === 'new'
          ? this.api.createGroup(
              schoolId,
              {
                name: v.name.trim(),
                branchId: v.branchId || null,
                categoryCode: v.categoryCode || null,
              },
              this.m.key('group'),
            )
          : this.api.renameGroup(target, v.name.trim()),
      'Group saved.',
      'group',
    );
    if (done) {
      this.groupTarget.set(null);
      await Promise.all([this.data.load(), this.auth.reloadCatalog()]);
    }
  }
  openTeacher(group: Group) {
    this.teacherForm.reset({ teacherId: this.data.value().teachers[0]?.teacherId ?? '' });
    this.teacherTarget.set(group);
  }
  async assignTeacher() {
    const group = this.teacherTarget();
    if (!group || this.teacherForm.invalid) return;
    if (
      await this.m.run(
        () => this.api.assignGroupTeacher(group, this.teacherForm.getRawValue().teacherId),
        'Teacher assigned to the group.',
      )
    ) {
      this.teacherTarget.set(null);
      await this.data.load();
    }
  }
}
