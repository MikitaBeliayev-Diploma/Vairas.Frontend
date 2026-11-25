export interface TrainingProgram {
  programId: string;
  schoolId: string;
  categoryCode: string;
  name: string;
  revision: number;
}

export interface CurriculumTopic {
  topicId: string;
  key: string;
  name: string;
  description?: string | null;
}

export interface AssessmentRequirement {
  requirementId: string;
  code: string;
  kind: string;
  minimumMinutes?: number;
  [key: string]: unknown;
}

export interface AssessmentDefinition {
  definitionId: string;
  definitionVersionId: string;
  code: string;
  name: string;
  trainingKind: 'Theory' | 'Practical';
  stage: string;
  minimumMark: number;
  maximumMark: number;
  passingMark: number;
  requiredForCompletion: boolean;
  topicIds: string[];
  requirements: AssessmentRequirement[];
}

export interface RuleSource {
  sourceId: string;
  ruleCode: string;
  sourceUri: string;
  edition: string;
  applicability: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  unitDescription: string;
  verified: boolean;
}

export interface PlanningPolicy {
  kind: 'Theory' | 'Practical';
  lessonMinutes: number;
  allowShortFinalLesson: boolean;
  minimumFinalLessonMinutes: number;
}

export interface Curriculum {
  schoolId: string;
  expectedRevision: number;
  pathwayCode: string;
  requiredTheoryMinutes: number;
  requiredPracticalMinutes: number;
  theoryMinutesPerUnit: number;
  practicalMinutesPerUnit: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  checklistVersionId: string;
  topics: CurriculumTopic[];
  assessments: AssessmentDefinition[];
  sources: RuleSource[];
  planningPolicies: PlanningPolicy[];
}

export interface ProgramVersion {
  programVersionId: string;
  programId: string;
  schoolId: string;
  version: number;
  status: 'Draft' | 'Published' | 'Retired';
  revision: number;
  curriculum: Curriculum;
}
