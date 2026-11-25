import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { UserApi } from '../../domain/api/user-api';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Profile } from '../../domain/models/session-models';
import { PageHeader } from '../../shared/page-header';
import { AsyncState } from '../../shared/async-state';
@Component({
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PageHeader, AsyncState],
  templateUrl: './profile.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage implements OnInit {
  readonly auth = inject(SessionStore);
  private readonly api = inject(UserApi);
  private readonly feedback = inject(Feedback);
  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  private key = '';
  readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    emailAddress: ['', Validators.email],
    phoneNumber: ['', Validators.maxLength(30)],
  });
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const p = await this.api.profile();
      this.profile.set(p);
      this.form.reset({
        firstName: p.firstName,
        lastName: p.lastName,
        emailAddress: p.emailAddress ?? '',
        phoneNumber: p.phoneNumber ?? '',
      });
      this.stale.set(false);
      this.key = crypto.randomUUID();
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
  async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.profile() || this.stale()) return;
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      await this.api.update(
        {
          ...this.profile()!,
          ...v,
          emailAddress: v.emailAddress || null,
          phoneNumber: v.phoneNumber || null,
        },
        this.key,
      );
      await this.load();
      this.feedback.done('Your profile was updated.');
    } catch {
      this.stale.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
