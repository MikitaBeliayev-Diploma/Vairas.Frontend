import { Injectable, inject } from '@angular/core';
import { ApiClient } from './api-client';
@Injectable({ providedIn: 'root' })
export class AuthenticationApi {
  register(email: string, password: string) {
    return this.api.send<unknown>('POST', '/api/v1/auth/registrations', { email, password });
  }
  verify(challengeToken: string, newPassword: string | null = null) {
    return this.api.send<unknown>('POST', '/api/v1/auth/challenges/completion', {
      challengeToken,
      newPassword,
    });
  }
  challenge(email: string, purpose: 'VerifyEmail' | 'ResetPassword') {
    return this.api.send<unknown>('POST', '/api/v1/auth/challenges', { email, purpose });
  }
  private readonly api = inject(ApiClient);
  login(email: string, password: string) {
    return this.api.send<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      sessionId: string;
    }>('POST', '/api/v1/auth/login', { email, password });
  }
  refresh(refreshToken: string) {
    return this.api.send<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      'POST',
      '/api/v1/auth/refresh',
      { refreshToken },
    );
  }
  revoke(sessionId: string) {
    return this.api.send<unknown>('POST', '/api/v1/auth/sessions/' + sessionId + '/revocation', {});
  }
}
