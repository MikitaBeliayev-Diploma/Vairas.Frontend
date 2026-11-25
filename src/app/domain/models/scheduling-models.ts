export interface Lesson {
  lessonId: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'NoShow';
  version: number;
  startsAt: string;
  endsAt: string;
  kind: 'Practical' | 'Theory';
  actualStart?: string | null;
  actualEnd?: string | null;
  title?: string;
  teacherName?: string;
  vehicleLabel?: string;
  enrollmentId?: string;
  studentName?: string;
  schoolId?: string;
  teacherId?: string;
  studentId?: string | null;
  vehicleId?: string | null;
  groupId?: string | null;
  groupMembershipRevision?: number | null;
  /** US-010: immutable reason recorded when a practical lesson was booked; null when none. */
  reason?: string | null;
}

export interface Booking {
  schoolId: string;
  branchId: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  vehicleId: string;
  category: string;
  startsAt: string;
  endsAt: string;
  /** Optional trimmed reason (≤500), e.g. an additional lesson for an outstanding requirement. */
  reason?: string;
}

export interface DraftInputs {
  schoolId: string;
  programVersionId: string;
  enrollmentIds: string[];
  groupIds: string[];
  teacherIds: string[];
  vehicleIds: string[];
  planningStart: string;
  planningEnd: string;
  windows: { startsAt: string; endsAt: string }[];
}

export interface SchedulingRequest {
  requestId: string;
  revision: number;
  schoolId: string;
  status:
    | 'Draft'
    | 'Submitted'
    | 'Ready'
    | 'Infeasible'
    | 'Rejected'
    | 'Stale'
    | 'Superseded'
    | 'Confirmed';
  missingItems: string[];
}

export interface ScheduleProposal {
  requestId: string;
  revision: number;
  status: 'Ready' | 'Infeasible' | 'Stale';
  lessons: Booking[];
  theoryLessons: {
    schoolId: string;
    branchId: string;
    teacherId: string;
    category: string;
    startsAt: string;
    endsAt: string;
    groupId: string | null;
  }[];
  issues: string[];
}

export interface SchedulingOperation {
  operationId: string;
  status: 'Pending' | 'Committed' | 'Rejected' | 'ReconciliationPending' | 'Unknown';
  lessonIds: string[];
  code?: string;
}

export type DraftInputSet = Pick<DraftInputs, 'schoolId'> & Partial<Omit<DraftInputs, 'schoolId'>>;

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

export interface SchoolRuleInput {
  schoolId: string;
  ruleType: string;
  value: number;
  expectedRevision: number;
  unit: string;
  scopeKind: string;
  effectiveFrom: string;
  sourceReference: string;
  ruleId?: string | null;
  scopeResourceId?: string | null;
  severity?: string;
  effectiveTo?: string | null;
  reason?: string;
}

export interface SchoolRuleVersion {
  ruleVersionId: string;
  ruleId: string;
  revision: number;
  status: string;
}
export interface RequestListItem {
  request: SchedulingRequest;
  inputs: DraftInputSet;
  createdAt: string;
  modifiedAt: string;
  hasProposal: boolean;
}
export interface RequestPage {
  items: RequestListItem[];
  nextOffset: number | null;
}
