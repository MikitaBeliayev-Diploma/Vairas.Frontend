export interface School {
  schoolId: string;
  name: string;
}

export interface Enrollment {
  enrollmentId: string;
  studentId: string;
  schoolId: string;
  name: string;
  category: string;
  programVersionId: string;
  groupId: string;
  revision: number;
  status: string;
}

export interface Catalog {
  schools: School[];
  enrollments: Enrollment[];
  teachers: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  topics: { id: string; name: string }[];
  programVersionId: string;
  branchId: string;
  assessmentDefinitionVersionId: string;
  branches?: { id: string; name: string }[];
  groups?: { id: string; name: string; categoryCode: string | null }[];
  curricula?: Record<string, CatalogCurriculum>;
}

export interface CatalogCurriculum {
  programVersionId: string;
  topics: { id: string; name: string }[];
  assessments: CatalogAssessment[];
}

/** Assessment definition of a programme version as far as the caller may read it (Administrator). */
export interface CatalogAssessment {
  id: string;
  name: string;
  stage: string;
  trainingKind?: 'Theory' | 'Practical';
  minimumMark?: number;
  maximumMark?: number;
  passingMark?: number;
}

export type SchoolRole = 'Student' | 'Teacher' | 'Administrator';

export interface Workspace {
  schoolId: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface SchoolChange {
  operationId: string;
  schoolId: string;
  state: string;
  resultId: string;
  schoolRevision: number;
}

export interface SchoolDetails {
  schoolId: string;
  name: string;
  status: 'Active' | 'Inactive';
  revision: number;
}

export interface Branch {
  branchId: string;
  schoolId: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string | null;
  status: 'Active' | 'Inactive';
  revision: number;
}

export interface BranchInput {
  name: string;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

export interface Group {
  groupId: string;
  schoolId: string;
  branchId: string | null;
  name: string;
  categoryCode: string | null;
  startedAt: string;
  endedAt: string | null;
  revision: number;
  membershipVersion: number;
}

export interface Membership {
  membershipId: string;
  userId: string;
  role: SchoolRole;
  startedAt: string;
  endedAt: string | null;
  revision: number;
}

export interface Teacher {
  teacherId: string;
  userId: string;
}

export interface SchoolEnrollment {
  enrollmentId: string;
  schoolId: string;
  studentId: string;
  licenseCategory: string;
  status: 'Active' | 'Completed' | 'Withdrawn' | 'Transferred' | 'Cancelled';
  version: number;
  startedAt: string;
  endedAt: string | null;
  groupId?: string | null;
  programVersionId?: string | null;
}

export interface Invitation {
  invitationId: string;
  schoolId: string;
  targetUserId: string;
  role: SchoolRole;
  categoryCode: string | null;
  revision: number;
  createdAt: string;
  expiresAt: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
  effectiveStatus: string;
  acceptanceState: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  resultMembershipId: string | null;
  resultEnrollmentId: string | null;
}

export interface InvitationAcceptance {
  operationId: string;
  schoolId: string;
  invitationId: string;
  operationStatus: string;
  outcome: string;
  resultMembershipId: string | null;
  resultEnrollmentId: string | null;
}

export interface PlanningInputs {
  schoolId: string;
  complete: boolean;
  missingItems: string[];
  enrollments?: { enrollmentId: string; missingItems: string[] }[];
}

export interface ReviewItem {
  reviewId: string;
  schoolId: string;
  targetKind: string;
  targetId: string;
  reasonCode: string;
  subjectRole: string;
  subjectUserId: string;
  raisedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}
