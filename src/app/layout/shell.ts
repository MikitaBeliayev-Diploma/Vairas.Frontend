import { ThemeToggle } from '../shared/theme-toggle';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { SessionStore } from '../core/session';
import { Feedback } from '../core/feedback';
import { Icon } from '../shared/icon';
@Component({
  selector: 'app-shell',
  imports: [ThemeToggle, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, Icon],
  templateUrl: './shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  readonly auth = inject(SessionStore);
  readonly feedback = inject(Feedback);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  readonly menu = signal(false);
  readonly route = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      tap(() => {
        this.feedback.clear();
        this.menu.set(false);
      }),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );
  readonly links = [
    {
      path: '/dashboard',
      label: 'Overview',
      icon: 'dashboard',
      roles: ['Administrator', 'Instructor', 'Student'],
    },
    {
      path: '/schedule',
      label: 'Schedule',
      icon: 'calendar',
      roles: ['Administrator', 'Instructor', 'Student'],
    },
    { path: '/planning', label: 'Schedule planning', icon: 'plan', roles: ['Administrator'] },
    { path: '/learners', label: 'Learners', icon: 'users', roles: ['Administrator', 'Instructor'] },
    { path: '/training', label: 'My training', icon: 'chart', roles: ['Student'] },
    { path: '/documents', label: 'Documents', icon: 'document', roles: ['Administrator'] },
    {
      path: '/assistant',
      label: 'AI Assistance',
      icon: 'spark',
      roles: ['Administrator', 'Instructor', 'Student'],
    },
  ];
  readonly adminLinks = [
    { path: '/admin/enrollments', label: 'Enrollments', icon: 'users' },
    { path: '/admin/people', label: 'People & invitations', icon: 'profile' },
    { path: '/admin/school', label: 'Branches & groups', icon: 'school' },
    { path: '/admin/vehicles', label: 'Vehicles', icon: 'car' },
    { path: '/admin/programs', label: 'Training programmes', icon: 'document' },
    {
      path: '/admin/rules',
      label: 'Scheduling rules',
      icon: 'plan',
      permission: 'SchoolRuleOwner',
    },
    { path: '/admin/audit', label: 'Reviews & audit', icon: 'check' },
  ];
  focusMain(event: Event) {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }
  selectEnrollment(event: Event) {
    this.auth.selectEnrollment((event.target as HTMLSelectElement).value);
    if (this.router.url.startsWith('/training/'))
      void this.router.navigateByUrl('/training/' + this.auth.session()?.enrollmentId);
  }
  async changeSchool(event: Event) {
    const schoolId = (event.target as HTMLSelectElement).value;
    if (schoolId !== this.auth.session()?.schoolId) {
      this.menu.set(false);
      try {
        await this.auth.changeSchool(schoolId);
      } catch {
        this.feedback.fail('Could not change school. Sign in again to restore your workspace.');
      }
    }
  }
}
