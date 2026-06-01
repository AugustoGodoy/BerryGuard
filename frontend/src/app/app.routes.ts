import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    title: 'Dashboard — BerryGuard',
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./pages/history/history.component').then((m) => m.HistoryComponent),
    title: 'Histórico de Alertas — BerryGuard',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
    title: 'Configurações — BerryGuard',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
