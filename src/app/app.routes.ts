import { Routes } from '@angular/router';
import { authenticated, permission, roles, workspaceReady } from './core/guards';
const login = () => import('./features/login/login').then((m) => m.LoginPage);
export const routes: Routes = [
  { path: 'challenge', loadComponent: login },
  { path: 'login', loadComponent: login },
  {
    path: '',
    canActivate: [authenticated],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./features/onboarding/onboarding').then((m) => m.OnboardingPage),
      },
      {
        path: 'invitations',
        loadComponent: () =>
          import('./features/onboarding/invitations').then((m) => m.InvitationsPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: '',
        canActivateChild: [workspaceReady],
        children: [
          {
            path: 'dashboard',
            loadComponent: () =>
              import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
          },
          {
            path: 'schedule',
            loadComponent: () => import('./features/schedule/schedule').then((m) => m.SchedulePage),
          },
          {
            path: 'planning',
            canActivate: [roles('Administrator')],
            loadComponent: () => import('./features/planning/planning').then((m) => m.PlanningPage),
          },
          {
            path: 'learners',
            canActivate: [roles('Administrator', 'Instructor')],
            loadComponent: () => import('./features/learners/learners').then((m) => m.LearnersPage),
          },
          {
            path: 'training',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/training/my-training').then((m) => m.MyTrainingPage),
          },
          {
            path: 'training/:enrollmentId',
            loadComponent: () => import('./features/training/training').then((m) => m.TrainingPage),
          },
          {
            path: 'theory-lessons/:lessonId/attendance',
            canActivate: [roles('Instructor')],
            loadComponent: () =>
              import('./features/records/theory-attendance').then((m) => m.TheoryAttendancePage),
          },
          {
            path: 'records/theory/:recordId',
            canActivate: [roles('Administrator', 'Instructor')],
            loadComponent: () =>
              import('./features/records/theory-record').then((m) => m.TheoryRecordPage),
          },
          {
            path: 'records/:recordId',
            loadComponent: () => import('./features/records/record').then((m) => m.RecordPage),
          },
          {
            path: 'documents',
            canActivate: [roles('Administrator')],
            loadComponent: () =>
              import('./features/documents/documents').then((m) => m.DocumentsPage),
          },
          {
            path: 'assistant',
            loadComponent: () =>
              import('./features/assistant/assistant').then((m) => m.AssistantPage),
          },
          {
            path: 'admin',
            canActivate: [roles('Administrator')],
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'enrollments' },
              {
                path: 'school',
                loadComponent: () =>
                  import('./features/admin/school-setup').then((m) => m.SchoolSetupPage),
              },
              {
                path: 'enrollments',
                loadComponent: () =>
                  import('./features/admin/enrollments').then((m) => m.EnrollmentsAdminPage),
              },
              {
                path: 'people',
                loadComponent: () => import('./features/admin/people').then((m) => m.PeoplePage),
              },
              {
                path: 'vehicles',
                loadComponent: () =>
                  import('./features/admin/vehicles').then((m) => m.VehiclesPage),
              },
              {
                path: 'programs',
                loadComponent: () =>
                  import('./features/admin/programs').then((m) => m.ProgramsPage),
              },
              {
                path: 'rules',
                canActivate: [permission('SchoolRuleOwner')],
                loadComponent: () => import('./features/admin/rules').then((m) => m.RulesPage),
              },
              {
                path: 'audit',
                loadComponent: () => import('./features/admin/audit').then((m) => m.AuditPage),
              },
            ],
          },
        ],
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./features/not-found').then((m) => m.ForbiddenPage),
      },
      {
        path: '**',
        loadComponent: () => import('./features/not-found').then((m) => m.NotFoundPage),
      },
    ],
  },
];
