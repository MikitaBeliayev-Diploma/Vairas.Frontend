import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<div class="page-header"><div><p class="eyebrow">{{eyebrow()}}</p><h1>{{heading()}}</h1><p class="page-description">{{description()}}</p></div><div class="page-actions"><ng-content/></div></div>',
})
export class PageHeader {
  readonly eyebrow = input('YOUR WORKSPACE');
  readonly heading = input.required<string>();
  readonly description = input('');
}
