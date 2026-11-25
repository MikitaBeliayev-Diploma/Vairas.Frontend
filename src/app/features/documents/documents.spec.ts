import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from './documents';
import { DocumentsApi } from '../../domain/api/documents-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { DocumentVersion, DocumentView } from '../../domain/models/document-models';
const version: DocumentVersion = {
  documentVersionId: 'v2',
  versionNo: 2,
  state: 'PublishedReady',
  revision: 3,
  snapshotId: 'snapshot',
  dependencyRevision: 1,
  evidenceStatus: 'Ready',
  templateVersionId: 'template',
  reviewed: true,
};
const doc: DocumentView = {
  jobId: 'job',
  status: 'Completed',
  documentId: 'doc',
  kind: 'CompletionReport',
  createdAt: '2026-01-01',
  enrollmentId: 'e',
  currentVersionId: 'v2',
  versions: [{ ...version, documentVersionId: 'v1' }, version],
};
function setup() {
  const api = {
    list: vi.fn().mockResolvedValue([doc]),
    snapshot: vi.fn().mockResolvedValue({ sourceSnapshotVersion: 'snapshot', issues: [] }),
    generate: vi.fn().mockResolvedValue({ jobId: 'job' }),
    job: vi.fn().mockResolvedValue({ jobId: 'job', status: 'Completed' }),
    versionCommand: vi.fn().mockResolvedValue(undefined),
    download: vi.fn(),
  };
  const admin = signal(true);
  const feedback = { done: vi.fn(), fail: vi.fn(), error: signal('') };
  TestBed.configureTestingModule({
    imports: [DocumentsPage],
    providers: [
      { provide: DocumentsApi, useValue: api },
      {
        provide: SessionStore,
        useValue: { has: () => admin(), enrollments: signal([{ enrollmentId: 'e' }]) },
      },
      { provide: Feedback, useValue: feedback },
    ],
  });
  TestBed.overrideComponent(DocumentsPage, { set: { template: '' } });
  const page = TestBed.createComponent(DocumentsPage).componentInstance;
  page.enrollmentId.set('e');
  return { page, api, feedback, admin };
}
describe('Document generation and version actions', () => {
  it('ignores stale lists when changing enrollment and handles failed reads', async () => {
    const { page, api } = setup();
    let resolve!: (v: DocumentView[]) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const first = page.load();
    page.enrollmentId.set('other');
    api.list.mockResolvedValueOnce([]);
    await page.load();
    resolve([doc]);
    await first;
    expect(page.documents()).toEqual([]);
    api.list.mockRejectedValueOnce(new Error('Unavailable'));
    await page.load();
    expect(page.failed()).toBe(true);
    page.enrollmentId.set('');
    await page.load();
    expect(page.loading()).toBe(false);
  });
  it('generates from the authoritative snapshot and reports missing information rather than publication', async () => {
    const { page, api, feedback } = setup();
    api.snapshot.mockResolvedValue({
      sourceSnapshotVersion: 'snapshot',
      issues: ['hours missing'],
    });
    api.job.mockResolvedValue({ status: 'Completed', missingItems: ['hours missing'] });
    await page.generate('completion-reports');
    expect(api.generate).toHaveBeenCalledWith(
      'e',
      'snapshot',
      'completion-reports',
      expect.any(String),
    );
    expect(page.snapshotIssues()).toEqual(['hours missing']);
    expect(feedback.done).toHaveBeenCalledWith(expect.stringContaining('missing information'));
    expect(page.pendingJob()).toBe('');
    expect(page.busy()).toBe(false);
    expect(api.list).toHaveBeenCalledWith('e');
  });
  it('preserves generation identity across failed attempts and reports a terminal job failure', async () => {
    const { page, api, feedback } = setup();
    api.generate.mockRejectedValueOnce(new Error('Network'));
    await page.generate('journals');
    expect(page.pendingJob()).toBe('');
    api.job.mockResolvedValue({ status: 'Failed', errorCode: 'STORAGE_ERROR' });
    await page.generate('journals');
    expect(api.generate.mock.calls[0]).toEqual(api.generate.mock.calls[1]);
    expect(feedback.fail).toHaveBeenCalledWith(expect.stringContaining('STORAGE_ERROR'));
  });
  it('retains the pending job after a polling error for manual retry', async () => {
    const { page, api } = setup();
    api.job.mockRejectedValueOnce(new Error('Network'));
    await page.generate('journals');
    expect(page.pendingJob()).toBe('job');
    await page.poll();
    expect(page.pendingJob()).toBe('');
  });
  it('requires a version command reason and uses the selected exact version', async () => {
    const { page, api, feedback } = setup();
    expect(page.currentVersion(doc)).toEqual(version);
    page.openCommand(doc, version, 'publish');
    page.reason.set(' ');
    await page.command();
    expect(api.versionCommand).not.toHaveBeenCalled();
    page.reason.set(' Checked ');
    await page.command();
    expect(api.versionCommand).toHaveBeenCalledWith(doc, version, 'publish', 'Checked', 'Ready');
    expect(page.commandTarget()).toBeNull();
    expect(feedback.done).toHaveBeenCalledWith('Document publish recorded.');
  });
  it('prevents manual declaration for non-admins and surfaces download failure', async () => {
    const { page, api, admin, feedback } = setup();
    admin.set(false);
    expect(page.canDeclare(doc, version)).toBe(false);
    api.download.mockRejectedValueOnce(new Error('Network'));
    await page.download(doc, 'v2');
    expect(api.download).toHaveBeenCalledWith(doc, 'pdf', 'v2');
    expect(feedback.fail).toHaveBeenCalled();
    expect(page.busy()).toBe(false);
  });
});
