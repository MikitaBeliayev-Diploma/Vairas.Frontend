import {
  ChangeDetectionStrategy,
  Component,
  effect,
  untracked,
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
import { SessionStore } from '../../core/session';
import { Invitation, Membership, SchoolRole, Teacher } from '../../domain/models/school-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { LICENSE_CATEGORIES, Mutations, Resource, isUuid, shortId } from '../../shared/resource';

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
    SchoolDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people.html',
})
export class PeoplePage {
  readonly auth = inject(SessionStore);
  private readonly api = inject(SchoolAdminApi);
  private readonly fb = inject(FormBuilder);
  readonly m = new Mutations();
  readonly shortId = shortId;
  readonly categories = LICENSE_CATEGORIES;
  readonly roles: SchoolRole[] = ['Teacher', 'Administrator', 'Student'];
  readonly schoolId = computed(() => this.auth.session()?.schoolId ?? '');
  readonly members = new Resource<{ memberships: Membership[]; teachers: Teacher[] }>(
    { memberships: [], teachers: [] },
    async () => {
      const [memberships, teachers] = await Promise.all([
        this.api.memberships(this.schoolId()),
        this.api.teachers(this.schoolId()),
      ]);
      return { memberships, teachers };
    },
  );
  private invitationCursor: string | null = null;
  readonly nextInvitationCursor = signal<string | null>(null);
  readonly invitations = new Resource<Invitation[]>([], async () => {
    const schoolId = this.schoolId();
    const session = this.auth.session();
    const page = await this.api.invitations(schoolId, this.invitationCursor);
    if (session !== this.auth.session()) throw new Error('The authorization context changed.');
    this.nextInvitationCursor.set(page.nextCursor);
    return page.items;
  });
  async nextInvitations() {
    this.invitationCursor = this.nextInvitationCursor();
    await this.invitations.load();
  }
  async refreshInvitations() {
    this.invitationCursor = null;
    this.nextInvitationCursor.set(null);
    await this.invitations.load();
  }
  readonly showEnded = signal(false);
  readonly visibleMembers = computed(() =>
    this.members
      .value()
      .memberships.filter((m) => this.showEnded() || !m.endedAt)
      .sort((a, b) => a.role.localeCompare(b.role)),
  );
  readonly inviteOpen = signal(false);
  readonly revokeTarget = signal<Invitation | null>(null);
  readonly endTarget = signal<Membership | null>(null);
  readonly inviteForm = this.fb.nonNullable.group({
    targetUserId: ['', Validators.required],
    role: ['Teacher' as SchoolRole, Validators.required],
    categoryCode: [''],
  });
  readonly revokeForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });
  constructor() {
    effect(() => {
      const session = this.auth.session();
      untracked(() => {
        this.members.reset();
        this.invitations.reset();
        this.inviteOpen.set(false);
        this.revokeTarget.set(null);
        this.endTarget.set(null);
        this.invitationCursor = null;
        this.nextInvitationCursor.set(null);
        if (session?.schoolId) {
          void this.members.load();
          void this.invitations.load();
        }
      });
    });
  }
  teacherOf(m: Membership) {
    return this.members.value().teachers.find((t) => t.userId === m.userId);
  }
  isMe(m: Membership) {
    return m.userId === this.auth.profile()?.userId;
  }
  async invite() {
    this.inviteForm.markAllAsTouched();
    const v = this.inviteForm.getRawValue();
    if (this.inviteForm.invalid) return;
    if (!isUuid(v.targetUserId)) {
      this.inviteForm.controls.targetUserId.setErrors({ uuid: true });
      return;
    }
    const result = await this.m.run(
      () =>
        this.api.invite(
          this.schoolId(),
          {
            targetUserId: v.targetUserId.trim(),
            role: v.role,
            categoryCode: v.role === 'Student' ? v.categoryCode || null : null,
          },
          this.m.key('invite'),
        ),
      'Invitation issued. The person accepts it under My invitations within 24 hours.',
      'invite',
    );
    if (result) {
      this.inviteOpen.set(false);
      this.inviteForm.reset({ targetUserId: '', role: 'Teacher', categoryCode: '' });
      await this.invitations.load();
    }
  }
  async revoke() {
    const target = this.revokeTarget();
    this.revokeForm.markAllAsTouched();
    if (!target || this.revokeForm.invalid) return;
    if (
      await this.m.run(
        () => this.api.revokeInvitation(target, this.revokeForm.getRawValue().reason),
        'Invitation revoked.',
      )
    ) {
      this.revokeTarget.set(null);
      this.revokeForm.reset();
      await this.invitations.load();
    }
  }
  async endMembership() {
    const target = this.endTarget();
    if (!target) return;
    if (
      await this.m.run(
        () => this.api.terminateMembership(this.schoolId(), target),
        'Membership ended.',
      )
    ) {
      this.endTarget.set(null);
      await this.members.load();
    }
  }
}
