import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { VehicleApi } from '../../domain/api/vehicle-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Branch, Teacher } from '../../domain/models/school-models';
import { Vehicle, VehicleStateChange } from '../../domain/models/vehicle-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { LICENSE_CATEGORIES, Mutations, Resource, shortId } from '../../shared/resource';

const finalStates: VehicleStateChange['status'][] = ['Completed', 'Rejected', 'NeedsRecovery'];

@Component({
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    PageHeader,
    AsyncState,
    Status,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vehicles.html',
})
export class VehiclesPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(VehicleApi);
  private readonly school = inject(SchoolAdminApi);
  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  readonly m = new Mutations();
  readonly categories = LICENSE_CATEGORIES;
  readonly shortId = shortId;
  readonly schoolId = computed(() => this.auth.session()?.schoolId ?? '');
  readonly data = new Resource<{ vehicles: Vehicle[]; branches: Branch[]; teachers: Teacher[] }>(
    { vehicles: [], branches: [], teachers: [] },
    async () => {
      const [vehicles, branches, teachers] = await Promise.all([
        this.api.list(this.schoolId()),
        this.school.branches(this.schoolId()),
        this.school.teachers(this.schoolId()),
      ]);
      return { vehicles, branches, teachers };
    },
  );
  readonly editTarget = signal<Vehicle | 'new' | null>(null);
  readonly assignTarget = signal<Vehicle | null>(null);
  readonly stateTarget = signal<Vehicle | null>(null);
  /** Vehicle state changes run as a saga; pending operations are polled until final. */
  readonly operations = signal<Record<string, VehicleStateChange>>({});
  readonly form = this.fb.nonNullable.group({
    branchId: ['', Validators.required],
    registrationCountryCode: ['LT', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
    registrationNumber: ['', [Validators.required, Validators.maxLength(20)]],
    manufacturer: ['', [Validators.required, Validators.maxLength(100)]],
    model: ['', [Validators.required, Validators.maxLength(100)]],
    manufactureYear: [
      new Date().getFullYear(),
      [Validators.required, Validators.min(1950), Validators.max(2100)],
    ],
    transmission: ['Manual' as 'Manual' | 'Automatic', Validators.required],
    categories: [['B'] as string[], Validators.required],
  });
  readonly teacherIds = signal<string[]>([]);
  readonly stateForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });
  ngOnInit() {
    void this.data.load();
  }
  branchName(id: string) {
    return this.data.value().branches.find((b) => b.branchId === id)?.name ?? shortId(id);
  }
  teacherLabel(id: string) {
    const t = this.data.value().teachers.find((x) => x.teacherId === id);
    return t && t.userId === this.auth.profile()?.userId
      ? (this.auth.session()?.name ?? 'You')
      : 'Teacher ' + shortId(id);
  }
  openEdit(v: Vehicle | 'new') {
    const branchId = this.data.value().branches.find((b) => b.status === 'Active')?.branchId ?? '';
    this.form.reset(
      v === 'new'
        ? {
            branchId,
            registrationCountryCode: 'LT',
            registrationNumber: '',
            manufacturer: '',
            model: '',
            manufactureYear: new Date().getFullYear(),
            transmission: 'Manual',
            categories: ['B'],
          }
        : { ...v },
    );
    if (v === 'new') this.form.controls.branchId.enable();
    else this.form.controls.branchId.disable();
    this.editTarget.set(v);
  }
  toggleCategory(category: string) {
    const current = this.form.controls.categories.value;
    this.form.controls.categories.setValue(
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  }
  async save() {
    const target = this.editTarget();
    this.form.markAllAsTouched();
    if (!target || this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = {
      ...v,
      registrationNumber: v.registrationNumber.trim().toUpperCase(),
      manufactureYear: Number(v.manufactureYear),
    };
    const done = await this.m.run(
      async () => {
        if (target === 'new') return this.api.create(this.schoolId(), input, this.m.key('vehicle'));
        const { categories } = input;
        const details = {
          registrationCountryCode: input.registrationCountryCode,
          registrationNumber: input.registrationNumber,
          manufacturer: input.manufacturer,
          model: input.model,
          manufactureYear: input.manufactureYear,
          transmission: input.transmission,
        };
        let current = (await this.api.update(target, details)).resource ?? target;
        if (categories.join() !== target.categories.join())
          current = (await this.api.categories(current, categories)).resource ?? current;
        return current;
      },
      target === 'new'
        ? 'Vehicle added. New vehicles start inactive; activate it when ready.'
        : 'Vehicle saved.',
      'vehicle',
    );
    if (done) {
      this.editTarget.set(null);
      await this.data.load();
    }
  }
  openAssign(v: Vehicle) {
    this.teacherIds.set(v.teacherAssignments.map((a) => a.teacherId));
    this.assignTarget.set(v);
  }
  toggleTeacher(id: string) {
    this.teacherIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }
  async saveTeachers() {
    const v = this.assignTarget();
    if (!v) return;
    if (
      await this.m.run(() => this.api.teachers(v, this.teacherIds()), 'Teacher assignments saved.')
    ) {
      this.assignTarget.set(null);
      await this.data.load();
    }
  }
  async changeState() {
    const v = this.stateTarget();
    this.stateForm.markAllAsTouched();
    if (!v || this.stateForm.invalid) return;
    const type = v.status === 'Active' ? 'Deactivate' : 'Reactivate';
    const op = await this.m.run(
      () =>
        this.api.changeState(
          v,
          type,
          this.stateForm.getRawValue().reason,
          this.m.key('state-' + v.vehicleId),
        ),
      undefined,
      'state-' + v.vehicleId,
    );
    if (!op) return;
    this.stateTarget.set(null);
    this.stateForm.reset();
    this.operations.update((o) => ({ ...o, [v.vehicleId]: op }));
    await this.poll(v.vehicleId, op.operationId);
  }
  private async poll(vehicleId: string, operationId: string) {
    for (let attempt = 0; attempt < 30 && !this.destroy.destroyed; attempt++) {
      const op = await this.api.stateChange(vehicleId, operationId).catch(() => null);
      if (op) this.operations.update((o) => ({ ...o, [vehicleId]: op }));
      if (op && finalStates.includes(op.status)) {
        this.feedback[op.status === 'Completed' ? 'done' : 'fail'](
          op.status === 'Completed'
            ? 'Vehicle is now ' + (op.resultVehicleStatus ?? 'updated') + '.'
            : 'Vehicle state change ' +
                op.status +
                (op.errorCode ? ' (' + op.errorCode + ')' : '') +
                '.',
        );
        await this.data.load();
        return;
      }
      await new Promise((r) => setTimeout(r, Math.min(500 * (attempt + 1), 3000)));
    }
  }
}
