import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly selected = signal<Theme>(this.initial());
  readonly theme = this.selected.asReadonly();
  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.classList.toggle('vairas-dark', theme === 'dark');
      this.document.documentElement.style.colorScheme = theme;
      try {
        localStorage.setItem('vairas.theme', theme);
      } catch {
        /* Preference persistence is optional. */
      }
    });
  }
  toggle() {
    this.selected.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }
  private initial(): Theme {
    try {
      const stored = localStorage.getItem('vairas.theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* Use the system preference when storage is unavailable. */
    }
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}
