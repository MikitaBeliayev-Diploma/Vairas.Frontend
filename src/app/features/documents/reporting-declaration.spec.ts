import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningApi } from '../../domain/api/learning-api';
import { Feedback } from '../../core/feedback';
import { SessionStore } from '../../core/session';
import { ReportingDeclarationPanel } from './reporting-declaration';

function setup() {
  const learning = {
    reportingDeclarations: vi.fn().mockResolvedValue([]),
    trainingEvidence: vi.fn().mockResolvedValue({
      snapshotId: 'snap-0001',
      kind: 'CompletionReport',
      status: 'Ready',
      current: true,
    }),
    declareReporting: vi.fn().mockResolvedValue({
      declarationId: 'decl-0001',
      snapshotId: 'snap-0001',
      declaredAt: '2026-11-25T10:00:00Z',
    }),
  };
  TestBed.configureTestingModule({
    imports: [ReportingDeclarationPanel],
    providers: [
      { provide: LearningApi, useValue: learning },
      { provide: Feedback, useValue: { done: vi.fn(), fail: vi.fn() } },
      {
        provide: SessionStore,
        useValue: {
          session: signal({ schoolId: 's1', userId: 'u1', name: 'Ada Admin' }),
          profile: signal(null),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReportingDeclarationPanel);
  fixture.componentRef.setInput('enrollmentId', 'e1');
  fixture.componentRef.setInput('snapshotId', 'snap-0001');
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, learning };
}

describe('ReportingDeclarationPanel', () => {
  beforeEach(() => localStorage.clear());
  it('does not record anything until the administrator confirms the no-transmission notice', async () => {
    const { fixture, panel, learning } = setup();
    await panel.start();
    fixture.detectChanges();
    expect(learning.trainingEvidence).toHaveBeenCalledWith('snap-0001');
    expect(document.body.textContent).toContain('Vairas does not transmit anything');
    panel.form.patchValue({ statement: 'Reported manually in the Regitra portal' });
    await panel.submit();
    expect(learning.declareReporting).not.toHaveBeenCalled();
    expect(panel.error()).toMatch(/sends nothing/);
    expect(panel.open()).toBe(true);
  });
  it('requires a statement and then shows a user-recorded declaration with actor and time', async () => {
    const { fixture, panel, learning } = setup();
    await panel.start();
    panel.form.patchValue({ statement: '  ', acknowledged: true });
    await panel.submit();
    expect(learning.declareReporting).not.toHaveBeenCalled();
    expect(panel.statementError()).toContain('Describe');
    panel.form.patchValue({ statement: 'Reported manually in the Regitra portal' });
    await panel.submit();
    expect(learning.declareReporting).toHaveBeenCalledWith(
      'e1',
      { snapshotId: 'snap-0001', statement: 'Reported manually in the Regitra portal' },
      expect.any(String),
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(panel.open()).toBe(false);
    expect(text).toContain('User-recorded declaration');
    expect(text).toContain('Ada Admin');
    expect(text).toContain('Not a verified Regitra acknowledgement');
  });
  it('retrieves historical declarations in a fresh browser without local storage', async () => {
    const { panel, learning } = setup();
    learning.reportingDeclarations.mockResolvedValue([
      {
        declarationId: 'historic',
        snapshotId: 'snap-0001',
        actorUserId: 'other-admin',
        declaredAt: '2026-11-24T10:00:00Z',
        statement: 'Reported previously',
      },
    ] as never);
    await panel.loadHistory();
    expect(learning.reportingDeclarations).toHaveBeenCalledWith('e1');
    expect(panel.recorded().map((d) => d.declarationId)).toEqual(['historic']);
    expect(localStorage.length).toBe(0);
  });
});
