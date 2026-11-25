import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session';
import { Role } from '../domain/models/session-models';
/** Navigation guards are UX only; every API call is authorized by the owning service. */
export const authenticated: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (session.session() || (await session.restore())) return true;
  return router.createUrlTree(['/login']);
};
/** Sends identities without a profile or school membership to onboarding. */
export const workspaceReady: CanActivateFn = () => {
  const session = inject(SessionStore);
  return session.onboarding() ? inject(Router).createUrlTree(['/onboarding']) : true;
};
export const roles =
  (...allowed: Role[]): CanActivateFn =>
  () =>
    inject(SessionStore).has(...allowed) ? true : inject(Router).createUrlTree(['/forbidden']);
export const permission =
  (name: string): CanActivateFn =>
  () =>
    inject(SessionStore).can(name) ? true : inject(Router).createUrlTree(['/forbidden']);
