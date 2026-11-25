export interface Vehicle {
  vehicleId: string;
  schoolId: string;
  branchId: string;
  registrationCountryCode: string;
  registrationNumber: string;
  manufacturer: string;
  model: string;
  manufactureYear: number;
  transmission: 'Manual' | 'Automatic';
  status: 'Active' | 'Inactive' | 'UnderMaintenance';
  revision: number;
  categories: string[];
  teacherAssignments: { teacherId: string; schoolMembershipId: string; assignedAt: string }[];
}

export interface VehicleInput {
  branchId: string;
  registrationCountryCode: string;
  registrationNumber: string;
  manufacturer: string;
  model: string;
  manufactureYear: number;
  transmission: 'Manual' | 'Automatic';
  categories: string[];
}

export interface VehicleStateChange {
  operationId: string;
  vehicleId: string;
  operationType: 'Deactivate' | 'Reactivate';
  status:
    | 'Pending'
    | 'Blocking'
    | 'SchedulingBlocked'
    | 'ApplyingVehicleState'
    | 'ReleasingBlock'
    | 'Completed'
    | 'Rejected'
    | 'NeedsRecovery';
  resultVehicleStatus: string | null;
  errorCode: string | null;
}
