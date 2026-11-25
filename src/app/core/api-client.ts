import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from './config';
import { ApiContext } from './api-context';
export const QUIET = new HttpContextToken<boolean>(() => false);
@Injectable({ providedIn: 'root' })
export class ApiClient {
  readonly context = inject(ApiContext);
  readonly config = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);
  url(url: string) {
    return this.config.apiBaseUrl + this.context.scoped(url);
  }
  file(url: string) {
    return firstValueFrom(
      this.http.get(this.url(url), { responseType: 'blob', observe: 'response' }),
    );
  }
  get<T>(url: string) {
    return firstValueFrom(this.http.get<T>(this.url(url)));
  }
  /** GET without the global error banner, for optional reads with a fallback. */
  quiet<T>(url: string) {
    return firstValueFrom(
      this.http.get<T>(this.url(url), { context: new HttpContext().set(QUIET, true) }),
    );
  }
  send<T>(
    method: 'POST' | 'PUT' | 'PATCH',
    url: string,
    body: unknown,
    key: string = crypto.randomUUID(),
    quiet = false,
  ) {
    return firstValueFrom(
      this.http.request<T>(method, this.url(url), {
        body,
        headers: new HttpHeaders({ 'Idempotency-Key': key }),
        context: new HttpContext().set(QUIET, quiet),
      }),
    );
  }
  upload<T>(url: string, file: File, key: string = crypto.randomUUID()) {
    const body = new FormData();
    body.append('file', file, file.name);
    return firstValueFrom(
      this.http.post<T>(this.url(url), body, {
        headers: new HttpHeaders({ 'Idempotency-Key': key }),
      }),
    );
  }
}
