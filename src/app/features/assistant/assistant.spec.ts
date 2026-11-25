import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { ChatApi } from '../../domain/api/chat-api';
import { Feedback } from '../../core/feedback';
import { ActionPreview } from '../../domain/models/chat-models';
import { SessionStore } from '../../core/session';
import { AssistantPage } from './assistant';

const preview = {
  previewId: 'p1',
  operationId: 'o1',
  argumentsFingerprint: 'f'.repeat(64),
  expiresAt: '2099-01-01T00:00:00.000Z',
  kind: 'Booking',
  arguments: {},
  status: 'AwaitingConfirmation',
  // Record-only flag of the legacy confirmation contract: false even for executable sessions.
  executionAllowed: false,
} as unknown as ActionPreview;

function setup(chat: Partial<ChatApi>) {
  TestBed.configureTestingModule({
    imports: [AssistantPage],
    providers: [
      provideRouter([]),
      {
        provide: SessionStore,
        useValue: {
          has: () => true,
          session: signal({ schoolId: 's1', name: 'Admin' }),
          catalog: signal(null),
          role: signal('Administrator'),
          schoolName: signal('School'),
        },
      },
      { provide: ChatApi, useValue: { sessions: () => Promise.resolve([]), ...chat } },
      { provide: Feedback, useValue: { done: vi.fn(), fail: vi.fn() } },
    ],
  });
  const page = TestBed.createComponent(AssistantPage).componentInstance;
  page.preview.set(preview);
  return page;
}

describe('AssistantPage confirmed lesson actions', () => {
  it('executes a ConfirmedLessonActionsV1 preview directly through the execution command', async () => {
    const approve = vi.fn();
    const commit = vi.fn(() => Promise.resolve({ operationId: 'o1', status: 'Committed' }));
    const page = setup({ approve, commit } as unknown as Partial<ChatApi>);
    page.executionProfile.set('ConfirmedLessonActionsV1');
    expect(page.canExecute()).toBe(true);
    await page.approve();
    expect(approve).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith(preview);
    expect(page.committed()).toBe(true);
  });

  it('keeps preview-only conversations non-executable in API mode', () => {
    const page = setup({});
    page.executionProfile.set('PreviewOnlyV1');
    expect(page.canExecute()).toBe(false);
  });
});
