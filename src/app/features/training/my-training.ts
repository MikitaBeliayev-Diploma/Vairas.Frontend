import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/session';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';

/** Resolves "My training" to the selected enrollment of the signed-in student. */
@Component({
  imports: [PageHeader, AsyncState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-page-header heading="My training" />
    <app-async-state
      [empty]="true"
      title="No enrollment in this school yet"
      description="Your school administrator enrolls you into a licence category. Pending invitations are listed under My invitations."
    />
    <p><a routerLink="/invitations" class="text-link">Open my invitations</a></p>`,
})
export class MyTrainingPage implements OnInit {
  private readonly auth = inject(SessionStore);
  private readonly router = inject(Router);
  ngOnInit() {
    const id = this.auth.session()?.enrollmentId;
    if (id) void this.router.navigate(['/training', id], { replaceUrl: true });
  }
}
