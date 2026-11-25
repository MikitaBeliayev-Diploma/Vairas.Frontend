import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { OperationReceipt } from '../models/http-models';
@Injectable({ providedIn: 'root' })
export class RoleProfileApi {
  private readonly api = inject(ApiClient);
  create(
    role: 'student' | 'teacher' | 'administrator',
    input: { schoolId?: string | null; invitationId?: string | null } = {},
  ) {
    const body: Record<string, string> = {};
    if (input.schoolId) body['schoolId'] = input.schoolId;
    if (input.invitationId) body['invitationId'] = input.invitationId;
    return this.api.send<OperationReceipt>('POST', '/api/v1/users/me/' + role + '-profile', body);
  }
}
