import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { apiInterceptor } from './http';
import { SessionStore } from './session';
import { Feedback } from './feedback';
function setup() {
  const auth = {
    session: signal(null),
    cancelled: new Subject<void>(),
    refresh: vi.fn().mockRejectedValue(new Error('refresh unavailable')),
    reset: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      provideHttpClient(withInterceptors([apiInterceptor])),
      provideHttpClientTesting(),
      { provide: SessionStore, useValue: auth },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
    feedback: TestBed.inject(Feedback),
    auth,
  };
}
describe('API request boundary', () => {
  it.each([
    [401, 'Sign in again'],
    [404, 'not found'],
    [500, 'could not complete'],
    [503, 'unavailable'],
  ] as const)('handles HTTP %s with the appropriate recovery message', async (status, message) => {
    const { http, controller, feedback, auth } = setup();
    http.get('/api/v1/anything').subscribe({ error: () => undefined });
    controller.expectOne('/api/v1/anything').flush(
      {
        title: 'Unexpected backend details',
        code: 'HTTP_ERROR',
        correlationId: 'test-reference',
      },
      { status, statusText: 'Rejected' },
    );
    await vi.waitFor(() => expect(feedback.error()).toContain(message));
    if (status >= 500) expect(feedback.error()).not.toContain('Unexpected backend details');
    if (status === 401) expect(auth.reset).toHaveBeenCalledOnce();
    controller.verify();
  });
  it('adds a correlation ID and displays a safe permission error', () => {
    const { http, controller, feedback } = setup();
    http.get('/api/v1/anything').subscribe({ error: () => undefined });
    const req = controller.expectOne('/api/v1/anything');
    expect(req.request.headers.get('X-Correlation-ID')).toMatch(/^[0-9a-f-]{36}$/);
    req.flush(
      { title: 'Permission denied', code: 'ACCESS_DENIED', correlationId: 'test-reference' },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(feedback.error()).toContain('permission');
    expect(feedback.error()).toContain('test-reference');
    controller.verify();
  });
  it('cancels an outstanding request when the actor or school context changes', () => {
    const { http, controller, auth } = setup();
    const next = vi.fn();
    http.get('/api/v1/anything').subscribe(next);
    const req = controller.expectOne('/api/v1/anything');
    auth.cancelled.next();
    expect(req.cancelled).toBe(true);
    expect(next).not.toHaveBeenCalled();
    controller.verify();
  });
});
