import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { MutationResponse } from '../models/http-models';
import { Vehicle, VehicleInput, VehicleStateChange } from '../models/vehicle-models';
@Injectable({ providedIn: 'root' })
export class VehicleApi {
  private readonly api = inject(ApiClient);
  async list(schoolId: string) {
    const items: Vehicle[] = [];
    let after = '';
    for (let page = 0; page < 20; page++) {
      const result = await this.api.get<{ items: Vehicle[]; nextCursor: string | null }>(
        '/api/v1/schools/' +
          schoolId +
          '/vehicles?limit=100' +
          (after ? '&after=' + encodeURIComponent(after) : ''),
      );
      items.push(...result.items);
      if (!result.nextCursor) break;
      after = result.nextCursor;
    }
    return items;
  }
  create(schoolId: string, input: VehicleInput, key?: string) {
    return this.api.send<MutationResponse<Vehicle>>(
      'POST',
      '/api/v1/schools/' + schoolId + '/vehicles',
      input,
      key,
    );
  }
  update(vehicle: Vehicle, input: Omit<VehicleInput, 'branchId' | 'categories'>) {
    return this.api.send<MutationResponse<Vehicle>>(
      'PATCH',
      '/api/v1/schools/' + vehicle.schoolId + '/vehicles/' + vehicle.vehicleId,
      { ...input, expectedRevision: vehicle.revision },
    );
  }
  categories(vehicle: Vehicle, categories: string[]) {
    return this.api.send<MutationResponse<Vehicle>>(
      'PUT',
      '/api/v1/schools/' + vehicle.schoolId + '/vehicles/' + vehicle.vehicleId + '/categories',
      { expectedRevision: vehicle.revision, categories },
    );
  }
  teachers(vehicle: Vehicle, teacherIds: string[]) {
    return this.api.send<MutationResponse<Vehicle>>(
      'PUT',
      '/api/v1/schools/' +
        vehicle.schoolId +
        '/vehicles/' +
        vehicle.vehicleId +
        '/teacher-assignments',
      { expectedRevision: vehicle.revision, teacherIds },
    );
  }
  changeState(
    vehicle: Vehicle,
    operationType: 'Deactivate' | 'Reactivate',
    reason: string,
    key?: string,
  ) {
    return this.api.send<VehicleStateChange>(
      'POST',
      '/api/v1/vehicles/' + vehicle.vehicleId + '/state-change-operations',
      { operationType, expectedVehicleRevision: vehicle.revision, reason },
      key,
    );
  }
  stateChange(vehicleId: string, operationId: string) {
    return this.api.get<VehicleStateChange>(
      '/api/v1/vehicles/' + vehicleId + '/state-change-operations/' + operationId,
    );
  }
}

/** Learning Tracking programmes and curricula. */
