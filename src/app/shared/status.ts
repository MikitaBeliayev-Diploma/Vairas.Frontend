import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
@Component({
  selector: 'app-status',
  imports: [TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p-tag
    class="status"
    [value]="value()"
    [severity]="good() ? 'success' : warning() ? 'warn' : bad() ? 'danger' : 'secondary'"
  />`,
})
export class Status {
  readonly value = input.required<string>();
  readonly good = computed(() =>
    [
      'Confirmed',
      'Committed',
      'Completed',
      'Ready',
      'Approved',
      'Active',
      'PublishedReady',
      'Passed',
      'Recorded',
    ].includes(this.value()),
  );
  readonly warning = computed(() =>
    [
      'Pending',
      'Draft',
      'Submitted',
      'ReconciliationPending',
      'Prepared',
      'Generating',
      'PublishedReview',
      'RevalidationRequired',
      'ReviewRequired',
    ].includes(this.value()),
  );
  readonly bad = computed(() =>
    [
      'Rejected',
      'Disputed',
      'Invalid',
      'Stale',
      'Infeasible',
      'NotApproved',
      'Cancelled',
      'Failed',
      'Annulled',
    ].includes(this.value()),
  );
}
