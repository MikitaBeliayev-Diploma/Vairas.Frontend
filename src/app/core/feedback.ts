import { ErrorHandler, Injectable, inject, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class Feedback {
  readonly error = signal('');
  readonly success = signal('');
  fail(message: string) {
    this.error.set(message);
  }
  done(message: string) {
    this.success.set(message);
  }
  clear() {
    this.error.set('');
    this.success.set('');
  }
}
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly feedback = inject(Feedback);
  handleError(error: unknown) {
    console.error(
      'Unexpected application failure',
      error instanceof Error ? error.name : 'UnknownError',
    );
    this.feedback.fail('Something went wrong. Please reload the page.');
  }
}
