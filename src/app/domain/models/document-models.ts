export interface DocumentJob {
  jobId: string;
  status: 'Pending' | 'Generating' | 'Completed' | 'Failed';
  errorCode?: string | null;
  documentId?: string;
  ready?: boolean;
  missingItems?: string[];
  sourceSnapshotVersion?: string;
  documentState?:
    'Prepared' | 'Indeterminate' | 'PublishedReview' | 'PublishedReady' | 'Stale' | 'Withdrawn';
}

export interface DocumentVersion {
  documentVersionId: string;
  versionNo: number;
  state: string;
  revision: number;
  snapshotId: string;
  dependencyRevision: number;
  evidenceStatus: string;
  templateVersionId: string;
  reviewed: boolean;
}

export interface DocumentView extends DocumentJob {
  kind: string;
  createdAt: string;
  enrollmentId: string;
  revision?: number;
  currentVersionId?: string | null;
  versions?: DocumentVersion[];
}

/** US-016 AC-080: Learning Tracking evidence snapshot (`GET /training-evidence/{snapshotId}`). */
export interface TrainingEvidence {
  snapshotId: string;
  enrollmentId: string;
  programVersionId: string;
  kind: 'Journal' | 'CompletionReport';
  status: 'Ready' | 'Incomplete';
  dependencyRevision: number | string;
  checklistVersionId: string | null;
  /** Still releasable now (same dependency revision, checklist and verified sources). */
  current: boolean;
  checks: { code: string; field: string; outcome: string; explanation: string }[];
  schoolId: string;
}

export interface ReportingDeclarationRequest {
  snapshotId: string;
  statement: string;
}

/** The service records the declaration only; it performs no external transmission. */
export interface ReportingDeclarationResponse {
  declarationId: string;
  snapshotId: string;
  declaredAt: string;
}
