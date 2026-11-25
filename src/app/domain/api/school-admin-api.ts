import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import {
  Branch,
  BranchInput,
  Group,
  Invitation,
  InvitationAcceptance,
  Membership,
  PlanningInputs,
  ReviewItem,
  SchoolChange,
  SchoolDetails,
  SchoolEnrollment,
  SchoolRole,
  Teacher,
} from '../models/school-models';
import { MutationResponse } from '../models/http-models';
@Injectable({ providedIn: 'root' })
export class SchoolAdminApi {
  private readonly api = inject(ApiClient);
  private base(schoolId: string) {
    return '/api/v1/schools/' + schoolId;
  }
  school(schoolId: string) {
    return this.api.get<SchoolDetails>(this.base(schoolId));
  }
  rename(school: SchoolDetails, name: string) {
    return this.api.send<MutationResponse<SchoolDetails>>(
      'PATCH',
      this.base(school.schoolId) + '/name',
      { expectedRevision: school.revision, name },
    );
  }
  branches(schoolId: string) {
    return this.api.get<Branch[]>(this.base(schoolId) + '/branches');
  }
  createBranch(schoolId: string, input: BranchInput, key?: string) {
    return this.api.send<MutationResponse<Branch>>(
      'POST',
      this.base(schoolId) + '/branches',
      input,
      key,
    );
  }
  updateBranch(branch: Branch, input: BranchInput, key?: string) {
    return this.api.send<MutationResponse<Branch>>(
      'PUT',
      this.base(branch.schoolId) + '/branches/' + branch.branchId,
      { ...input, expectedRevision: branch.revision },
      key,
    );
  }
  branchStatus(branch: Branch, status: 'Active' | 'Inactive') {
    return this.api.send<unknown>(
      'POST',
      this.base(branch.schoolId) + '/branches/' + branch.branchId + '/status',
      { expectedRevision: branch.revision, status },
    );
  }
  groups(schoolId: string) {
    return this.api.get<Group[]>(this.base(schoolId) + '/groups');
  }
  createGroup(
    schoolId: string,
    input: { name: string; branchId: string | null; categoryCode: string | null },
    key?: string,
  ) {
    return this.api.send<MutationResponse<Group>>(
      'POST',
      this.base(schoolId) + '/groups',
      input,
      key,
    );
  }
  renameGroup(group: Group, name: string) {
    return this.api.send<MutationResponse<Group>>(
      'PATCH',
      this.base(group.schoolId) + '/groups/' + group.groupId + '/name',
      { expectedRevision: group.revision, name },
    );
  }
  assignGroupTeacher(group: Group, teacherId: string) {
    return this.api.send<unknown>(
      'POST',
      this.base(group.schoolId) + '/groups/' + group.groupId + '/teacher-assignments',
      { teacherId, expectedRevision: group.revision },
    );
  }
  memberships(schoolId: string) {
    return this.api.get<Membership[]>(this.base(schoolId) + '/memberships');
  }
  terminateMembership(schoolId: string, membership: Membership) {
    return this.api.send<unknown>(
      'POST',
      this.base(schoolId) + '/memberships/' + membership.membershipId + '/termination',
      { expectedRevision: membership.revision },
    );
  }
  grantPermission(schoolId: string, membership: Membership, permission: string) {
    return this.api.send<SchoolChange>(
      'POST',
      this.base(schoolId) + '/memberships/' + membership.membershipId + '/permissions',
      { permission },
    );
  }
  teachers(schoolId: string) {
    return this.api.get<Teacher[]>(this.base(schoolId) + '/teachers');
  }
  invite(
    schoolId: string,
    input: { targetUserId: string; role: SchoolRole; categoryCode: string | null },
    key?: string,
  ) {
    return this.api.send<MutationResponse<Invitation>>(
      'POST',
      this.base(schoolId) + '/invitations',
      input,
      key,
    );
  }
  invitations(schoolId: string, cursor: string | null = null) {
    return this.api.get<{ items: Invitation[]; nextCursor: string | null }>(
      this.base(schoolId) +
        '/invitations?limit=20' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    );
  }
  invitation(schoolId: string, invitationId: string) {
    return this.api.get<Invitation>(this.base(schoolId) + '/invitations/' + invitationId);
  }
  revokeInvitation(invitation: Invitation, reason: string) {
    return this.api.send<MutationResponse<Invitation>>(
      'POST',
      this.base(invitation.schoolId) + '/invitations/' + invitation.invitationId + '/revoke',
      { expectedRevision: invitation.revision, reason },
    );
  }
  myInvitations() {
    return this.api.get<{ items: Invitation[] }>('/api/v1/users/me/invitations?limit=50');
  }
  acceptInvitation(invitation: Invitation, key?: string) {
    return this.api.send<InvitationAcceptance>(
      'POST',
      this.base(invitation.schoolId) + '/invitations/' + invitation.invitationId + '/accept',
      { expectedRevision: invitation.revision },
      key,
    );
  }
  enrollments(schoolId: string) {
    return this.api.get<SchoolEnrollment[]>(this.base(schoolId) + '/enrollments');
  }
  enrollment(schoolId: string, enrollmentId: string) {
    return this.api.get<SchoolEnrollment>(this.base(schoolId) + '/enrollments/' + enrollmentId);
  }
  createEnrollment(schoolId: string, studentId: string, licenseCategory: string, key?: string) {
    return this.api.send<SchoolChange>(
      'POST',
      this.base(schoolId) + '/enrollments',
      { studentId, licenseCategory },
      key,
    );
  }
  assignGroup(
    enrollment: SchoolEnrollment,
    groupId: string,
    programVersionId: string,
    key?: string,
  ) {
    return this.api.send<SchoolChange>(
      'PUT',
      this.base(enrollment.schoolId) +
        '/enrollments/' +
        enrollment.enrollmentId +
        '/group-assignment',
      { groupId, programVersionId, expectedRevision: enrollment.version },
      key,
    );
  }
  activationOperation(schoolId: string, operationId: string) {
    return this.api.get<SchoolChange>(
      this.base(schoolId) + '/activation-operations/' + operationId,
    );
  }
  removeFromGroup(enrollment: SchoolEnrollment) {
    return this.api.send<SchoolChange>(
      'POST',
      this.base(enrollment.schoolId) + '/enrollments/' + enrollment.enrollmentId + '/group-removal',
      {
        groupId: enrollment.groupId,
        programVersionId: enrollment.programVersionId,
        expectedRevision: enrollment.version,
      },
    );
  }
  terminateEnrollment(enrollment: SchoolEnrollment, status: string) {
    return this.api.send<SchoolChange>(
      'POST',
      this.base(enrollment.schoolId) + '/enrollments/' + enrollment.enrollmentId + '/termination',
      { expectedRevision: enrollment.version, status },
    );
  }
  planningInputs(schoolId: string) {
    return this.api.get<PlanningInputs>(this.base(schoolId) + '/planning-inputs');
  }
  membershipReviews(schoolId: string) {
    return this.api.get<ReviewItem[]>(this.base(schoolId) + '/membership-reviews');
  }
  resolveMembershipReview(schoolId: string, reviewId: string, note: string) {
    return this.api.send<ReviewItem>(
      'POST',
      this.base(schoolId) + '/membership-reviews/' + reviewId + '/resolution',
      { note },
    );
  }
}

/** Vehicle Management. */
