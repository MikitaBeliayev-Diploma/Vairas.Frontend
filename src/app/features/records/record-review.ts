import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PracticalRecord } from '../../domain/models/learning-models';
import { Role } from '../../domain/models/session-models';
import { Status } from '../../shared/status';
@Component({
  selector: 'app-record-review',
  imports: [FormsModule, ButtonModule, InputTextModule, Status],
  templateUrl: './record-review.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordReview {
  readonly record = input.required<PracticalRecord>();
  readonly role = input.required<Role>();
  readonly busy = input(false);
  readonly topics = input<{ id: string; name: string }[]>([]);
  readonly topicNames = computed(() =>
    this.record().facts.topicIds.map((id) => this.topics().find((t) => t.id === id)?.name ?? id),
  );
  readonly instructorResponded = computed(() =>
    this.record().responses.some(
      (r) => r.role === 'Instructor' && r.factVersion === this.record().factVersion,
    ),
  );
  readonly confirmed = output<void>();
  readonly disputed = output<string>();
  readonly reason = signal('');
  readonly error = signal('');
  readonly studentResponded = computed(() =>
    this.record().responses.some(
      (r) => r.role === 'Student' && r.factVersion === this.record().factVersion,
    ),
  );
  readonly alreadyConfirmed = computed(() =>
    this.record().responses.some(
      (r) =>
        r.role === this.role() &&
        r.factVersion === this.record().factVersion &&
        r.response === 'Confirm',
    ),
  );
  readonly canConfirm = computed(
    () =>
      ['Student', 'Instructor'].includes(this.role()) &&
      !['Disputed', 'Invalid'].includes(this.record().status) &&
      !this.alreadyConfirmed(),
  );
  confirm() {
    if (!this.busy() && this.canConfirm()) this.confirmed.emit();
  }
  dispute() {
    this.error.set('');
    if (!this.reason().trim()) {
      this.error.set('Explain which facts need to be corrected.');
      return;
    }
    if (this.reason().length > 1000) {
      this.error.set('Use no more than 1000 characters.');
      return;
    }
    if (
      this.role() === 'Student' &&
      !this.busy() &&
      !['Disputed', 'Invalid'].includes(this.record().status)
    )
      this.disputed.emit(this.reason().trim());
  }
}
