import { Routes } from '@angular/router';
import { CASE_STEPS } from './features/case/steps';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dossiers' },
  {
    path: 'ouvrir',
    title: 'Ouverture · Eureka Chiffrage',
    loadComponent: () =>
      import('./features/open/open-assignment.page').then((m) => m.OpenAssignmentPage),
  },
  {
    path: 'dossiers',
    title: 'Dossiers · Eureka Chiffrage',
    loadComponent: () => import('./features/cases/cases.page').then((m) => m.CasesPage),
  },
  {
    path: 'dossiers/:id',
    loadComponent: () => import('./features/case/case-layout').then((m) => m.CaseLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'infos' },
      ...CASE_STEPS.map((s) => ({
        path: s.path,
        title: `${s.label} · Eureka Chiffrage`,
        loadComponent: s.load,
        data: { step: s },
      })),
    ],
  },
  { path: '**', redirectTo: 'dossiers' },
];
