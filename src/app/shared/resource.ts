import { DestroyRef, inject, signal } from '@angular/core';
import { Feedback } from '../core/feedback';

/** A cancellable read model: ignores late responses after a reload or component destruction. */
export class Resource<T> {
  readonly value;
  readonly loading = signal(false);
  readonly failed = signal(false);
  private generation = 0;
  private readonly destroy = inject(DestroyRef);
  constructor(
    private readonly initial: T,
    private readonly fetch: () => Promise<T>,
  ) {
    this.value = signal<T>(initial);
  }
  reset() {
    this.generation++;
    this.value.set(this.initial);
    this.loading.set(false);
    this.failed.set(false);
  }
  async load() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const value = await this.fetch();
      if (!this.destroy.destroyed && generation === this.generation) this.value.set(value);
    } catch {
      if (!this.destroy.destroyed && generation === this.generation) this.failed.set(true);
    } finally {
      if (!this.destroy.destroyed && generation === this.generation) this.loading.set(false);
    }
  }
}

/**
 * Runs writes one at a time. The idempotency key of a form submission is kept until it succeeds,
 * so a retry after a timeout or network failure replays instead of duplicating.
 */
export class Mutations {
  readonly busy = signal(false);
  private readonly feedback = inject(Feedback);
  private readonly keys = new Map<string, string>();
  key(scope: string) {
    let key = this.keys.get(scope);
    if (!key) {
      key = crypto.randomUUID();
      this.keys.set(scope, key);
    }
    return key;
  }
  forget(scope: string) {
    this.keys.delete(scope);
  }
  async run<T>(action: () => Promise<T>, success?: string, scope?: string): Promise<T | undefined> {
    if (this.busy()) return undefined;
    this.busy.set(true);
    try {
      const result = await action();
      if (scope) this.forget(scope);
      if (success) this.feedback.done(success);
      return result;
    } catch (error) {
      // HTTP failures are reported by the interceptor; surface local validation errors here.
      if (error instanceof Error && !('status' in error)) this.feedback.fail(error.message);
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }
}

export const LICENSE_CATEGORIES = [
  'AM',
  'A1',
  'A2',
  'A',
  'B',
  'BE',
  'C1',
  'C',
  'CE',
  'D1',
  'D',
  'DE',
];
export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
