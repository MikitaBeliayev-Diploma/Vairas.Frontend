import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthenticationApi } from './authentication-api';
import { SchoolApi } from '../domain/api/school-api';
import { UserApi } from '../domain/api/user-api';
import { Catalog, Workspace } from '../domain/models/school-models';
import { Profile, Role, Session } from '../domain/models/session-models';
import { ApiContext } from './api-context';
import { Feedback } from './feedback';

/**
 * Only the rotating refresh token and the selected workspace survive a reload (sessionStorage, per tab).
 * Access tokens stay in memory. A restored session always rotates the refresh token first.
 */
const STORAGE_KEY = 'vairas.session';
interface StoredSession {
  refreshToken: string;
  sessionId: string;
  schoolId: string;
  enrollmentId: string;
}
function readStored(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
function writeStored(value: StoredSession | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage can be unavailable (private mode); the session then lasts until reload. */
  }
}
export function roleFor(workspace: Workspace | undefined): Role {
  if (!workspace) return 'Student';
  return workspace.roles.includes('Administrator')
    ? 'Administrator'
    : workspace.roles.includes('Teacher')
      ? 'Instructor'
      : 'Student';
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly context = inject(ApiContext);
  private readonly auth = inject(AuthenticationApi);
  private readonly school = inject(SchoolApi);
  private readonly users = inject(UserApi);
  private readonly router = inject(Router);
  private readonly feedback = inject(Feedback);
  private readonly currentSession = signal<Session | null>(null);
  readonly session = this.currentSession.asReadonly();
  private readonly currentCatalog = signal<Catalog | null>(null);
  readonly catalog = this.currentCatalog.asReadonly();
  private readonly currentProfile = signal<Profile | null>(null);
  readonly profile = this.currentProfile.asReadonly();
  private readonly currentWorkspaces = signal<Workspace[]>([]);
  readonly workspaces = this.currentWorkspaces.asReadonly();
  /** True when the signed-in identity still needs a profile or a school membership. */
  private readonly onboardingRequired = signal(false);
  readonly onboarding = this.onboardingRequired.asReadonly();
  private readonly contextEpoch = signal(0);
  readonly epoch = this.contextEpoch.asReadonly();
  private readonly cancellation = new Subject<void>();
  readonly cancelled = this.cancellation.asObservable();
  private readonly isBusy = signal(false);
  readonly busy = this.isBusy.asReadonly();
  readonly role = computed(() => this.session()?.role);
  readonly workspace = computed(() =>
    this.workspaces().find((w) => w.schoolId === this.session()?.schoolId),
  );
  readonly permissions = computed(() => this.workspace()?.permissions ?? []);
  readonly schoolName = computed(
    () =>
      this.catalog()?.schools.find((s) => s.schoolId === this.session()?.schoolId)?.name ??
      'Select a school',
  );
  readonly enrollments = computed(
    () => this.catalog()?.enrollments.filter((e) => e.schoolId === this.session()?.schoolId) ?? [],
  );
  /** Enrollments that belong to the signed-in student in the current school. */
  readonly myEnrollments = computed(() => {
    const studentId = this.profile()?.studentId;
    return this.role() === 'Student'
      ? this.enrollments().filter((e) => !studentId || e.studentId === studentId)
      : [];
  });
  private refreshToken = '';
  private refreshTask: Promise<string> | null = null;
  private restoreTask: Promise<boolean> | null = null;
  has(...roles: Role[]) {
    const role = this.role();
    return role ? roles.includes(role) : false;
  }
  can(permission: string) {
    return this.permissions().includes(permission);
  }
  async login(email: string, password: string, firstName = '', lastName = '') {
    this.reset();
    this.isBusy.set(true);
    try {
      const tokens = await this.auth.login(email, password);
      this.refreshToken = tokens.refreshToken;
      this.startSession(tokens.accessToken, tokens.sessionId);
      await this.loadIdentity(firstName, lastName);
      await this.router.navigateByUrl(this.onboarding() ? '/onboarding' : '/dashboard');
    } catch (error) {
      this.reset();
      throw error;
    } finally {
      this.isBusy.set(false);
    }
  }
  /** Restores a session after reload from the stored refresh token. Resolves false when not possible. */
  restore(): Promise<boolean> {
    if (this.session()) return Promise.resolve(true);
    this.restoreTask ??= (async () => {
      try {
        const stored = readStored();
        if (!stored?.refreshToken) return false;
        this.isBusy.set(true);
        writeStored(null);
        const tokens = await this.auth.refresh(stored.refreshToken);
        this.refreshToken = tokens.refreshToken;
        this.startSession(tokens.accessToken, stored.sessionId);
        await this.loadIdentity('', '', stored.schoolId, stored.enrollmentId);
        return true;
      } catch {
        this.reset();
        return false;
      } finally {
        this.isBusy.set(false);
        this.restoreTask = null;
      }
    })();
    return this.restoreTask;
  }
  private startSession(accessToken: string, sessionId: string) {
    this.currentSession.set({
      name: '',
      role: 'Student',
      userId: '',
      schoolId: '',
      enrollmentId: '',
      assessor: false,
      accessToken,
      sessionId,
    });
    this.persist();
  }
  /** Loads profile and workspaces after authentication; the owning APIs stay the authorization authority. */
  async loadIdentity(
    firstName = '',
    lastName = '',
    preferredSchool = '',
    preferredEnrollment = '',
  ) {
    let profile: Profile | null = null;
    try {
      profile = await this.users.profile();
    } catch (e) {
      if (!(e instanceof HttpErrorResponse) || e.status !== 404) throw e;
      if (firstName.trim() && lastName.trim()) {
        await this.users.create(firstName.trim(), lastName.trim());
        profile = await this.users.profile();
      }
    }
    this.currentProfile.set(profile);
    this.currentSession.update((s) =>
      s
        ? {
            ...s,
            name: profile ? profile.firstName + ' ' + profile.lastName : '',
            userId: profile?.userId ?? '',
          }
        : s,
    );
    if (!profile) {
      this.onboardingRequired.set(true);
      this.currentCatalog.set(null);
      return;
    }
    const schools = await this.school.workspaces();
    this.currentWorkspaces.set(schools);
    const target = schools.find((s) => s.schoolId === preferredSchool) ?? schools[0];
    if (!target) {
      this.onboardingRequired.set(true);
      this.currentCatalog.set({
        schools: [],
        enrollments: [],
        teachers: [],
        vehicles: [],
        topics: [],
        programVersionId: '',
        branchId: '',
        assessmentDefinitionVersionId: '',
      });
      return;
    }
    this.onboardingRequired.set(false);
    await this.selectApiSchool(target.schoolId, preferredEnrollment, schools);
  }
  private async selectApiSchool(
    schoolId: string,
    preferredEnrollment = '',
    known?: Workspace[],
    expectedEpoch = this.epoch(),
  ) {
    const schools = known ?? (await this.school.workspaces());
    if (expectedEpoch !== this.epoch()) return;
    this.currentWorkspaces.set(schools);
    const school = schools.find((s) => s.schoolId === schoolId);
    if (!school) throw new Error('School membership is no longer available.');
    const profile = this.profile();
    const catalog = await this.school.catalog(
      schoolId,
      {
        userId: profile?.userId,
        name: this.session()?.name || undefined,
        studentId: profile?.studentId,
        teacherId: profile?.teacherId,
      },
      schools,
    );
    if (expectedEpoch !== this.epoch()) return;
    this.context.schoolId.set(schoolId);
    this.currentCatalog.set(catalog);
    const role = roleFor(school);
    const mine =
      role === 'Student'
        ? catalog.enrollments.filter(
            (e) => !profile?.studentId || e.studentId === profile.studentId,
          )
        : [];
    const enrollmentId =
      mine.find((e) => e.enrollmentId === preferredEnrollment)?.enrollmentId ??
      mine.find((e) => e.status === 'Active')?.enrollmentId ??
      mine[0]?.enrollmentId ??
      '';
    this.currentSession.update((s) =>
      s
        ? {
            ...s,
            schoolId,
            role,
            assessor: school.permissions.includes('Assessor'),
            enrollmentId,
          }
        : s,
    );
    this.persist();
  }
  /** Re-reads the catalog for the current school (after admin changes). */
  async reloadCatalog() {
    const s = this.session();
    if (!s) return;
    if (s.schoolId) await this.selectApiSchool(s.schoolId, s.enrollmentId);
    else await this.loadIdentity();
  }
  selectEnrollment(enrollmentId: string) {
    if (!this.myEnrollments().some((e) => e.enrollmentId === enrollmentId)) return;
    this.currentSession.update((s) => (s ? { ...s, enrollmentId } : s));
    this.persist();
  }
  async changeSchool(schoolId: string) {
    this.isBusy.set(true);
    const epoch = this.epoch() + 1;
    this.contextEpoch.set(epoch);
    this.cancellation.next();
    this.currentCatalog.set(null);
    try {
      await this.selectApiSchool(schoolId, '', undefined, epoch);
      if (epoch === this.epoch()) await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      if (epoch === this.epoch()) {
        this.reset();
        this.isBusy.set(false);
        await this.router.navigateByUrl('/login');
      }
      throw error;
    } finally {
      if (epoch === this.epoch()) this.isBusy.set(false);
    }
  }
  async refresh() {
    if (this.refreshTask) return this.refreshTask;
    if (!this.refreshToken) throw new Error('Please sign in again.');
    const epoch = this.epoch();
    const currentRefreshToken = this.refreshToken;
    // A refresh token is single-use; never resend it after an ambiguous failure.
    this.refreshToken = '';
    this.persist();
    this.refreshTask = this.auth
      .refresh(currentRefreshToken)
      .then((t) => {
        if (epoch !== this.epoch()) throw new Error('The session context changed.');
        this.refreshToken = t.refreshToken;
        this.currentSession.update((s) => (s ? { ...s, accessToken: t.accessToken } : s));
        this.persist();
        return t.accessToken;
      })
      .finally(() => {
        this.refreshTask = null;
      });
    return this.refreshTask;
  }
  private persist() {
    const s = this.session();
    if (!s) return;
    writeStored(
      this.refreshToken
        ? {
            refreshToken: this.refreshToken,
            sessionId: s.sessionId,
            schoolId: s.schoolId,
            enrollmentId: s.enrollmentId,
          }
        : null,
    );
  }
  reset() {
    this.context.schoolId.set('');
    this.currentSession.set(null);
    this.currentCatalog.set(null);
    this.currentProfile.set(null);
    this.currentWorkspaces.set([]);
    this.onboardingRequired.set(false);
    this.refreshToken = '';
    writeStored(null);
    this.contextEpoch.update((v) => v + 1);
    this.cancellation.next();
    this.feedback.clear();
  }
  async logout() {
    const s = this.session();
    let revocationUnknown = false;
    if (s) {
      try {
        await this.auth.revoke(s.sessionId);
      } catch {
        revocationUnknown = true;
      }
    }
    this.reset();
    if (revocationUnknown)
      this.feedback.fail('Local session cleared. Server revocation could not be confirmed.');
    await this.router.navigateByUrl('/login');
  }
}
