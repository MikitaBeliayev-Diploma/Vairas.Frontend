import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SessionStore } from '../../core/session';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
@Component({
  imports: [RouterLink, FormsModule, InputTextModule, TableModule, PageHeader, Status],
  template:
    '<app-page-header heading="Learners" description="Review training within your current school and assignments."/><section class="panel"><div class="toolbar"><label for="learner-search">Find a learner</label><input pInputText id="learner-search" placeholder="Search by name or category" [ngModel]="search()" (ngModelChange)="search.set($event)"/></div><p-table [value]="filtered()" [paginator]="true" [rows]="10"><ng-template #header><tr><th pSortableColumn="name">Learner <p-sortIcon field="name"/></th><th>Category</th><th>Status</th><th>Training</th></tr></ng-template><ng-template #body let-enrollment><tr><td><strong>{{enrollment.name}}</strong></td><td>{{enrollment.category}}</td><td><app-status [value]="enrollment.status"/></td><td><a [routerLink]="[\'/training\',enrollment.enrollmentId]" class="text-link">View training</a></td></tr></ng-template><ng-template #emptymessage><tr><td colspan="4">No matching learners.</td></tr></ng-template></p-table></section>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnersPage {
  readonly auth = inject(SessionStore);
  readonly search = signal('');
  readonly filtered = computed(() =>
    this.auth
      .enrollments()
      .filter((e) =>
        (e.name + ' ' + e.category).toLowerCase().includes(this.search().toLowerCase()),
      ),
  );
}
