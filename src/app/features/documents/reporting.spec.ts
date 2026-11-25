import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { LearningApi } from '../../domain/api/learning-api';
import { ApiContext } from '../../core/api-context';
import { APP_CONFIG } from '../../core/config';
import { DocumentVersion, DocumentView } from '../../domain/models/document-models';
import {
  DECLARATION_STATEMENT_MAX,
  ReportingDeclarations,
  declarableVersion,
  declarationCodeMessages,
  declarationStatementError,
} from './reporting';
import { SessionStore } from '../../core/session';

const URL = '/api/v1/student-trainings/e1/reporting-declarations?schoolId=s1';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
      {
        provide: SessionStore,
        useValue: {
          session: signal({ schoolId: 's1', userId: 'u1', name: 'Ada Admin' }),
          profile: signal({ userId: 'u1', firstName: 'Ada', lastName: 'Admin' }),
        },
      },
    ],
  });
  TestBed.inject(ApiContext).schoolId.set('s1');
  return {
    service: TestBed.inject(ReportingDeclarations),

    api: TestBed.inject(LearningApi),
    http: TestBed.inject(HttpTestingController),
  };
}
const flushMicrotasks = () => new Promise((r) => setTimeout(r));

describe('Reporting declarations (US-016 AC-080)', () => {
  beforeEach(() => localStorage.clear());
  it('validates the statement like Learning Tracking', () => {
    expect(declarationStatementError('   ')).toContain('Describe');
    expect(declarationStatementError('x'.repeat(DECLARATION_STATEMENT_MAX + 1))).toContain(
      String(DECLARATION_STATEMENT_MAX),
    );
    expect(declarationStatementError(' Reported manually ')).toBeNull();
  });
  it('offers a declaration only for a reviewed completion report published as ready', () => {
    const document = { kind: 'CompletionReport' } as DocumentView;
    const version = {
      state: 'PublishedReady',
      reviewed: true,
      evidenceStatus: 'Ready',
      snapshotId: 'snap',
    } as DocumentVersion;
    expect(declarableVersion(document, version)).toBe(true);
    expect(declarableVersion(document, { ...version, state: 'PublishedReview' })).toBe(false);
    expect(declarableVersion(document, { ...version, state: 'Prepared' })).toBe(false);
    expect(declarableVersion({ kind: 'PracticalJournal' } as DocumentView, version)).toBe(false);
  });
  it('requires explicit confirmation before calling the API', async () => {
    const { service, http } = setup();
    await expect(service.declare('e1', 'snap', 'Reported manually', false)).rejects.toThrow(
      /sends nothing/,
    );
    http.expectNone(URL);
  });
  it('posts the trimmed statement, reuses the key on retry and remembers actor and time', async () => {
    const { service, http } = setup();
    const first = service.declare('e1', 'snap', '  Reported in the Regitra portal  ', true);
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      snapshotId: 'snap',
      statement: 'Reported in the Regitra portal',
    });
    const key = req.request.headers.get('Idempotency-Key');
    req.flush({ code: 'UNAVAILABLE' }, { status: 503, statusText: 'Unavailable' });
    await expect(first).rejects.toThrow(/same Idempotency-Key/);

    const retry = service.declare('e1', 'snap', 'Reported in the Regitra portal', true);
    const again = http.expectOne(URL);
    expect(again.request.headers.get('Idempotency-Key')).toBe(key);
    again.flush(
      { declarationId: 'd1', snapshotId: 'snap', declaredAt: '2026-11-25T10:00:00Z' },
      { status: 201, statusText: 'Created' },
    );
    const declaration = await retry;
    expect(declaration).toMatchObject({
      declarationId: 'd1',
      actorName: 'Ada Admin',
      actorUserId: 'u1',
      declaredAt: '2026-11-25T10:00:00Z',
    });
    expect(localStorage.length).toBe(0);

    const changed = service.declare('e1', 'snap', 'Corrected statement', true);
    await flushMicrotasks();
    const third = http.expectOne(URL);
    expect(third.request.headers.get('Idempotency-Key')).not.toBe(key);
    third.flush(
      { code: 'CURRENT_READY_COMPLETION_REPORT_REQUIRED', correlationId: 'c1' },
      { status: 422, statusText: 'Unprocessable' },
    );
    await expect(changed).rejects.toThrow(
      declarationCodeMessages['CURRENT_READY_COMPLETION_REPORT_REQUIRED'],
    );
    http.verify();
  });
  it('reads the referenced evidence snapshot', async () => {
    const { api, http } = setup();
    const read = api.trainingEvidence('snap');
    http.expectOne('/api/v1/training-evidence/snap?schoolId=s1').flush({
      snapshotId: 'snap',
      kind: 'CompletionReport',
      status: 'Ready',
      current: true,
    });
    expect((await read).current).toBe(true);
  });
});
