import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import {
  ActionPreview,
  ChatHistoryMessage,
  ChatSessionInfo,
  AssistantAuditEntry,
} from '../models/chat-models';
import { Booking, SchedulingOperation } from '../models/scheduling-models';
@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly api = inject(ApiClient);
  /**
   * Administrators ask for a session that may execute confirmed lesson actions; when the provider has
   * that profile disabled (or for other roles) the session is preview-only.
   */
  async session(confirmedActions = false) {
    type Created = { sessionId: string; executionProfile?: string };
    const schoolId = this.api.context.schoolId();
    if (confirmedActions) {
      try {
        return await this.api.send<Created>(
          'POST',
          '/api/v1/chat/sessions',
          { schoolId, executionProfile: 'ConfirmedLessonActionsV1' },
          undefined,
          true,
        );
      } catch (e) {
        const code = (e as { error?: { code?: string } })?.error?.code;
        if (code !== 'LESSON_ACTIONS_DISABLED' && code !== 'ACCESS_DENIED') throw e;
      }
    }
    return this.api.send<Created>('POST', '/api/v1/chat/sessions', {
      schoolId,
      executionProfile: 'PreviewOnlyV1',
    });
  }
  sessions() {
    return this.api.get<(ChatSessionInfo & { executionProfile?: string })[]>(
      '/api/v1/chat/sessions?limit=20',
    );
  }
  history(id: string) {
    return this.api.get<ChatHistoryMessage[]>(
      '/api/v1/chat/sessions/' + id + '/messages?limit=100',
    );
  }
  message(id: string, text: string, schoolId: string) {
    return this.api.send<{
      messageId: string;
      text: string;
      previewId?: string | null;
      runId?: string;
    }>('POST', '/api/v1/chat/sessions/' + id + '/messages', { text, schoolId });
  }
  async preview(id: string): Promise<ActionPreview> {
    const p = await this.api.get<{
      previewId: string;
      operationId: string;
      kind: string;
      arguments: Record<string, unknown>;
      display: Record<string, unknown> | null;
      argumentsFingerprint: string;
      expiresAt: string;
      status: string;
      executionAllowed?: boolean;
    }>('/api/v1/chat/action-previews/' + id);
    const args = p.arguments ?? {};
    return {
      previewId: p.previewId,
      operationId: p.operationId,
      argumentsFingerprint: p.argumentsFingerprint,
      expiresAt: p.expiresAt,
      kind: /resched/i.test(p.kind) ? 'Rescheduling' : 'Booking',
      arguments: args as unknown as Booking,
      lessonId: (args['lessonId'] as string | undefined) ?? undefined,
      expectedVersion: (args['expectedVersion'] as number | undefined) ?? undefined,
      reason: (args['reason'] as string | undefined) ?? undefined,
      display: p.display ?? undefined,
      status: p.status,
      executionAllowed: p.executionAllowed,
    };
  }
  execution(preview: ActionPreview) {
    return this.api
      .get<LessonActionReceipt>('/api/v1/chat/action-previews/' + preview.previewId + '/execution')
      .then(receiptToOperation);
  }
  commit(preview: ActionPreview) {
    return this.api
      .send<LessonActionReceipt>(
        'POST',
        '/api/v1/chat/action-previews/' + preview.previewId + '/executions',
        {
          operationId: preview.operationId,
          argumentsFingerprint: preview.argumentsFingerprint,
          approved: true,
        },
        preview.operationId,
      )
      .then(receiptToOperation);
  }
  audit(schoolId: string) {
    return this.api.get<AssistantAuditEntry[]>(
      '/api/v1/schools/' + schoolId + '/assistant-audit?limit=100',
    );
  }
}
interface LessonActionReceipt {
  operationId: string;
  status: string;
  lessonId?: string | null;
  version?: number | null;
  code?: string | null;
}
export function receiptToOperation(r: LessonActionReceipt): SchedulingOperation {
  const known = ['Pending', 'Committed', 'Rejected', 'ReconciliationPending'];
  const status = known.includes(r.status)
    ? r.status
    : /succe|complet|commit|creat|resched/i.test(r.status)
      ? 'Committed'
      : /reject|fail|denied|conflict/i.test(r.status)
        ? 'Rejected'
        : 'Unknown';
  return {
    operationId: r.operationId,
    status: status as SchedulingOperation['status'],
    lessonIds: r.lessonId ? [r.lessonId] : [],
    code: r.code ?? undefined,
  };
}
