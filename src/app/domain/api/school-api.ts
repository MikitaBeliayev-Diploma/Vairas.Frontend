import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import {
  Branch,
  Catalog,
  CatalogCurriculum,
  Group,
  SchoolEnrollment,
  Teacher,
  Workspace,
  Enrollment,
} from '../models/school-models';
import { ProgramVersion } from '../models/programme-models';
import { Vehicle } from '../models/vehicle-models';
export interface CatalogIdentity {
  userId?: string;
  name?: string;
  studentId?: string | null;
  teacherId?: string | null;
}
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');
export function curriculumOf(v: ProgramVersion): CatalogCurriculum {
  return {
    programVersionId: v.programVersionId,
    topics: v.curriculum.topics.map((t) => ({ id: t.topicId, name: t.name })),
    assessments: v.curriculum.assessments.map((a) => ({
      id: a.definitionVersionId,
      name: a.name,
      stage: a.stage,
      trainingKind: a.trainingKind,
      minimumMark: a.minimumMark,
      maximumMark: a.maximumMark,
      passingMark: a.passingMark,
    })),
  };
}
@Injectable({ providedIn: 'root' })
export class SchoolApi {
  private readonly api = inject(ApiClient);
  workspaces() {
    return this.api.get<
      { schoolId: string; name: string; roles: string[]; permissions: string[] }[]
    >('/api/v1/users/me/schools');
  }
  async catalog(
    schoolId = this.api.context.schoolId(),
    me: CatalogIdentity = {},
    known?: Workspace[],
  ): Promise<Catalog> {
    const schools = known ?? (await this.workspaces());
    const empty: Catalog = {
      schools,
      enrollments: [],
      teachers: [],
      vehicles: [],
      topics: [],
      programVersionId: '',
      branchId: '',
      assessmentDefinitionVersionId: '',
      branches: [],
      groups: [],
      curricula: {},
    };
    if (!schoolId) return empty;
    const workspace = schools.find((s) => s.schoolId === schoolId);
    const admin = !!workspace?.roles.includes('Administrator');
    const base = '/api/v1/schools/' + schoolId;
    const [rows, branches, groups, teachers, vehicles] = await Promise.all([
      this.api.get<SchoolEnrollment[]>(base + '/enrollments'),
      this.api.quiet<Branch[]>(base + '/branches'),
      this.api.quiet<Group[]>(base + '/groups'),
      admin ? this.api.get<Teacher[]>(base + '/teachers') : Promise.resolve<Teacher[]>([]),
      admin
        ? this.api.quiet<{ items: Vehicle[] }>(base + '/vehicles?limit=100')
        : Promise.resolve({ items: [] as Vehicle[] }),
    ]);
    const versionIds = [
      ...new Set(rows.map((e) => e.programVersionId).filter((v): v is string => !!v)),
    ];
    const curricula: Record<string, CatalogCurriculum> = {};
    if (admin)
      await Promise.all(
        versionIds.map((id) =>
          this.api
            .quiet<ProgramVersion>(
              '/api/v1/training-program-versions/' +
                id +
                '?schoolId=' +
                encodeURIComponent(schoolId),
            )
            .then((v) => (curricula[id] = curriculumOf(v))),
        ),
      );
    const first = Object.values(curricula)[0];
    const teacherRows = teachers.map((t) => ({
      id: t.teacherId,
      name: t.userId === me.userId ? (me.name ?? 'You') : 'Teacher ' + shortId(t.teacherId),
    }));
    if (
      me.teacherId &&
      workspace?.roles.includes('Teacher') &&
      !teacherRows.some((t) => t.id === me.teacherId)
    )
      teacherRows.unshift({ id: me.teacherId, name: me.name ?? 'You' });
    const activeBranches = branches.filter((b) => b.status === 'Active');
    return {
      schools,
      enrollments: rows.map((e) => ({
        enrollmentId: e.enrollmentId,
        schoolId: e.schoolId,
        studentId: e.studentId,
        status: e.status,
        category: e.licenseCategory,
        revision: e.version,
        name:
          me.studentId && e.studentId === me.studentId
            ? (me.name ?? 'My enrollment')
            : 'Learner ' + shortId(e.studentId),
        programVersionId: e.programVersionId ?? '',
        groupId: e.groupId ?? '',
      })),
      teachers: teacherRows,
      vehicles: vehicles.items
        .filter((v) => v.status === 'Active')
        .map((v) => ({
          id: v.vehicleId,
          label: v.registrationNumber + ' · ' + v.manufacturer + ' ' + v.model,
        })),
      topics: first?.topics ?? [],
      programVersionId: first?.programVersionId ?? '',
      branchId: activeBranches[0]?.branchId ?? '',
      assessmentDefinitionVersionId:
        first?.assessments.find((a) => a.stage === 'Final')?.id ?? first?.assessments[0]?.id ?? '',
      branches: activeBranches.map((b) => ({ id: b.branchId, name: b.name })),
      groups: groups
        .filter((g) => !g.endedAt)
        .map((g) => ({ id: g.groupId, name: g.name, categoryCode: g.categoryCode })),
      curricula,
    };
  }
  enrollments() {
    return this.api.get<Enrollment[]>('/api/v1/users/me/enrollments');
  }
}
