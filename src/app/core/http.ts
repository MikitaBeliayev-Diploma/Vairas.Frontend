import { inject } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, takeUntil, throwError } from 'rxjs';
import { SessionStore } from './session';
import { Feedback } from './feedback';
import { Problem } from '../domain/models/http-models';
import { QUIET } from './api-client';

/** Safe, code-specific explanations for ProblemDetails codes the UI can act on. */
const codeMessages: Record<string, string> = {
  ORIGIN_NOT_ALLOWED:
    'This browser origin is not allowed by the Authentication service. Open the app at https://localhost:4200 and make sure the local stack lists it in Authentication:BrowserOrigins.',
  TRUSTED_CONFIRMATION_ORIGIN_REQUIRED:
    'Assistant confirmations must come from the trusted Vairas web origin.',
  REVISION_CONFLICT: 'Someone changed this item. Reload it and review before trying again.',
  IDEMPOTENCY_KEY_REUSED:
    'This request was already used for different data. Start the action again.',
  QUERY_WINDOW_EXCEEDED: 'The selected period is too long. Choose at most 31 days.',
  CONFIRMATION_EXPIRED: 'The confirmation expired. Review the action again.',
  AUTHENTICATION_FAILED:
    'Sign-in failed. Check the e-mail and password, and verify your e-mail address if you have just registered.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  USER_INACTIVE: 'This account is inactive. Contact your school administrator.',
};

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const feedback = inject(Feedback);
  const router = inject(Router);
  const token = session.session()?.accessToken;
  const correlation = crypto.randomUUID();
  const req = request.clone({
    setHeaders: {
      'X-Correlation-ID': correlation,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  });
  const unauthenticatedPath = /\/auth\/(login|refresh|registrations|challenges)/.test(request.url);
  const handle = (error: unknown, allowRefresh = true): Observable<HttpEvent<unknown>> => {
    if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
    // A 401 means the request was not processed; writes keep their Idempotency-Key on retry.
    if (error.status === 401 && !unauthenticatedPath && allowRefresh) {
      return from(session.refresh()).pipe(
        switchMap((accessToken) =>
          next(req.clone({ setHeaders: { Authorization: 'Bearer ' + accessToken } })),
        ),
        catchError((retryError: unknown) =>
          handle(
            retryError instanceof HttpErrorResponse
              ? retryError
              : new HttpErrorResponse({ status: 401, statusText: 'Authentication required' }),
            false,
          ),
        ),
      );
    }
    const problem = (
      typeof error.error === 'object' ? error.error : null
    ) as Partial<Problem> | null;
    const messages: Record<number, string> = {
      0: 'Cannot reach the service. Check your connection and that the local stack is running.',
      400: 'Please check the entered values.',
      401: 'Your session is no longer valid. Sign in again.',
      403: 'You do not have permission for this action.',
      404: 'This item was not found or is not available to you.',
      409: 'The information changed. Reload and review it before trying again.',
      422: 'The action does not meet its requirements. Review the details.',
      429: 'Too many requests. Wait a moment and try again.',
      500: 'The service could not complete the request.',
      502: 'A required service is unavailable. Please try again later.',
      503: 'A required service is unavailable. Please try again later.',
      504: 'The service took too long to respond. Check the result before retrying.',
    };
    if (error.status === 401 && !unauthenticatedPath) {
      session.reset();
      void router.navigateByUrl('/login');
    }
    if (request.context.get(QUIET)) return throwError(() => error);
    const retryAfter = error.status === 429 ? error.headers.get('Retry-After') : null;
    const known = problem?.code ? codeMessages[problem.code] : undefined;
    const detail =
      known ??
      (messages[error.status] ?? 'Request failed.') +
        (error.status < 500 && typeof problem?.title === 'string'
          ? ' ' + problem.title.slice(0, 240)
          : '');
    const validation = problem?.errors
      ? ' ' +
        Object.entries(problem.errors)
          .slice(0, 3)
          .map(([field, list]) => (field ? field + ': ' : '') + (list ?? []).join(' '))
          .join(' · ')
          .slice(0, 300)
      : '';
    feedback.fail(
      detail +
        validation +
        (retryAfter ? ' Retry after ' + retryAfter + ' s.' : '') +
        (problem?.code && !known ? ' Code: ' + problem.code + '.' : '') +
        ' Reference: ' +
        (problem?.correlationId ?? error.headers?.get('X-Correlation-ID') ?? correlation),
    );
    console.warn('API request rejected', {
      status: error.status,
      code: problem?.code,
      correlationId: problem?.correlationId ?? correlation,
    });
    return throwError(() => error);
  };
  return next(req).pipe(
    catchError((error) => handle(error)),
    takeUntil(session.cancelled),
  );
};
