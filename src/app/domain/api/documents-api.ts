import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { DocumentJob, DocumentVersion, DocumentView } from '../models/document-models';
const documentKinds: Record<string, string> = {
  PracticalJournal: 'Practical training journal',
  Journal: 'Practical training journal',
  CompletionReport: 'Internal completion report',
  Contract: 'Training contract',
};
export const documentKindLabel = (kind: string) => documentKinds[kind] ?? kind;
export function filenameFrom(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const star = /filename\*=(?:UTF-8|utf-8)?'[^']*'([^;]+)/.exec(disposition);
  if (star) return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly api = inject(ApiClient);
  async list(id: string): Promise<DocumentView[]> {
    const rows = await this.api.get<
      {
        documentId: string;
        enrollmentId: string;
        kind: string;
        revision: number;
        currentVersionId: string | null;
        versions: DocumentVersion[];
      }[]
    >('/api/v1/enrollments/' + id + '/documents');
    return rows.map((d) => {
      const versions = [...d.versions].sort((a, b) => b.versionNo - a.versionNo);
      const v = versions.find((x) => x.documentVersionId === d.currentVersionId) ?? versions[0];
      return {
        ...d,
        versions,
        jobId: d.documentId,
        status: 'Completed' as const,
        ready: v?.evidenceStatus === 'Ready',
        documentState: v?.state as DocumentView['documentState'],
        createdAt: '',
        missingItems: [],
      };
    });
  }
  snapshot(
    id: string,
    kind: 'journals' | 'completion-reports' = 'journals',
  ): Promise<{ sourceSnapshotVersion: string; status?: string; issues?: string[] }> {
    return this.api
      .send<{
        snapshotId: string;
        dependencyRevision: number;
        status: string;
        checks: { outcome: string; explanation: string }[];
      }>('POST', '/api/v1/student-trainings/' + id + '/evidence-snapshots', {
        kind: kind === 'journals' ? 'Journal' : 'CompletionReport',
      })
      .then((x) => ({
        sourceSnapshotVersion: 'evidence-' + x.snapshotId + '-' + x.dependencyRevision,
        status: x.status,
        issues: (x.checks ?? []).filter((c) => c.outcome !== 'Passed').map((c) => c.explanation),
      }));
  }
  generate(
    id: string,
    sourceSnapshotVersion: string,
    kind: 'journals' | 'completion-reports',
    key?: string,
  ) {
    return this.api.send<DocumentJob>(
      'POST',
      '/api/v1/enrollments/' + id + '/' + kind,
      { sourceSnapshotVersion },
      key,
    );
  }
  job(id: string) {
    return this.api.get<DocumentJob>('/api/v1/document-jobs/' + id);
  }
  versionCommand(
    document: DocumentView,
    version: DocumentVersion,
    command: 'review' | 'publish' | 'withdraw' | 'select' | 'clear',
    reason: string,
    mode?: string,
  ) {
    return this.api.send<unknown>(
      'POST',
      '/api/v1/documents/' +
        document.documentId +
        '/versions/' +
        version.documentVersionId +
        '/' +
        command,
      {
        expectedRevision: document.revision,
        expectedVersionRevision: version.revision,
        reason,
        ...(command === 'publish' ? { mode: mode ?? 'Review' } : {}),
      },
    );
  }
  /** Two-step download: a short-lived grant, then the bytes through the same-origin Gateway path. */
  async download(document: DocumentView, format: 'pdf' | 'docx' = 'pdf', versionId?: string) {
    const query =
      '?format=' + format + (versionId ? '&versionId=' + versionId + '&historical=true' : '');
    const grant = await this.api.get<{
      documentId: string;
      downloadUrl: string;
      expiresAt: string;
    }>('/api/v1/documents/' + document.documentId + '/download' + query);
    const url = new URL(grant.downloadUrl, window.location.origin);
    if (!url.pathname.startsWith('/api/')) throw new Error('Unexpected download location.');
    // The grant may name the Document service origin; the same path is served by the Gateway proxy.
    const path = url.pathname + url.search;
    const response = await this.api.file(path);
    const fallback = 'vairas-' + document.kind.toLowerCase() + '.' + format;
    return {
      blob: response.body!,
      filename: filenameFrom(response.headers.get('Content-Disposition'), fallback),
    };
  }
}
