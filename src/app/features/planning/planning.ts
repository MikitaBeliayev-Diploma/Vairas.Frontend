import { RequestListItem } from '../../domain/models/scheduling-models';
import { WorkspaceStore } from '../../core/workspace';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { ButtonModule } from 'primeng/button';
import { SchedulingApi } from '../../domain/api/scheduling-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import {
  DraftInputSet,
  ScheduleProposal,
  SchedulingOperation,
  SchedulingRequest,
} from '../../domain/models/scheduling-models';
import { PlanningInputs } from '../../domain/models/school-models';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { PlanningForm } from './planning-form';
import { RouterLink } from '@angular/router';
import { isUuid } from '../../shared/resource';
import { HttpErrorResponse } from '@angular/common/http';
@Component({
  imports: [ButtonModule, PageHeader, Status, SchoolDatePipe, PlanningForm, RouterLink],
  templateUrl: './planning.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(SchedulingApi);
  private readonly feedback = inject(Feedback);
  readonly request = signal<SchedulingRequest | null>(null);
  readonly restoredInputs = signal<DraftInputSet | null>(null);
  readonly proposal = signal<ScheduleProposal | null>(null);
  readonly operation = signal<SchedulingOperation | null>(null);
  readonly busy = signal(false);
  readonly stale = signal(false);
  private operationKey = '';
  private generation = 0;
  private listGeneration = 0;
  private readonly destroy = inject(DestroyRef);
  readonly formResetVersion = signal(0);
  readonly restoring = signal(false);
  readonly restoreError = signal('');
  readonly requests = signal<RequestListItem[]>([]);
  readonly listFailed = signal(false);
  readonly listLoading = signal(false);
  readonly nextOffset = signal<number | null>(null);
  private readonly workspace = inject(WorkspaceStore);
  private readonly school = inject(SchoolAdminApi);
  readonly planningInputs = signal<PlanningInputs | null>(null);
  readonly generating = signal(false);
  ngOnInit() {
    void this.loadRequests();
    if (!this.auth.session()?.schoolId) return;
    const schoolId = this.auth.session()!.schoolId;
    void this.school
      .planningInputs(schoolId)
      .then((p) => {
        if (!this.destroy.destroyed && this.auth.session()?.schoolId === schoolId)
          this.planningInputs.set(p);
      })
      .catch(() => {
        /* HTTP interceptor reports the failure. */
      });
  }
  private contextKey() {
    const s = this.auth.session();
    return JSON.stringify([s?.sessionId, s?.userId, s?.schoolId]);
  }
  async loadRequests(offset = 0) {
    const generation = ++this.listGeneration;
    const context = this.contextKey();
    this.listLoading.set(true);
    this.listFailed.set(false);
    try {
      const page = await this.api.requests(offset);
      if (
        this.destroy.destroyed ||
        generation !== this.listGeneration ||
        context !== this.contextKey()
      )
        return;
      this.requests.set(page.items);
      this.nextOffset.set(page.nextOffset);
    } catch {
      if (
        !this.destroy.destroyed &&
        generation === this.listGeneration &&
        context === this.contextKey()
      )
        this.listFailed.set(true);
    } finally {
      if (
        !this.destroy.destroyed &&
        generation === this.listGeneration &&
        context === this.contextKey()
      )
        this.listLoading.set(false);
    }
  }
  async openRequest(id: string, proposalRevision?: number) {
    if (!isUuid(id) || (this.busy() && !this.restoring())) return;
    if (this.hasUnresolvedOperation()) {
      this.feedback.fail('Reconcile the pending operation before opening another request.');
      return;
    }
    this.clearState();
    const generation = this.generation;
    const context = this.contextKey();
    this.busy.set(true);
    this.restoring.set(true);
    try {
      const [request, inputs, proposal] = await Promise.all([
        this.api.request(id),
        this.api.requestInputs(id),
        proposalRevision ? this.api.savedProposal(id, proposalRevision) : Promise.resolve(null),
      ]);
      if (this.destroy.destroyed || generation !== this.generation || context !== this.contextKey())
        return;
      if (
        request.schoolId !== this.auth.session()?.schoolId ||
        inputs.schoolId !== request.schoolId
      )
        throw new Error('The school context changed.');
      if (
        proposal &&
        (proposal.requestId !== request.requestId || proposal.revision !== request.revision)
      )
        throw new Error('The proposal revision changed. Reload the request.');
      this.request.set(request);
      this.restoredInputs.set(inputs);
      this.proposal.set(proposal);
      this.operationKey = proposal ? crypto.randomUUID() : '';
    } catch {
      if (generation === this.generation)
        this.restoreError.set('Could not open this request. Retry from the request list.');
    } finally {
      if (generation === this.generation) {
        this.busy.set(false);
        this.restoring.set(false);
      }
    }
  }
  copyToNewDraft() {
    if (this.busy() || this.hasUnresolvedOperation()) return;
    this.request.set(null);
    this.proposal.set(null);
    this.operation.set(null);
    this.stale.set(false);
    this.operationKey = '';
  }
  async createVersion() {
    const request = this.request(),
      inputs = this.restoredInputs();
    if (
      !request ||
      !inputs ||
      request.status === 'Confirmed' ||
      this.busy() ||
      this.hasUnresolvedOperation()
    )
      return;
    const context = this.contextKey();
    const generation = this.generation;
    await this.perform(async () => {
      const revised = await this.api.updateDraft(request, inputs);
      if (this.destroy.destroyed || generation !== this.generation || context !== this.contextKey())
        return;
      this.request.set(revised);
      this.proposal.set(null);
      this.operation.set(null);
      this.stale.set(false);
      await this.loadRequests();
    });
  }
  async save(inputs: DraftInputSet) {
    await this.perform(async () => {
      const r = this.request();
      const saved = r ? await this.api.updateDraft(r, inputs) : await this.api.createDraft(inputs);
      this.request.set(saved);
      this.restoredInputs.set(inputs);
      this.feedback.done('Draft saved. Review the inputs before submission.');
      await this.loadRequests();
    });
  }
  async submit() {
    if (
      !this.request() ||
      this.request()?.status !== 'Draft' ||
      this.request()?.missingItems.length
    )
      return;
    await this.perform(async () => {
      this.request.set(await this.api.submit(this.request()!));
      await this.loadRequests();
    });
  }
  async generate() {
    if (
      this.busy() ||
      !this.request() ||
      !['Submitted', 'Ready', 'Infeasible'].includes(this.request()!.status)
    )
      return;
    this.generating.set(true);
    try {
      await this.perform(async () => {
        this.proposal.set(await this.api.proposal(this.request()!));
        this.operationKey = crypto.randomUUID();
        await this.loadRequests();
      });
    } finally {
      this.generating.set(false);
    }
  }
  async confirm() {
    if (
      this.busy() ||
      this.stale() ||
      this.operation() ||
      this.proposal()?.status !== 'Ready' ||
      this.request()?.status === 'Confirmed'
    )
      return;
    await this.perform(async () => {
      try {
        this.operation.set(await this.api.confirm(this.proposal()!, this.operationKey));
        if (this.operation()?.status === 'Committed') {
          await this.workspace.load();
          await this.loadRequests();
          this.feedback.done('Schedule confirmed. Lessons are now reserved.');
        }
      } catch (error) {
        if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
          this.operation.set({
            operationId: this.operationKey,
            status: 'ReconciliationPending',
            lessonIds: [],
          });
        else this.stale.set(true);
        throw error;
      }
    });
  }
  async reconcile() {
    await this.perform(async () => {
      const result = await this.api.operation(this.operation()!.operationId);
      this.operation.set(result);
      if (result.status === 'Committed') {
        await this.workspace.load();
        await this.loadRequests();
        this.feedback.done('Schedule confirmed. Lessons are now reserved.');
      }
    });
  }
  learnerName(id: string) {
    return (
      this.auth.catalog()?.enrollments.find((e) => e.enrollmentId === id)?.name ??
      'Selected learner'
    );
  }
  teacherName(id: string) {
    return this.auth.catalog()?.teachers.find((e) => e.id === id)?.name ?? 'Selected instructor';
  }
  vehicleName(id: string) {
    return this.auth.catalog()?.vehicles.find((e) => e.id === id)?.label ?? 'Selected vehicle';
  }
  hasUnresolvedOperation() {
    return ['Pending', 'ReconciliationPending', 'Unknown'].includes(this.operation()?.status ?? '');
  }
  reset() {
    if (this.hasUnresolvedOperation()) {
      this.feedback.fail('Reconcile the pending operation before starting another request.');
      return;
    }
    if (this.busy() && !this.restoring()) return;
    this.clearState();
  }
  private clearState() {
    this.generation++;
    this.request.set(null);
    this.restoredInputs.set(null);
    this.proposal.set(null);
    this.operation.set(null);
    this.stale.set(false);
    this.operationKey = '';
    this.restoreError.set('');
    this.generating.set(false);
    this.busy.set(false);
    this.restoring.set(false);
    this.formResetVersion.update((v) => v + 1);
  }
  private async perform(task: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await task();
    } catch {
      /* HTTP interceptor displays safe errors. */
    } finally {
      this.busy.set(false);
    }
  }
}
