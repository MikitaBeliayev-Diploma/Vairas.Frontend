export interface PracticalFacts {
  schoolId: string;
  enrollmentId: string;
  lessonId: string;
  programVersionId: string;
  sourceSnapshotId: string;
  trainingMinutes: number;
  distanceKm: number;
  topicIds: string[];
  durationExplanation?: string;
  expectedRevision?: number;
  correctionReason?: string;
}

export interface PracticalRecord {
  recordId: string;
  enrollmentId: string;
  revision: number;
  factVersion: number;
  status: 'Pending' | 'Confirmed' | 'Disputed' | 'Invalid';
  creditEligible?: boolean;
  facts: PracticalFacts;
  responses: {
    role: 'Instructor' | 'Student';
    response: 'Confirm' | 'Dispute';
    factVersion: number;
  }[];
  lessonTitle?: string;
  occurredAt?: string;
}

/** Learning Tracking `LessonSourceSnapshotResult`: the verified Scheduling source of a lesson. */
export interface LessonSource {
  sourceSnapshotId: string;
  lessonId: string;
  lessonRevision: number;
  freshness: string;
  physicallyCompleted: boolean;
  actualStart: string | null;
  actualEnd: string | null;
}

export type TheoryAttendance = 'Present' | 'Absent';

export interface TheoryAttendanceRow {
  enrollmentId: string;
  studentId: string;
  attendance: TheoryAttendance;
}

/** Learning Tracking `TheoryFactsRequest`: one whole-group record with the complete roster. */
export interface TheoryFacts {
  schoolId: string;
  lessonId: string;
  sourceSnapshotId: string;
  trainingMinutes: number;
  attendanceRows: TheoryAttendanceRow[];
  durationExplanation?: string | null;
  expectedRevision?: number | null;
  correctionReason?: string | null;
}

/** Learning Tracking `TheoryRecordResult`; confirmed once by the assigned teacher, never by students. */
export interface TheoryRecord {
  recordId: string;
  revision: number;
  factVersion: number;
  status: 'Pending' | 'Confirmed' | 'RevalidationRequired';
  facts: TheoryFacts;
  confirmedBy: string | null;
  confirmedAt: string | null;
  sourceCurrent?: boolean;
}

export interface Progress {
  enrollmentId: string;
  theoryMinutes: number;
  practicalMinutes: number;
  percent: number | null;
  outstandingRequirements: string[];
  pendingRecordCount: number;
  disputedRecordCount?: number;
  theoryDeficitMinutes?: number | null;
  practicalDeficitMinutes?: number | null;
  sourcesVerified?: boolean;
  state?: string;
}

export interface RequirementResult {
  requirementId: string;
  status: 'Incomplete' | 'Satisfied' | 'Unverified';
  observedMinutes: number | null;
  observedMark: number | null;
  explanation: string;
}

export interface Readiness {
  enrollmentId: string;
  evaluationId: string;
  prerequisitesSatisfied: boolean;
  outstandingRequirements: string[];
  decision: 'Pending' | 'Approved' | 'NotApproved';
  revision?: number;
  assessmentDefinitionVersionId?: string;
  formalStatus?: 'Incomplete' | 'Satisfied' | 'Unverified';
  requirements?: RequirementResult[];
  decisionId?: string | null;
  invalidated?: boolean;
  /** Authoritative invalidation time of the current decision (Learning Tracking); never computed in the browser. */
  decisionInvalidatedAt?: string | null;
}
