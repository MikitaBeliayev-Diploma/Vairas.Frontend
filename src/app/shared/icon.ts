import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
const paths: Record<string, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  calendar: 'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',
  plan: 'M9 5H4v16h16V5h-5 M9 3h6v4H9z M8 12h8 M8 16h5',
  chart: 'M4 3v18h17 M8 17v-5 M13 17V7 M18 17v-9',
  document: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  logout: 'M9 4H4v16h5 M12 12h10 M18 8l4 4-4 4',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  check: 'm5 12 4 4L19 6',
  car: 'M5 7 7 3h10l2 4 M3 9h18v9H3z M6 18v3 M18 18v3 M6 13h1 M17 13h1',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  profile: 'M20 21a8 8 0 0 0-16 0 M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  plus: 'M12 5v14 M5 12h14',
  school: 'm3 9 9-6 9 6-9 6z M7 12v6c4 3 6 3 10 0v-6 M21 9v10',
};
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()"/></svg>',
  host: { class: 'app-icon' },
})
export class Icon {
  readonly name = input('dashboard');
  readonly path = computed(() => paths[this.name()] ?? paths['dashboard']);
}
