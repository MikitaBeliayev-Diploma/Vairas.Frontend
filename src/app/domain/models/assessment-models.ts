/** Scheduling `AssessmentRequest` (US-010): a calendar allocation for an approved readiness evaluation. */
export interface AssessmentAppointmentRequest {
  schoolId: string;
  enrollmentId: string;
  assessmentDefinitionVersionId: string;
  readinessEvaluationId: string;
  teacherId: string;
  branchId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  vehicleId: string | null;
}

/** Scheduling `AssessmentResponse`; `version` is the optimistic revision used for cancellation. */
export interface AssessmentAppointment {
  appointmentId: string;
  schoolId: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'NoShow';
  version: number;
  startsAt: string;
  endsAt: string;
}

/** Learning Tracking `AssessmentResultRequest` (US-016 AC-040 / US-024); the outcome is derived by the service. */
export interface AssessmentResultRequest {
  schoolId: string;
  enrollmentId: string;
  assessmentDefinitionVersionId: string;
  mark: number;
  assessedAt: string;
  readinessDecisionId: string | null;
  appointmentId: string | null;
  comment: string | null;
}

/** Learning Tracking `AssessmentResponse`: the latest result version of one attempt with current validity. */
export interface AssessmentResult {
  assessmentId: string;
  resultVersionId: string;
  enrollmentId: string;
  assessmentDefinitionVersionId: string;
  attemptNumber: number;
  revision: number;
  version: number;
  mark: number;
  outcome: 'Passed' | 'Failed';
  status: 'Recorded' | 'ReviewRequired' | 'Annulled';
  assessedAt: string;
  readinessDecisionId: string | null;
  /** Authoritative invalidation time of the linked readiness decision; echoed verbatim by a historical review. */
  readinessInvalidatedAt?: string | null;
  /** Invalidation time this result version has already reviewed, if any. */
  reviewedInvalidationAt?: string | null;
}
/** Server-provided assessment allocation for an authorized enrollment. */
export interface KnownAppointment {
  appointmentId: string;
  assessmentDefinitionVersionId: string;
  readinessEvaluationId: string;
  teacherId: string;
  startsAt: string;
  endsAt: string;
  status?: AssessmentAppointment['status'];
  version?: number;
}

export interface AssessmentTopicMark {
  assessmentTopicId: string;
  mark: number;
  comment?: string | null;
}
export interface AssessmentVersionHistory {
  resultVersionId: string;
  version: number;
  current: boolean;
  mark: number;
  outcome: AssessmentResult['outcome'];
  storedStatus: AssessmentResult['status'];
  currentValidity: AssessmentResult['status'];
  assessedAt: string;
  recordedAt: string;
  recordedBy: string;
  correctionReason: string | null;
  reviewedInvalidationAt: string | null;
  topicMarks: AssessmentTopicMark[];
}
export interface AssessmentCorrectionRequest {
  expectedRevision: number;
  mark: number;
  status: 'Recorded' | 'Annulled';
  correctionReason: string;
  topicMarks: AssessmentTopicMark[];
  /** Required for a historical review: the exact `readinessInvalidatedAt` returned by Learning Tracking. */
  reviewedInvalidationAt?: string | null;
}
