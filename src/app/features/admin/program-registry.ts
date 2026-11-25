import { Injectable, inject } from '@angular/core';
import { ProgramApi } from '../../domain/api/program-api';
import { ProgramVersion, TrainingProgram } from '../../domain/models/programme-models';

/** Retrieves retained versions from Learning Tracking; browser storage is never used for discovery. */
@Injectable({ providedIn: 'root' })
export class ProgramRegistry {
  private readonly api = inject(ProgramApi);
  async versions(knownPrograms?: TrainingProgram[]): Promise<ProgramVersion[]> {
    const programs = knownPrograms ?? (await this.api.list());
    const versions = await Promise.all(
      programs.map((program) => this.api.versions(program.programId)),
    );
    return versions.flat();
  }
}
