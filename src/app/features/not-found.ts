import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  imports: [RouterLink],
  template:
    '<section class="empty-state"><p class="eyebrow">404</p><h1>Page not found</h1><p>The page may have moved or is not available.</p><a routerLink="/dashboard" class="button-link">Back to overview</a></section>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
@Component({
  imports: [RouterLink],
  template:
    '<section class="empty-state"><p class="eyebrow">403</p><h1>This page needs permission</h1><p>Your current role does not have access to this view.</p><a routerLink="/dashboard" class="button-link">Back to overview</a></section>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenPage {}
