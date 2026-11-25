export interface Problem {
  title: string;
  status: number;
  code: string;
  correlationId: string;
  errors?: Record<string, string[]>;
}

export interface MutationResponse<T> {
  operationId: string;
  resource: T | null;
  replayed: boolean;
}

export interface OperationReceipt {
  operationId: string;
  outcome: string;
  code: string;
  targetKind: string;
  targetId: string;
  resultingRevision: number | null;
  recordedAt: string;
}
