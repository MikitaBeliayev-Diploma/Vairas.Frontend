import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RoleProfileApi } from '../../domain/api/role-profile-api';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import { Invitation } from '../../domain/models/school-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { Mutations, Resource } from '../../shared/resource';

@Component({
  imports: [ButtonModule, PageHeader, AsyncState, Status, SchoolDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="SCHOOL MEMBERSHIP"
      heading="My invitations"
      description="Accepting an invitation creates the matching role profile and joins the school."
    />
    <app-async-state
      [loading]="invitations.loading()"
      [error]="invitations.failed()"
      [empty]="!invitations.loading() && !invitations.failed() && !invitations.value().length"
      title="No invitations"
      description="Ask the school administrator to invite your user ID."
      (retry)="invitations.load()"
    />
    <div class="document-grid">
      @for (invitation of invitations.value(); track invitation.invitationId) {
        <article class="panel form-panel">
          <p class="eyebrow">{{ invitation.role }}</p>
          <h2>{{ schoolName(invitation.schoolId) }}</h2>
          <div class="flex gap-2 flex-wrap">
            <app-status [value]="invitation.effectiveStatus || invitation.status" />
            @if (invitation.categoryCode) {
              <span class="status">Category {{ invitation.categoryCode }}</span>
            }
          </div>
          <p class="muted">Expires {{ invitation.expiresAt | schoolDate }}</p>
          @if (invitation.status === 'Pending' && invitation.effectiveStatus !== 'Expired') {
            <p-button
              label="Accept invitation"
              [loading]="m.busy()"
              (onClick)="accept(invitation)"
            />
          }
        </article>
      }
    </div>
  `,
})
export class InvitationsPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly school = inject(SchoolAdminApi);
  private readonly roles = inject(RoleProfileApi);
  private readonly router = inject(Router);
  readonly m = new Mutations();
  readonly invitations = new Resource<Invitation[]>([], () =>
    this.school.myInvitations().then((r) => r.items),
  );
  ngOnInit() {
    void this.invitations.load();
  }
  schoolName(schoolId: string) {
    return (
      this.auth.workspaces().find((w) => w.schoolId === schoolId)?.name ??
      'School ' + schoolId.slice(0, 8)
    );
  }
  async accept(invitation: Invitation) {
    const profile = this.auth.profile();
    const done = await this.m.run(
      async () => {
        // A role profile must exist before the membership can be accepted.
        if (invitation.role === 'Teacher' && !profile?.teacherId)
          await this.roles.create('teacher', {
            schoolId: invitation.schoolId,
            invitationId: invitation.invitationId,
          });
        if (invitation.role === 'Administrator' && !profile?.administratorId)
          await this.roles.create('administrator', {
            schoolId: invitation.schoolId,
            invitationId: invitation.invitationId,
          });
        if (invitation.role === 'Student' && !profile?.studentId)
          await this.roles.create('student');
        const result = await this.school.acceptInvitation(
          invitation,
          this.m.key('accept-' + invitation.invitationId),
        );
        await this.auth.loadIdentity('', '', invitation.schoolId);
        return result;
      },
      'Invitation accepted.',
      'accept-' + invitation.invitationId,
    );
    if (done) await this.router.navigateByUrl('/dashboard');
    else void this.invitations.load();
  }
}
