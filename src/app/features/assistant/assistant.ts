import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ChatApi } from '../../domain/api/chat-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { ActionPreview, ChatMessage } from '../../domain/models/chat-models';
import { PageHeader } from '../../shared/page-header';
import { Icon } from '../../shared/icon';
import { ActionConfirmation } from './action-confirmation';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
@Component({
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PageHeader,
    Icon,
    ActionConfirmation,
  ],
  templateUrl: './assistant.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(ChatApi);
  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  readonly messages = signal<ChatMessage[]>([]);
  readonly text = signal('');
  readonly busy = signal(false);
  readonly preview = signal<ActionPreview | null>(null);
  readonly committed = signal(false);
  readonly invalidated = signal(false);
  readonly unknown = signal(false);
  readonly error = signal('');
  readonly historyLoading = signal(false);
  /** PreviewOnlyV1 sessions can explain an action but never execute it. */
  readonly executionProfile = signal('');
  /**
   * Only ConfirmedLessonActionsV1 conversations execute in API mode. The preview's `executionAllowed`
   * is the record-only flag of the legacy confirmation contract and stays false there.
   */
  readonly canExecute = computed(() => this.executionProfile() === 'ConfirmedLessonActionsV1');
  private sessionId = '';
  ngOnInit() {
    void this.resume();
  }
  /** Resumes the latest open session that may execute confirmed lesson actions. */
  private async resume() {
    this.historyLoading.set(true);
    try {
      const sessions = await this.api.sessions();
      const open = sessions
        .filter((x) => x.status === 'Open')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!open || this.destroy.destroyed) return;
      this.sessionId = open.sessionId;
      this.executionProfile.set(open.executionProfile ?? '');
      const history = await this.api.history(open.sessionId);
      if (this.destroy.destroyed || this.messages().length) return;
      this.messages.set(
        [...history]
          .sort((a, b) => a.sequenceNo - b.sequenceNo)
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            messageId: m.messageId,
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.text,
          })),
      );
    } catch {
      /* A fresh session is created on the first message. */
    } finally {
      if (!this.destroy.destroyed) this.historyLoading.set(false);
    }
  }
  newConversation() {
    if (this.busy()) return;
    this.sessionId = '';
    this.executionProfile.set('');
    this.messages.set([]);
    this.preview.set(null);
    this.committed.set(false);
    this.invalidated.set(false);
    this.unknown.set(false);
    this.error.set('');
  }
  async send(suggestion?: string) {
    const text = (suggestion ?? this.text()).trim();
    if (!text || this.busy() || this.unknown()) return;
    if (text.length > 2000) {
      this.error.set('Use no more than 2000 characters.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.preview.set(null);
    this.committed.set(false);
    this.invalidated.set(false);
    this.messages.update((m) => [...m, { messageId: crypto.randomUUID(), role: 'user', text }]);
    this.text.set('');
    try {
      if (!this.sessionId) {
        const created = await this.api.session(this.auth.has('Administrator'));
        this.sessionId = created.sessionId;
        this.executionProfile.set(created.executionProfile ?? '');
      }
      const reply = await this.api.message(this.sessionId, text, this.auth.session()!.schoolId);
      if (this.destroy.destroyed) return;
      this.messages.update((m) => [
        ...m,
        {
          messageId: reply.messageId,
          text: reply.text,
          role: 'assistant',
          previewId: reply.previewId ?? undefined,
        },
      ]);
      if (reply.previewId) this.preview.set(await this.api.preview(reply.previewId));
    } catch {
      if (!this.destroy.destroyed)
        this.error.set(
          'The assistant could not complete the request. No success has been confirmed.',
        );
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
  async approve() {
    const p = this.preview();
    if (!p || this.busy() || this.unknown() || this.committed()) return;
    this.busy.set(true);
    try {
      // API mode: the execution command itself records the exact approval (ConfirmedLessonActionsV1);
      // the record-only /confirmations endpoint is not part of that flow.
      const result = await this.api.commit(p);
      if (this.destroy.destroyed) return;
      this.committed.set(result.status === 'Committed');
      this.unknown.set(['Pending', 'ReconciliationPending', 'Unknown'].includes(result.status));
      if (result.status === 'Committed')
        this.feedback.done('Approved action committed. Your schedule has been updated.');
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
        this.unknown.set(true);
      else this.invalidated.set(true);
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
  async reconcile() {
    const p = this.preview();
    if (!p) return;
    this.busy.set(true);
    try {
      const result = await this.api.execution(p);
      if (result.status === 'Committed') {
        this.committed.set(true);
        this.unknown.set(false);
      } else if (result.status === 'Rejected') {
        this.invalidated.set(true);
        this.unknown.set(false);
      }
    } catch {
      /* Preserve operation identity and unknown state. */
    } finally {
      this.busy.set(false);
    }
  }
}
