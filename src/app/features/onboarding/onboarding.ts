import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { UserApi } from '../../domain/api/user-api';
import { RoleProfileApi } from '../../domain/api/role-profile-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { PageHeader } from '../../shared/page-header';
import { Mutations } from '../../shared/resource';

/** First steps for an identity without a profile or school membership. */
@Component({
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="GET STARTED"
      heading="Set up your Vairas account"
      description="A school adds you to its workspace by invitation or enrollment."
    />
    @if (!auth.profile()) {
      <section class="panel form-panel narrow-panel">
        <h2>1 · Your profile</h2>
        <p class="muted">Your name is shown to your school's staff.</p>
        <form [formGroup]="form" (ngSubmit)="createProfile()">
          <div class="form-grid">
            <div class="field">
              <label for="first-name">First name</label
              ><input
                pInputText
                id="first-name"
                formControlName="firstName"
                autocomplete="given-name"
              />
            </div>
            <div class="field">
              <label for="last-name">Last name</label
              ><input
                pInputText
                id="last-name"
                formControlName="lastName"
                autocomplete="family-name"
              />
            </div>
          </div>
          <div class="field">
            <label for="phone">Phone (optional)</label
            ><input pInputText id="phone" formControlName="phoneNumber" autocomplete="tel" />
          </div>
          @if (form.touched && form.invalid) {
            <p class="field-error">Enter your first and last name.</p>
          }
          <p-button type="submit" label="Create profile" [loading]="m.busy()" />
        </form>
      </section>
    } @else {
      <section class="panel form-panel narrow-panel">
        <h2>Share your identifiers with your school</h2>
        <p class="muted">
          School staff invite people by user ID and enroll learners by student ID.
        </p>
        <dl class="details-grid">
          <div>
            <dt>User ID</dt>
            <dd>
              <code>{{ auth.profile()!.userId }}</code>
            </dd>
          </div>
          <div>
            <dt>Student ID</dt>
            <dd>
              @if (auth.profile()!.studentId) {
                <code>{{ auth.profile()!.studentId }}</code>
              } @else {
                <span class="muted">Not created</span>
              }
            </dd>
          </div>
        </dl>
        @if (!auth.profile()!.studentId) {
          <p>Are you learning to drive? Create a student profile so a school can enroll you.</p>
          <p-button
            label="Create student profile"
            severity="secondary"
            [loading]="m.busy()"
            (onClick)="createStudent()"
          />
        }
        <div class="form-footer">
          <a routerLink="/invitations" class="text-link">Review my invitations</a>
          <p-button label="Check my schools again" [text]="true" (onClick)="recheck()" />
        </div>
      </section>
    }
  `,
})
export class OnboardingPage {
  readonly auth = inject(SessionStore);
  private readonly users = inject(UserApi);
  private readonly roles = inject(RoleProfileApi);
  private readonly feedback = inject(Feedback);
  private readonly router = inject(Router);
  readonly m = new Mutations();
  readonly checking = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    phoneNumber: ['', Validators.maxLength(30)],
  });
  async createProfile() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    await this.m.run(async () => {
      await this.users.create(v.firstName.trim(), v.lastName.trim(), v.phoneNumber.trim() || null);
      await this.auth.loadIdentity();
    }, 'Profile created.');
    if (!this.auth.onboarding()) await this.router.navigateByUrl('/dashboard');
  }
  async createStudent() {
    await this.m.run(async () => {
      await this.roles.create('student');
      await this.auth.loadIdentity();
    }, 'Student profile created. Share your student ID with your school.');
  }
  async recheck() {
    await this.m.run(() => this.auth.loadIdentity());
    if (!this.auth.onboarding()) await this.router.navigateByUrl('/dashboard');
    else this.feedback.done('No school workspace yet.');
  }
}
