import { AssessmentDefinition } from '../models/programme-models';
import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import {
  AssessmentResult,
  AssessmentResultRequest,
  AssessmentVersionHistory,
  AssessmentCorrectionRequest,
} from '../models/assessment-models';
import {
  LessonSource,
  PracticalFacts,
  PracticalRecord,
  Progress,
  Readiness,
  TheoryFacts,
  TheoryRecord,
} from '../models/learning-models';
import {
  ReportingDeclarationRequest,
  ReportingDeclarationResponse,
  TrainingEvidence,
} from '../models/document-models';
@Injectable({ providedIn: 'root' })
export class LearningApi {
  assessmentDefinitions(enrollmentId: string) {
    return this.api.get<AssessmentDefinition[]>(
      '/api/v1/student-trainings/' + enrollmentId + '/assessment-definitions',
    );
  }
  theoryRoster(lessonId: string) {
    return this.api.get<{
      groupId: string;
      schoolId: string;
      membershipVersion: number;
      participants: { enrollmentId: string; studentId: string }[];
    }>('/api/v1/lessons/' + lessonId + '/theory-roster');
  }
  theoryRecords(lessonId: string) {
    return this.api.get<TheoryRecord[]>('/api/v1/lessons/' + lessonId + '/theory-records');
  }
  reportingDeclarations(enrollmentId: string) {
    return this.api.get<
      {
        declarationId: string;
        snapshotId: string;
        actorUserId: string;
        declaredAt: string;
        statement: string;
      }[]
    >('/api/v1/student-trainings/' + enrollmentId + '/reporting-declarations');
  }
  private readonly api = inject(ApiClient);
  records(id: string) {
    return this.api.get<PracticalRecord[]>(
      '/api/v1/student-trainings/' + id + '/practical-records',
    );
  }
  record(id: string) {
    return this.api.get<PracticalRecord>('/api/v1/practical-records/' + id);
  }
  source(lessonId: string) {
    return this.api.send<LessonSource>(
      'POST',
      '/api/v1/lessons/' + lessonId + '/source-verifications',
      null,
    );
  }
  /** US-012: whole-group theory attendance. */
  theoryRecord(recordId: string) {
    return this.api.get<TheoryRecord>('/api/v1/theory-records/' + recordId);
  }
  createTheoryRecord(facts: TheoryFacts, key: string) {
    return this.api.send<TheoryRecord>('POST', '/api/v1/theory-records', facts, key);
  }
  reviseTheoryRecord(record: TheoryRecord, facts: TheoryFacts, key: string) {
    return this.api.send<TheoryRecord>(
      'POST',
      '/api/v1/theory-records/' + record.recordId + '/versions',
      { ...facts, expectedRevision: record.revision },
      key,
    );
  }
  /** One-time teacher confirmation of the exact current record revision (not the fact version). */
  confirmTheoryRecord(record: TheoryRecord, key: string) {
    return this.api.send<TheoryRecord>(
      'POST',
      '/api/v1/theory-records/' + record.recordId + '/confirmations',
      { revision: record.revision },
      key,
    );
  }
  /** US-016 AC-040 / US-024: latest result of each assessment attempt with its current validity. */
  assessments(enrollmentId: string) {
    return this.api.quiet<AssessmentResult[]>(
      '/api/v1/student-trainings/' + enrollmentId + '/assessments',
    );
  }
  assessmentHistory(assessmentId: string) {
    return this.api.get<AssessmentVersionHistory[]>(
      '/api/v1/assessments/' + assessmentId + '/versions',
    );
  }
  reviseAssessment(assessmentId: string, request: AssessmentCorrectionRequest, key: string) {
    return this.api.send<AssessmentResult>(
      'POST',
      '/api/v1/assessments/' + assessmentId + '/versions',
      request,
      key,
    );
  }
  /** Records a performed assessment (Instructor with the Assessor grant); the service derives the outcome. */
  recordAssessment(request: AssessmentResultRequest, key: string) {
    return this.api.send<AssessmentResult>(
      'POST',
      '/api/v1/student-trainings/' + request.enrollmentId + '/assessments',
      request,
      key,
    );
  }
  /** Historical evidence snapshot plus whether it is still current (releasable). */
  trainingEvidence(snapshotId: string) {
    return this.api.quiet<TrainingEvidence>('/api/v1/training-evidence/' + snapshotId);
  }
  /**
   * US-016 AC-080: records an Administrator's declaration that external reporting was done manually.
   * Vairas transmits nothing; the snapshot must be a current Ready completion-report snapshot.
   */
  declareReporting(enrollmentId: string, request: ReportingDeclarationRequest, key: string) {
    return this.api.send<ReportingDeclarationResponse>(
      'POST',
      '/api/v1/student-trainings/' + enrollmentId + '/reporting-declarations',
      request,
      key,
      true,
    );
  }
  create(facts: PracticalFacts) {
    return this.api.send<PracticalRecord>('POST', '/api/v1/practical-records', facts);
  }
  revise(record: PracticalRecord, facts: PracticalFacts) {
    return this.api.send<PracticalRecord>(
      'POST',
      '/api/v1/practical-records/' + record.recordId + '/versions',
      { ...facts, expectedRevision: record.revision },
    );
  }
  confirm(record: PracticalRecord) {
    return this.api.send<unknown>(
      'POST',
      '/api/v1/practical-records/' + record.recordId + '/confirmations',
      { revision: record.revision },
    );
  }
  dispute(record: PracticalRecord, reason: string) {
    return this.api.send<unknown>(
      'POST',
      '/api/v1/practical-records/' + record.recordId + '/disputes',
      { revision: record.revision, reason },
    );
  }
  progress(id: string) {
    return this.api.get<Progress>('/api/v1/student-trainings/' + id + '/progress');
  }
  async readiness(id: string, definitionId?: string): Promise<Readiness | null> {
    const rows = await this.api.get<ApiReadiness[]>(
      '/api/v1/student-trainings/' + id + '/readiness',
    );
    const matching = definitionId
      ? rows.filter((r) => r.assessmentDefinitionVersionId === definitionId)
      : rows;
    const current = matching.filter((r) => !r.invalidated);
    const latest = (current.length ? current : matching).at(-1);
    return latest ? normalizeReadiness(latest) : null;
  }
  evaluate(id: string, assessmentDefinitionVersionId: string) {
    return this.api
      .send<ApiReadiness>('POST', '/api/v1/student-trainings/' + id + '/readiness-evaluations', {
        assessmentDefinitionVersionId,
      })
      .then((r) => normalizeReadiness(r));
  }
  decide(
    readiness: Readiness,
    revision: number,
    decision: 'Approved' | 'NotApproved',
    reason: string,
  ) {
    return this.api
      .send<ApiReadiness>(
        'POST',
        '/api/v1/student-trainings/' + readiness.enrollmentId + '/readiness-decisions',
        { evaluationId: readiness.evaluationId, expectedRevision: revision, decision, reason },
      )
      .then((r) => normalizeReadiness(r));
  }
}
export type ApiReadiness = Omit<
  Readiness,
  'decision' | 'prerequisitesSatisfied' | 'outstandingRequirements'
> & {
  decision: 'Approved' | 'NotApproved' | 'Pending' | null;
  prerequisitesSatisfied?: boolean;
  outstandingRequirements?: string[];
};
/** Maps the Learning Tracking readiness contract onto the view model. */
export function normalizeReadiness(r: ApiReadiness): Readiness {
  if (r.prerequisitesSatisfied !== undefined && r.outstandingRequirements)
    return { ...r, decision: r.decision ?? 'Pending' } as Readiness;
  return {
    ...r,
    prerequisitesSatisfied: r.formalStatus === 'Satisfied',
    outstandingRequirements: (r.requirements ?? [])
      .filter((x) => x.status !== 'Satisfied')
      .map((x) => x.explanation),
    decision: r.decision ?? 'Pending',
  };
}
