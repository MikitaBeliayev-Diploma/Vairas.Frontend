import { Injectable, signal } from '@angular/core';

/**
 * Routes that are not school-scoped by query: authentication, the caller's own profile, workspace
 * and invitation lists, role profiles, and `/schools/{id}/...` routes that carry the school in the path.
 * Every other API route receives `?schoolId=` for the active workspace.
 */
const unscoped =
  /\/auth\/|\/users\/me(?:$|\?|\/schools|\/enrollments|\/invitations|\/\w+-profile)|\/schools\//;

@Injectable({ providedIn: 'root' })
export class ApiContext {
  readonly schoolId = signal('');
  scoped(url: string) {
    if (!this.schoolId() || /[?&]schoolId=/.test(url) || unscoped.test(url)) return url;
    return (
      url + (url.includes('?') ? '&' : '?') + 'schoolId=' + encodeURIComponent(this.schoolId())
    );
  }
}
