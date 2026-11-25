import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SessionStore } from '../../core/session';
import { WorkspaceStore } from '../../core/workspace';
import { LearningApi } from '../../domain/api/learning-api';
import { Progress } from '../../domain/models/learning-models';
import { PageHeader } from '../../shared/page-header';
import { Icon } from '../../shared/icon';
import { Status } from '../../shared/status';
import { AsyncState } from '../../shared/async-state';
import { SchoolDatePipe } from '../../shared/school-date';
@Component({
  imports: [RouterLink, ButtonModule, PageHeader, Icon, Status, AsyncState, SchoolDatePipe],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit {
  readonly auth = inject(SessionStore);
  readonly workspace = inject(WorkspaceStore);
  private readonly learning = inject(LearningApi);
  readonly progress = signal<Progress | null>(null);
  readonly upcoming = computed(() =>
    this.workspace
      .lessons()
      .filter((l) => l.status === 'Scheduled')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );
  readonly completed = computed(
    () => this.workspace.lessons().filter((l) => l.status === 'Completed').length,
  );
  readonly firstName = computed(() => this.auth.session()?.name.split(' ')[0] ?? '');
  ngOnInit() {
    void this.workspace.load();
    const selected = this.auth.session()?.enrollmentId;
    const enrollment =
      this.auth.enrollments().find((e) => e.enrollmentId === selected) ??
      this.auth.enrollments()[0];
    if (enrollment) {
      const epoch = this.auth.epoch();
      void this.learning
        .progress(enrollment.enrollmentId)
        .then((p) => {
          if (epoch === this.auth.epoch()) this.progress.set(p);
        })
        .catch(() => undefined);
    }
  }
}
