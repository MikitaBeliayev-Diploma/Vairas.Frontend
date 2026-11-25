import { Injectable, computed, inject, signal } from '@angular/core';
import { SchedulingApi } from '../domain/api/scheduling-api';
import { Lesson } from '../domain/models/scheduling-models';
import { SessionStore } from './session';
/** Scheduling allows at most 31 days per lesson query. */
const PAST_DAYS = 7;
const FUTURE_DAYS = 23;
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly api = inject(SchedulingApi);
  private readonly session = inject(SessionStore);
  private readonly scope = signal(-1);
  private generation = 0;
  private readonly raw = signal<Lesson[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  /** Lessons enriched with display labels from the school catalog (live lessons carry IDs only). */
  readonly lessons = computed(() => {
    if (this.scope() !== this.session.epoch()) return [];
    const catalog = this.session.catalog();
    const teachers = new Map((catalog?.teachers ?? []).map((t) => [t.id, t.name]));
    const vehicles = new Map((catalog?.vehicles ?? []).map((v) => [v.id, v.label]));
    const enrollments = new Map((catalog?.enrollments ?? []).map((e) => [e.enrollmentId, e.name]));
    const groups = new Map((catalog?.groups ?? []).map((g) => [g.id, g.name]));
    return this.raw().map((l) => ({
      ...l,
      title:
        l.title ??
        (l.kind === 'Theory'
          ? 'Theory lesson' +
            (l.groupId && groups.get(l.groupId) ? ' · ' + groups.get(l.groupId) : '')
          : 'Practical driving lesson'),
      teacherName:
        l.teacherName ??
        (l.teacherId
          ? (teachers.get(l.teacherId) ?? 'Teacher ' + l.teacherId.slice(0, 8))
          : undefined),
      vehicleLabel:
        l.vehicleLabel ?? (l.vehicleId ? (vehicles.get(l.vehicleId) ?? undefined) : undefined),
      studentName:
        l.studentName ??
        (l.enrollmentId ? (enrollments.get(l.enrollmentId) ?? undefined) : undefined),
    }));
  });
  async load() {
    const generation = ++this.generation;
    const scope = this.session.epoch();
    const current = () => generation === this.generation && scope === this.session.epoch();
    if (this.scope() !== scope) {
      this.raw.set([]);
      this.scope.set(scope);
    }
    this.loading.set(true);
    this.failed.set(false);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - PAST_DAYS * 86400000).toISOString();
      const to = new Date(now.getTime() + FUTURE_DAYS * 86400000).toISOString();
      const result = await this.api.lessons(from, to);
      if (current()) this.raw.set([...result].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    } catch {
      if (current()) this.failed.set(true);
    } finally {
      if (current()) this.loading.set(false);
    }
  }
}
