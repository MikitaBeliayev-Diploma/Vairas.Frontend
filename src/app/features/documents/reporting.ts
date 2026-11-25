import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LearningApi } from '../../domain/api/learning-api';
import { DocumentVersion, DocumentView } from '../../domain/models/document-models';
import { Problem } from '../../domain/models/http-models';
import { SessionStore } from '../../core/session';

/** Learning Tracking limit for the declaration statement. */
export const DECLARATION_STATEMENT_MAX = 2000;

/** Explanations for the Learning Tracking codes of a reporting declaration. */
export const declarationCodeMessages: Record<string, string> = {
  CURRENT_READY_COMPLETION_REPORT_REQUIRED:
    'The completion report evidence is no longer current and Ready (training data, sources or the checklist changed). Generate, review and publish a new completion report first.',
  ENROLLMENT_NOT_COMPLETABLE:
    'Manual reporting can only be declared for an active or completed enrollment.',
  ACCESS_DENIED: 'Only an Administrator of this school can record a reporting declaration.',
  IDEMPOTENCY_KEY_REUSED:
    'This declaration request was already sent with a different statement. Submit again to record it as a new request.',
  VALIDATION_FAILED: `Enter a statement of up to ${DECLARATION_STATEMENT_MAX} characters.`,
};

/** Validates the statement as Learning Tracking does: required and at most 2000 characters. */
export function declarationStatementError(statement: string): string | null {
  const value = statement.trim();
  if (!value) return 'Describe the manual reporting you performed outside Vairas.';
  if (value.length > DECLARATION_STATEMENT_MAX)
    return `Use no more than ${DECLARATION_STATEMENT_MAX} characters for the statement.`;
  return null;
}

/**
 * A completion report version whose declaration is offered: the internal report was reviewed and
 * published as Ready by an Administrator, so the evidence snapshot it was made from is Ready.
 */
export function declarableVersion(document: DocumentView, version: DocumentVersion | undefined) {
  return (
    !!version &&
    document.kind === 'CompletionReport' &&
    version.state === 'PublishedReady' &&
    version.reviewed &&
    version.evidenceStatus === 'Ready' &&
    !!version.snapshotId
  );
}

/** A declaration as recorded by Learning Tracking plus the actor known to this browser. */
export interface KnownDeclaration {
  declarationId: string;
  snapshotId: string;
  enrollmentId: string;
  declaredAt: string;
  statement: string;
  actorUserId: string;
  actorName: string;
}

/** Records reporting declarations with one Idempotency-Key per exact request. */
@Injectable({ providedIn: 'root' })
export class ReportingDeclarations {
  private readonly learning = inject(LearningApi);
  private readonly session = inject(SessionStore);

  private key = '';
  private payload = '';
  /** An identical retry reuses the key (no duplicate); a changed statement or snapshot gets a new one. */
  keyFor(enrollmentId: string, snapshotId: string, statement: string) {
    const payload = JSON.stringify([enrollmentId, snapshotId, statement]);
    if (payload !== this.payload) {
      this.payload = payload;
      this.key = crypto.randomUUID();
    }
    return this.key;
  }
  /** Sends the declaration only after explicit acknowledgement that Vairas transmits nothing. */
  async declare(
    enrollmentId: string,
    snapshotId: string,
    statementInput: string,
    acknowledged: boolean,
  ): Promise<KnownDeclaration> {
    if (!acknowledged)
      throw new Error(
        'Confirm that Vairas sends nothing and that this is only your own declaration.',
      );
    const invalid = declarationStatementError(statementInput);
    if (invalid) throw new Error(invalid);
    const statement = statementInput.trim();
    const key = this.keyFor(enrollmentId, snapshotId, statement);
    try {
      const result = await this.learning.declareReporting(
        enrollmentId,
        { snapshotId, statement },
        key,
      );
      const profile = this.session.profile();
      const known: KnownDeclaration = {
        declarationId: result.declarationId,
        snapshotId: result.snapshotId,
        enrollmentId,
        declaredAt: result.declaredAt,
        statement,
        // The service records the authenticated caller as the actor.
        actorUserId: profile?.userId ?? this.session.session()?.userId ?? '',
        actorName:
          this.session.session()?.name ||
          (profile ? profile.firstName + ' ' + profile.lastName : 'You'),
      };

      this.payload = '';
      return known;
    } catch (error) {
      if (problemCode(error) === 'IDEMPOTENCY_KEY_REUSED') this.payload = '';
      throw new Error(explainDeclarationError(error));
    }
  }
}

function problemCode(error: unknown) {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as Partial<Problem>).code
    : undefined;
}

/** Safe, code-specific explanation of a rejected declaration. */
export function explainDeclarationError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse))
    return error instanceof Error ? error.message : 'The declaration was not recorded.';
  const problem = (
    error.error && typeof error.error === 'object' ? error.error : {}
  ) as Partial<Problem>;
  const reference = problem.correlationId ? ' Reference: ' + problem.correlationId + '.' : '';
  const known = problem.code ? declarationCodeMessages[problem.code] : undefined;
  if (known) return known + reference;
  if (error.status === 0 || error.status >= 500)
    return (
      'The outcome is unknown. Submitting the same statement again reuses the same Idempotency-Key, so nothing is duplicated.' +
      reference
    );
  if (error.status === 403) return declarationCodeMessages['ACCESS_DENIED'] + reference;
  if (error.status === 404)
    return 'The enrollment or evidence snapshot is not available to you.' + reference;
  return (
    'The declaration was not recorded.' +
    (problem.code ? ' Code: ' + problem.code + '.' : '') +
    reference
  );
}
