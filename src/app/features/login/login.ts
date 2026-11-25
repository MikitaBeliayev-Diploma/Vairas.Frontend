import { ThemeToggle } from '../../shared/theme-toggle';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SessionStore } from '../../core/session';
import { Feedback } from '../../core/feedback';
import { Icon } from '../../shared/icon';
import { AuthenticationApi } from '../../core/authentication-api';

type Mode = 'signin' | 'register' | 'forgot' | 'verify' | 'reset';

/** Reads challenge links in both `#challengeToken=...&purpose=...` and `?challengeToken=...` forms. */
export function readChallenge(fragment: string | null, query: URLSearchParams) {
  const hash = new URLSearchParams((fragment ?? '').replace(/^#/, ''));
  const token = hash.get('challengeToken') ?? query.get('challengeToken') ?? '';
  const purpose = hash.get('purpose') ?? query.get('purpose') ?? 'VerifyEmail';
  return { token, purpose };
}

@Component({
  imports: [ThemeToggle, ReactiveFormsModule, ButtonModule, InputTextModule, Icon],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly api = inject(AuthenticationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(SessionStore);
  readonly feedback = inject(Feedback);
  private readonly fb = inject(FormBuilder);
  readonly notice = signal('');
  readonly error = signal('');
  readonly working = signal(false);
  private readonly challenge = readChallenge(
    this.route.snapshot.fragment,
    new URLSearchParams(window.location.search),
  );
  readonly mode = signal<Mode>(
    this.challenge.token
      ? this.challenge.purpose === 'ResetPassword'
        ? 'reset'
        : 'verify'
      : 'signin',
  );
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly resetForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    repeat: ['', Validators.required],
  });
  switch(mode: Mode) {
    this.mode.set(mode);
    this.error.set('');
    this.feedback.clear();
    const password = this.form.controls.password;
    password.setValidators(
      mode === 'register'
        ? [Validators.required, Validators.minLength(12), Validators.maxLength(128)]
        : mode === 'forgot'
          ? []
          : [Validators.required],
    );
    password.updateValueAndValidity();
  }
  async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set('');
    this.notice.set('');
    this.working.set(true);
    const { email, password } = this.form.getRawValue();
    try {
      if (this.mode() === 'register') {
        await this.api.register(email, password);
        this.notice.set(
          'Registration accepted. Open the verification link sent to ' + email + ', then sign in.',
        );
        this.switch('signin');
      } else if (this.mode() === 'forgot') {
        await this.api.challenge(email, 'ResetPassword');
        this.notice.set('If the account exists, a password reset link was sent to ' + email + '.');
        this.switch('signin');
      } else {
        await this.auth.login(email, password);
      }
    } catch {
      if (!this.feedback.error())
        this.error.set('The request failed. Check your details and service availability.');
    } finally {
      this.working.set(false);
      this.form.controls.password.reset();
    }
  }
  async verify() {
    this.working.set(true);
    this.error.set('');
    try {
      await this.api.verify(this.challenge.token);
      this.notice.set('E-mail verified. You can now sign in.');
      this.finishChallenge();
    } catch {
      if (!this.feedback.error())
        this.error.set('Verification could not be completed. Request a new link and try again.');
    } finally {
      this.working.set(false);
    }
  }
  async resetPassword() {
    this.resetForm.markAllAsTouched();
    const { password, repeat } = this.resetForm.getRawValue();
    if (this.resetForm.invalid) return;
    if (password !== repeat) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.working.set(true);
    this.error.set('');
    try {
      await this.api.verify(this.challenge.token, password);
      this.notice.set('Password changed. Sign in with your new password.');
      this.finishChallenge();
    } catch {
      if (!this.feedback.error()) this.error.set('The reset link is invalid or expired.');
    } finally {
      this.working.set(false);
      this.resetForm.reset();
    }
  }
  private finishChallenge() {
    this.switch('signin');
    // Drop the single-use token from the address bar and history.
    void this.router.navigate(['/login'], { replaceUrl: true });
  }
}
