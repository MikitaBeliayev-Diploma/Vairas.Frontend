import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { RulesPage } from './rules';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { SessionStore } from '../../core/session';

describe('School rule history', () => {
  it('loads historical rules from Scheduling without browser records', async () => {
    localStorage.clear();
    const api = {
      ruleHistory: vi.fn().mockResolvedValue([
        {
          ruleVersionId: 'v1',
          ruleId: 'r1',
          revision: 2,
          effectiveNow: true,
          superseded: false,
          verificationStatus: 'Verified',
        },
        {
          ruleVersionId: 'v0',
          ruleId: 'r1',
          revision: 1,
          effectiveNow: false,
          superseded: true,
          verificationStatus: 'Verified',
        },
      ]),
    };
    TestBed.configureTestingModule({
      imports: [RulesPage],
      providers: [
        { provide: LessonAdminApi, useValue: api },
        { provide: SessionStore, useValue: { session: signal({ schoolId: 'school' }) } },
      ],
    });
    const fixture = TestBed.createComponent(RulesPage);
    await fixture.componentInstance.loadHistory();
    expect(api.ruleHistory).toHaveBeenCalledWith('school');
    expect(fixture.componentInstance.published().map((r) => r.status)).toEqual([
      'Effective',
      'Superseded',
    ]);
    expect(localStorage.length).toBe(0);
  });
});
