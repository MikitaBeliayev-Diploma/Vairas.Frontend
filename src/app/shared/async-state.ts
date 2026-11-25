import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { ButtonModule } from 'primeng/button';
@Component({
  selector: 'app-async-state',
  imports: [SkeletonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '@if(loading()){<div class="loading-grid" role="status" aria-label="Loading"><p-skeleton height="8rem"/><p-skeleton height="8rem"/><span class="sr-only">Loading…</span></div>} @else if(error()){<div class="empty-state" role="alert"><h3>Unable to load this view</h3><p>Please try again when the service is available.</p><p-button label="Try again" (onClick)="retry.emit()"/></div>} @else if(empty()){<div class="empty-state"><h3>{{title()}}</h3><p>{{description()}}</p></div>}',
})
export class AsyncState {
  readonly loading = input(false);
  readonly error = input(false);
  readonly empty = input(false);
  readonly title = input('Nothing here yet');
  readonly description = input('New items will appear here.');
  readonly retry = output<void>();
}
