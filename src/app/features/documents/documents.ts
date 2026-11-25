import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SessionStore } from '../../core/session';
import { DocumentsApi, documentKindLabel } from '../../domain/api/documents-api';
import { Feedback } from '../../core/feedback';
import { DocumentVersion, DocumentView } from '../../domain/models/document-models';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
import { AsyncState } from '../../shared/async-state';
import { SchoolDatePipe } from '../../shared/school-date';
import { declarableVersion } from './reporting';
import { ReportingDeclarationPanel } from './reporting-declaration';

type Kind = 'journals' | 'completion-reports';
const finalJob = ['Completed', 'Failed'];

@Component({
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PageHeader,
    Status,
    AsyncState,
    SchoolDatePipe,
    ReportingDeclarationPanel,
  ],
  templateUrl: './documents.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(DocumentsApi);
  private readonly feedback = inject(Feedback);
  private readonly destroy = inject(DestroyRef);
  readonly kindLabel = documentKindLabel;
  readonly enrollmentId = signal('');
  readonly documents = signal<DocumentView[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly pendingJob = signal('');
  readonly snapshotIssues = signal<string[]>([]);
  readonly format = signal<'pdf' | 'docx'>('pdf');
  /** Generation keeps one idempotency key per enrollment and kind until it is accepted. */
  private readonly keys = new Map<string, string>();
  private generation = 0;
  ngOnInit() {
    this.enrollmentId.set(this.auth.enrollments()[0]?.enrollmentId ?? '');
    void this.load();
  }
  async load() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    this.documents.set([]);
    if (!this.enrollmentId()) {
      this.loading.set(false);
      return;
    }
    try {
      const documents = await this.api.list(this.enrollmentId());
      if (!this.destroy.destroyed && generation === this.generation) this.documents.set(documents);
    } catch {
      if (!this.destroy.destroyed && generation === this.generation) this.failed.set(true);
    } finally {
      if (!this.destroy.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
  change(id: string) {
    this.enrollmentId.set(id);
    this.snapshotIssues.set([]);
    void this.load();
  }
  async generate(kind: Kind) {
    if (this.busy()) return;
    this.busy.set(true);
    this.snapshotIssues.set([]);
    const scope = this.enrollmentId() + ':' + kind;
    try {
      const source = await this.api.snapshot(this.enrollmentId(), kind);
      this.snapshotIssues.set(source.issues ?? []);
      let key = this.keys.get(scope);
      if (!key) this.keys.set(scope, (key = crypto.randomUUID()));
      const job = await this.api.generate(
        this.enrollmentId(),
        source.sourceSnapshotVersion,
        kind,
        key,
      );
      this.keys.delete(scope);
      this.pendingJob.set(job.jobId);
      await this.poll();
    } catch {
      /* The interceptor reports details; a retry reuses the same key. */
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
  /** Polls the generation job with backoff for up to about a minute. */
  async poll() {
    if (!this.pendingJob()) return;
    this.busy.set(true);
    try {
      for (let attempt = 0; attempt < 25; attempt++) {
        if (this.destroy.destroyed) return;
        const job = await this.api.job(this.pendingJob());
        if (finalJob.includes(job.status)) {
          this.pendingJob.set('');
          if (job.status === 'Completed')
            // Document Management's `ready` means "published as ready"; a freshly prepared version is never
            // ready, so the evidence outcome is told only by the missing items.
            this.feedback.done(
              job.missingItems?.length
                ? 'Document generated with missing information: ' + job.missingItems.join('; ')
                : 'Document generated. Review it before publishing.',
            );
          else
            this.feedback.fail(
              'Document generation failed' + (job.errorCode ? ': ' + job.errorCode : '.'),
            );
          await this.load();
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(400 * 2 ** Math.min(attempt, 3), 3000)),
        );
      }
    } catch {
      /* Interceptor provides details; keep the job for a later check. */
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
  /** AC-080: Administrators may declare manual external reporting for a published-ready report. */
  canDeclare(document: DocumentView, version: DocumentVersion) {
    return this.auth.has('Administrator') && declarableVersion(document, version);
  }
  currentVersion(document: DocumentView): DocumentVersion | undefined {
    return (
      document.versions?.find((v) => v.documentVersionId === document.currentVersionId) ??
      document.versions?.[0]
    );
  }
  readonly commandTarget = signal<{
    document: DocumentView;
    version: DocumentVersion;
    command: 'review' | 'publish' | 'withdraw';
  } | null>(null);
  readonly reason = signal('');
  openCommand(
    document: DocumentView,
    version: DocumentVersion,
    command: 'review' | 'publish' | 'withdraw',
  ) {
    this.reason.set('');
    this.commandTarget.set({ document, version, command });
  }
  async command() {
    const target = this.commandTarget();
    const reason = this.reason().trim();
    if (!target || !reason) return;
    this.busy.set(true);
    try {
      await this.api.versionCommand(
        target.document,
        target.version,
        target.command,
        reason,
        target.version.evidenceStatus === 'Ready' ? 'Ready' : 'Review',
      );
      this.commandTarget.set(null);
      this.feedback.done('Document ' + target.command + ' recorded.');
      await this.load();
    } catch {
      /* Interceptor reports details. */
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }
  async download(document: DocumentView, versionId?: string) {
    if (!document.documentId || this.busy()) return;
    this.busy.set(true);
    try {
      const file = await this.api.download(document, this.format(), versionId);
      const objectUrl = URL.createObjectURL(file.blob);
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      if (!this.feedback.error())
        this.feedback.fail('Could not download this document. Try again in a moment.');
    } finally {
      this.busy.set(false);
    }
  }
}
