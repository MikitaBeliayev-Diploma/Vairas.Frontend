import type { Booking } from './scheduling-models';

export interface ChatMessage {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  previewId?: string;
}

export interface ActionPreview {
  previewId: string;
  operationId: string;
  argumentsFingerprint: string;
  expiresAt: string;
  arguments: Booking;
  kind: 'Booking' | 'Rescheduling';
  lessonId?: string;
  expectedVersion?: number;
  reason?: string;
  display?: Record<string, unknown>;
  status?: string;
  executionAllowed?: boolean;
}

export interface AssistantAuditEntry {
  operationId: string;
  tool: string;
  outcome: string;
  recordedAt: string;
}

export interface ChatSessionInfo {
  sessionId: string;
  schoolId: string;
  status: string;
  revision: number;
  createdAt: string;
}

export interface ChatHistoryMessage {
  messageId: string;
  sequenceNo: number;
  role: string;
  text: string;
  createdAt: string;
}
