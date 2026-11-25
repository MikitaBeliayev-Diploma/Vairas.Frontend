import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ThemeStore } from '../core/theme';

@Component({
  selector: 'app-theme-toggle',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p-button
    type="button"
    [label]="theme.theme() === 'dark' ? 'Light theme' : 'Dark theme'"
    severity="secondary"
    [text]="true"
    (onClick)="theme.toggle()"
  />`,
})
export class ThemeToggle {
  readonly theme = inject(ThemeStore);
}
