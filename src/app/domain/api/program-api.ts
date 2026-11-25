import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { Curriculum, ProgramVersion, TrainingProgram } from '../models/programme-models';
@Injectable({ providedIn: 'root' })
export class ProgramApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<TrainingProgram[]>('/api/v1/training-programs');
  }
  create(schoolId: string, categoryCode: string, name: string, key?: string) {
    return this.api.send<TrainingProgram>(
      'POST',
      '/api/v1/training-programs',
      { schoolId, categoryCode, name },
      key,
    );
  }
  versions(programId: string) {
    return this.api.get<ProgramVersion[]>('/api/v1/training-programs/' + programId + '/versions');
  }
  version(versionId: string, quiet = false) {
    const url = '/api/v1/training-program-versions/' + versionId;
    return quiet ? this.api.quiet<ProgramVersion>(url) : this.api.get<ProgramVersion>(url);
  }
  createVersion(programId: string, curriculum: Curriculum, key?: string) {
    return this.api.send<ProgramVersion>(
      'POST',
      '/api/v1/training-programs/' + programId + '/versions',
      curriculum,
      key,
    );
  }
  updateVersion(version: ProgramVersion, curriculum: Curriculum) {
    return this.api.send<ProgramVersion>(
      'PUT',
      '/api/v1/training-programs/' + version.programId + '/versions/' + version.programVersionId,
      { ...curriculum, expectedRevision: version.revision },
    );
  }
  transition(version: ProgramVersion, transition: 'publish' | 'retire', reason?: string) {
    return this.api.send<ProgramVersion>(
      'POST',
      '/api/v1/training-program-versions/' + version.programVersionId + '/' + transition,
      { expectedRevision: version.revision, reason: reason ?? null },
    );
  }
  startTraining(schoolId: string, enrollmentId: string, programVersionId: string, key?: string) {
    return this.api.send<{ enrollmentId: string; programVersionId: string | null }>(
      'POST',
      '/api/v1/student-trainings',
      { schoolId, enrollmentId, programVersionId },
      key,
    );
  }
}

/** Scheduling additions: theory lessons, availability, corrections, school rules. */
