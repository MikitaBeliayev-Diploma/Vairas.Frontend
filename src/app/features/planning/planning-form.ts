import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  effect,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { Catalog } from '../../domain/models/school-models';
import { DraftInputSet } from '../../domain/models/scheduling-models';
import { localValue, schoolTimeToUtc } from '../../shared/school-date';
@Component({
  selector: 'app-planning-form',
  imports: [ReactiveFormsModule, ButtonModule, MultiSelectModule, InputTextModule],
  templateUrl: './planning-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningForm {
  readonly catalog = input.required<Catalog>();
  readonly schoolId = input.required<string>();
  readonly busy = input(false);
  readonly initialInputs = input<DraftInputSet | null>(null);
  readonly resetVersion = input(0);
  readonly saved = output<DraftInputSet>();

  readonly error = signal('');
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    enrollmentIds: this.fb.nonNullable.control<string[]>([]),
    groupIds: this.fb.nonNullable.control<string[]>([]),
    teacherIds: this.fb.nonNullable.control<string[]>([], Validators.required),
    vehicleIds: this.fb.nonNullable.control<string[]>([]),
    startsAt: ['', Validators.required],
    endsAt: ['', Validators.required],
    planningStart: [''],
    planningEnd: [''],
  });
  readonly extraWindows = this.fb.array<ReturnType<PlanningForm['windowGroup']>>([]);
  windowGroup(start = '', end = '') {
    return this.fb.nonNullable.group({
      startsAt: [start, Validators.required],
      endsAt: [end, Validators.required],
    });
  }
  addWindow() {
    this.extraWindows.push(this.windowGroup());
  }
  removeWindow(index: number) {
    this.extraWindows.removeAt(index);
  }
  constructor() {
    effect(() => {
      const initial = this.initialInputs();
      this.resetVersion();
      this.error.set('');
      this.extraWindows.clear();
      this.form.reset({
        enrollmentIds: [],
        groupIds: [],
        teacherIds: [],
        vehicleIds: [],
        startsAt: '',
        endsAt: '',
        planningStart: '',
        planningEnd: '',
      });
      if (!initial) return;
      this.extraWindows.clear();
      for (const window of initial.windows?.slice(1) ?? [])
        this.extraWindows.push(
          this.windowGroup(
            localValue(new Date(window.startsAt)),
            localValue(new Date(window.endsAt)),
          ),
        );
      this.form.patchValue({
        planningStart: initial.planningStart ?? '',
        planningEnd: initial.planningEnd ?? '',
        enrollmentIds: initial.enrollmentIds ?? [],
        groupIds: initial.groupIds ?? [],
        teacherIds: initial.teacherIds ?? [],
        vehicleIds: initial.vehicleIds ?? [],
        startsAt: initial.windows?.[0] ? localValue(new Date(initial.windows[0].startsAt)) : '',
        endsAt: initial.windows?.[0] ? localValue(new Date(initial.windows[0].endsAt)) : '',
      });
    });
  }
  savePartial() {
    this.serialize(false);
  }
  submit() {
    this.form.markAllAsTouched();
    this.serialize(true);
  }
  private serialize(complete: boolean) {
    if (this.busy()) return;
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const catalog = this.catalog();
      const enrollments = catalog.enrollments.filter((e) =>
        v.enrollmentIds.includes(e.enrollmentId),
      );
      if (
        enrollments.length !== v.enrollmentIds.length ||
        enrollments.some((e) => e.schoolId !== this.schoolId())
      )
        throw new Error('Select available enrollments from this school.');
      if (
        v.teacherIds.some((id) => !catalog.teachers.some((t) => t.id === id)) ||
        v.vehicleIds.some((id) => !catalog.vehicles.some((vehicle) => vehicle.id === id)) ||
        v.groupIds.some((id) => !catalog.groups?.some((group) => group.id === id))
      )
        throw new Error('Select resources available in this school.');
      const versions = [...new Set(enrollments.map((e) => e.programVersionId).filter(Boolean))];
      if (versions.length > 1)
        throw new Error('Choose enrollments with the same programme version for this request.');
      if (
        complete &&
        ((!v.enrollmentIds.length && !v.groupIds.length) ||
          !v.teacherIds.length ||
          !v.startsAt ||
          !v.endsAt)
      )
        throw new Error(
          'Select a learner or training group, instructors and a complete time window.',
        );
      const inputs: DraftInputSet = {
        schoolId: this.schoolId(),
        enrollmentIds: [...v.enrollmentIds],
        groupIds: [...v.groupIds],
        teacherIds: [...v.teacherIds],
        vehicleIds: [...v.vehicleIds],
      };
      if (v.planningStart) inputs.planningStart = v.planningStart;
      if (v.planningEnd) inputs.planningEnd = v.planningEnd;
      if (inputs.planningStart && inputs.planningEnd && inputs.planningEnd < inputs.planningStart)
        throw new Error('Planning period ends before it starts.');
      if (versions[0]) inputs.programVersionId = versions[0];
      else if (catalog.programVersionId) inputs.programVersionId = catalog.programVersionId;
      if (v.startsAt && v.endsAt) {
        const startsAt = schoolTimeToUtc(v.startsAt),
          endsAt = schoolTimeToUtc(v.endsAt);
        if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(startsAt) <= Date.now())
          throw new Error('Choose a future window with an end after its start.');
        inputs.windows = [{ startsAt, endsAt }];
        for (const window of this.extraWindows.getRawValue()) {
          const start = schoolTimeToUtc(window.startsAt),
            end = schoolTimeToUtc(window.endsAt);
          if (Date.parse(end) <= Date.parse(start) || Date.parse(start) <= Date.now())
            throw new Error('Every availability window needs a future start and a later end.');
          inputs.windows.push({ startsAt: start, endsAt: end });
        }
        inputs.planningStart =
          v.planningStart ||
          [v.startsAt, ...this.extraWindows.getRawValue().map((w) => w.startsAt)]
            .map((d) => d.slice(0, 10))
            .sort()[0];
        inputs.planningEnd =
          v.planningEnd ||
          [v.endsAt, ...this.extraWindows.getRawValue().map((w) => w.endsAt)]
            .map((d) => d.slice(0, 10))
            .sort()
            .at(-1)!;
        if (inputs.planningEnd < inputs.planningStart)
          throw new Error('Planning period ends before it starts.');
      }
      this.saved.emit(inputs);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Check the planning inputs.');
    }
  }
}
