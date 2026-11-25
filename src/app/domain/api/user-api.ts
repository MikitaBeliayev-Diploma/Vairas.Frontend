import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { Profile } from '../models/session-models';
@Injectable({ providedIn: 'root' })
export class UserApi {
  create(firstName: string, lastName: string, phoneNumber: string | null = null) {
    return this.api.send<unknown>('POST', '/api/v1/users/me', {
      firstName,
      lastName,
      emailAddress: null,
      phoneNumber,
    });
  }
  private readonly api = inject(ApiClient);
  async profile() {
    const profile = await this.api.get<Profile>('/api/v1/users/me');
    if (typeof profile.revision === 'number' && !Number.isSafeInteger(profile.revision))
      throw new Error(
        'Profile revision exceeds safe integer precision. The provider must send its supported string representation.',
      );
    return profile;
  }
  update(profile: Profile, key?: string) {
    return this.api.send<unknown>(
      'PUT',
      '/api/v1/users/me',
      {
        firstName: profile.firstName,
        lastName: profile.lastName,
        emailAddress: profile.emailAddress,
        phoneNumber: profile.phoneNumber,
        expectedRevision: profile.revision,
      },
      key,
    );
  }
}
