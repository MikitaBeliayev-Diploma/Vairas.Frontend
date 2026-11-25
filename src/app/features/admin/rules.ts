import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  effect,
  untracked,
  DestroyRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LessonAdminApi } from '../../domain/api/lesson-admin-api';
import { SessionStore } from '../../core/session';
import { SchoolRuleVersion } from '../../domain/models/scheduling-models';
import { PageHeader } from '../../shared/page-header';
import { Status } from '../../shared/status';
import { Mutations } from '../../shared/resource';
import { schoolTimeToUtc } from '../../shared/school-date';

export const RULE_TYPES = [
  {
    code: 'MAX_PRACTICAL_LESSONS_PER_WEEK',
    label: 'Max practical lessons per week',
    unit: 'Lessons',
  },
  { code: 'MAX_THEORY_LESSONS_PER_WEEK', label: 'Max theory lessons per week', unit: 'Lessons' },
  {
    code: 'MAX_LESSONS_PER_STUDENT_PER_DAY',
    label: 'Max lessons per learner per day',
    unit: 'Lessons',
  },
  { code: 'MIN_DAYS_BETWEEN_PRACTICAL', label: 'Min days between practical lessons', unit: 'Days' },
];

/** US-025: the school rule owner publishes audited scheduling restrictions. */
@Component({
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PageHeader, Status],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="ADMINISTRATION"
      heading="School scheduling rules"
      description="School restrictions apply on top of legal rules. Each change creates a new audited version."
    />
    <div class="training-grid">
      <section class="panel form-panel">
        <h2>Publish a rule version</h2>
        <form [formGroup]="form" (ngSubmit)="publish()">
          <div class="field">
            <label for="rule-type">Rule</label
            ><select id="rule-type" class="native-select" formControlName="ruleType">
              @for (t of types; track t.code) {
                <option [value]="t.code">{{ t.label }}</option>
              }
            </select>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="rule-value">Limit ({{ unit() }})</label
              ><input pInputText id="rule-value" type="number" min="1" formControlName="value" />
            </div>
            <div class="field">
              <label for="rule-severity">Severity</label
              ><select id="rule-severity" class="native-select" formControlName="severity">
                <option value="Hard">Hard — blocks scheduling</option>
                <option value="Preference">Preference — ranks proposals</option>
              </select>
            </div>
            <div class="field">
              <label for="rule-from">Effective from (Vilnius)</label
              ><input
                pInputText
                id="rule-from"
                type="datetime-local"
                formControlName="effectiveFrom"
              />
            </div>
            <div class="field">
              <label for="rule-ruleid">Replaces rule ID (optional)</label
              ><input pInputText id="rule-ruleid" formControlName="ruleId" placeholder="New rule" />
            </div>
          </div>
          @if (form.controls.ruleId.value) {
            <div class="field">
              <label for="rule-revision">Current rule revision</label
              ><input
                pInputText
                id="rule-revision"
                type="number"
                min="1"
                formControlName="expectedRevision"
              />
            </div>
          }
          <div class="field">
            <label for="rule-source">Source reference</label
            ><input
              pInputText
              id="rule-source"
              formControlName="sourceReference"
              placeholder="Board decision 2026-11"
            />
          </div>
          <div class="field">
            <label for="rule-reason">Reason</label
            ><textarea pInputText id="rule-reason" rows="2" formControlName="reason"></textarea>
          </div>
          @if (form.touched && form.invalid) {
            <p class="field-error">Complete the rule, limit, start, source and reason.</p>
          }
          <p-button type="submit" label="Publish rule version" [loading]="m.busy()" />
        </form>
      </section>
      <section class="panel form-panel">
        <h2>School rule history</h2>
        @if (historyFailed()) {
          <p role="alert">Rule history could not be loaded.</p>
          <p-button label="Retry history" (onClick)="loadHistory()" />
        }
        <p class="muted">Use the rule ID to publish a replacement version.</p>
        <ul class="requirement-list">
          @for (r of published(); track r.ruleVersionId) {
            <li>
              <app-status [value]="r.status" /> Rule {{ r.ruleId }} · revision {{ r.revision }}
            </li>
          } @empty {
            <li>No rule versions returned by Scheduling.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class RulesPage {
  readonly auth = inject(SessionStore);
  private readonly api = inject(LessonAdminApi);
  readonly m = new Mutations();
  readonly types = RULE_TYPES;
  readonly published = signal<SchoolRuleVersion[]>([]);
  readonly historyFailed = signal(false);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  readonly form = inject(FormBuilder).nonNullable.group({
    ruleType: [RULE_TYPES[0].code, Validators.required],
    value: [3, [Validators.required, Validators.min(1), Validators.max(10000)]],
    severity: ['Hard', Validators.required],
    effectiveFrom: ['', Validators.required],
    ruleId: [''],
    expectedRevision: [1],
    sourceReference: ['', [Validators.required, Validators.maxLength(500)]],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });
  readonly unit = computed(
    () => RULE_TYPES.find((t) => t.code === this.ruleType())?.unit ?? 'Lessons',
  );
  private readonly ruleType = signal(RULE_TYPES[0].code);
  constructor() {
    this.form.controls.ruleType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.ruleType.set(v));
    effect(() => {
      const schoolId = this.auth.session()?.schoolId;
      untracked(() => {
        void this.loadHistory(schoolId);
      });
    });
  }
  async loadHistory(schoolId = this.auth.session()?.schoolId) {
    const generation = ++this.generation;
    this.published.set([]);
    this.historyFailed.set(false);
    if (!schoolId) return;
    try {
      const rows = await this.api.ruleHistory(schoolId);
      if (
        generation !== this.generation ||
        this.destroy.destroyed ||
        schoolId !== this.auth.session()?.schoolId
      )
        return;
      this.published.set(
        rows.map((row) => ({
          ...row,
          status: row.effectiveNow
            ? 'Effective'
            : row.superseded
              ? 'Superseded'
              : row.verificationStatus,
        })),
      );
    } catch {
      if (generation === this.generation) this.historyFailed.set(true);
    }
  }
  async publish() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const schoolId = this.auth.session()?.schoolId ?? '';
    const result = await this.m.run(
      async () =>
        this.api.createRule(
          {
            schoolId,
            ruleType: v.ruleType,
            value: Number(v.value),
            unit: this.unit(),
            severity: v.severity,
            scopeKind: 'School',
            scopeResourceId: null,
            effectiveFrom: schoolTimeToUtc(v.effectiveFrom),
            effectiveTo: null,
            ruleId: v.ruleId.trim() || null,
            expectedRevision: v.ruleId.trim() ? Number(v.expectedRevision) : 0,
            sourceReference: v.sourceReference.trim(),
            reason: v.reason.trim(),
          },
          this.m.key('rule'),
        ),
      'Rule version published.',
      'rule',
    );
    if (result) {
      this.published.update((list) => [result, ...list.filter((x) => x.ruleId !== result.ruleId)]);
      await this.loadHistory(schoolId);
      this.form.patchValue({ ruleId: '', expectedRevision: 1, reason: '' });
    }
  }
}
