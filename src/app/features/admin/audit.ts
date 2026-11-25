import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ChatApi } from '../../domain/api/chat-api';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { SchoolAdminApi } from '../../domain/api/school-admin-api';
import { SessionStore } from '../../core/session';
import { AssistantAuditEntry } from '../../domain/models/chat-models';
import { ReviewItem } from '../../domain/models/school-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
import { Status } from '../../shared/status';
import { SchoolDatePipe } from '../../shared/school-date';
import { Mutations, Resource, shortId } from '../../shared/resource';

/** US-020 assistant audit, plus lesson and membership reviews raised by background processes. */
@Component({
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    PageHeader,
    AsyncState,
    Status,
    SchoolDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="ADMINISTRATION"
      heading="Reviews & audit"
      description="Items that need a human decision, and every assistant write attempt."
    />
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Open reviews</h2>
          <p class="muted">Raised when memberships end or lessons lose a required participant.</p>
        </div>
        <p-button label="Refresh" [text]="true" (onClick)="reviews.load()" />
      </div>
      <app-async-state
        [loading]="reviews.loading()"
        [error]="reviews.failed()"
        [empty]="!reviews.loading() && !reviews.failed() && !reviews.value().length"
        title="Nothing to review"
        description="New review items appear here."
        (retry)="reviews.load()"
      />
      <div class="record-list">
        @for (r of reviews.value(); track r.reviewId) {
          <div class="record-row">
            <div>
              <strong>{{ r.reasonCode }}</strong
              ><small
                >{{ r.targetKind }} {{ shortId(r.targetId) }} · {{ r.subjectRole }} user
                {{ shortId(r.subjectUserId) }} · raised {{ r.raisedAt | schoolDate }}</small
              >
            </div>
            <label class="sr-only" [for]="'note-' + r.reviewId">Resolution note</label>
            <input
              pInputText
              [id]="'note-' + r.reviewId"
              placeholder="Resolution note"
              [ngModel]="notes()[r.reviewId] ?? ''"
              (ngModelChange)="setNote(r.reviewId, $event)"
            />
            <p-button
              label="Resolve"
              size="small"
              [disabled]="!(notes()[r.reviewId] ?? '').trim() || m.busy()"
              (onClick)="resolve(r)"
            />
          </div>
        }
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Assistant audit</h2>
          <p class="muted">Outcomes of AI-assisted lesson actions after human confirmation.</p>
        </div>
        <p-button label="Refresh" [text]="true" (onClick)="audit.load()" />
      </div>
      <app-async-state
        [loading]="audit.loading()"
        [error]="audit.failed()"
        (retry)="audit.load()"
      />
      @if (!audit.loading() && !audit.failed()) {
        <p-table [value]="sortedAudit()" [paginator]="sortedAudit().length > 15" [rows]="15">
          <ng-template #header>
            <tr>
              <th>Recorded</th>
              <th>Tool</th>
              <th>Outcome</th>
              <th>Operation</th>
            </tr>
          </ng-template>
          <ng-template #body let-a>
            <tr>
              <td>{{ a.recordedAt | schoolDate }}</td>
              <td>{{ a.tool }}</td>
              <td><app-status [value]="a.outcome" /></td>
              <td>
                <code>{{ a.operationId }}</code>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="4">No assistant actions recorded.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
})
export class AuditPage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly chat = inject(ChatApi);
  private readonly lessons = inject(LessonAdminApi);
  private readonly school = inject(SchoolAdminApi);
  readonly m = new Mutations();
  readonly shortId = shortId;
  private readonly schoolId = computed(() => this.auth.session()?.schoolId ?? '');
  readonly audit = new Resource<AssistantAuditEntry[]>([], () => this.chat.audit(this.schoolId()));
  readonly reviews = new Resource<(ReviewItem & { source: 'lesson' | 'membership' })[]>(
    [],
    async () => {
      const [lessons, members] = await Promise.all([
        this.lessons.lessonReviews(this.schoolId()),
        this.school.membershipReviews(this.schoolId()),
      ]);
      return [
        ...lessons.map((r) => ({ ...r, source: 'lesson' as const })),
        ...members.map((r) => ({ ...r, source: 'membership' as const })),
      ].filter((r) => !r.resolvedAt);
    },
  );
  readonly sortedAudit = computed(() =>
    [...this.audit.value()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  );
  readonly notes = signal<Partial<Record<string, string>>>({});
  ngOnInit() {
    void this.audit.load();
    void this.reviews.load();
  }
  setNote(id: string, value: string) {
    this.notes.update((n) => ({ ...n, [id]: value }));
  }
  async resolve(r: ReviewItem & { source: 'lesson' | 'membership' }) {
    const note = (this.notes()[r.reviewId] ?? '').trim();
    if (
      await this.m.run(
        () =>
          r.source === 'lesson'
            ? this.lessons.resolveLessonReview(this.schoolId(), r.reviewId, note)
            : this.school.resolveMembershipReview(this.schoolId(), r.reviewId, note),
        'Review resolved.',
      )
    )
      await this.reviews.load();
  }
}
