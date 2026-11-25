import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ActionPreview } from '../../domain/models/chat-models';
import { Catalog } from '../../domain/models/school-models';
import { SchoolDatePipe } from '../../shared/school-date';
@Component({
  selector: 'app-action-confirmation',
  imports: [FormsModule, ButtonModule, SchoolDatePipe],
  templateUrl: './action-confirmation.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionConfirmation {
  readonly preview = input.required<ActionPreview>();
  readonly catalog = input<Catalog | null>(null);
  readonly busy = input(false);
  readonly completed = input(false);
  readonly invalidated = input(false);
  readonly approved = output<void>();
  readonly cancelled = output<void>();
  readonly checked = signal(false);
  readonly now = signal(Date.now());
  readonly expired = computed(() => this.now() >= Date.parse(this.preview().expiresAt));
  readonly enrollment = computed(() =>
    this.catalog()?.enrollments.find(
      (e) => e.enrollmentId === this.preview().arguments.enrollmentId,
    ),
  );
  readonly teacher = computed(() =>
    this.catalog()?.teachers.find((t) => t.id === this.preview().arguments.teacherId),
  );
  readonly vehicle = computed(() =>
    this.catalog()?.vehicles.find((v) => v.id === this.preview().arguments.vehicleId),
  );
  readonly school = computed(() =>
    this.catalog()?.schools.find((s) => s.schoolId === this.preview().arguments.schoolId),
  );
  constructor() {
    const interval = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }
  confirm() {
    if (
      this.checked() &&
      !this.expired() &&
      !this.busy() &&
      !this.completed() &&
      !this.invalidated()
    )
      this.approved.emit();
  }
}
