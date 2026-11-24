import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { CaseRepository, ReferentialRepository } from './data/case-repository';
import { BrowserCaseRepository, BrowserReferentialRepository } from './data/browser-repository';
import { CaseStore } from './state/case-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Stockage : remplacer ces deux lignes pour brancher Dataverse ou l'API Quintus
    { provide: CaseRepository, useClass: BrowserCaseRepository },
    { provide: ReferentialRepository, useClass: BrowserReferentialRepository },
    provideAppInitializer(() => inject(CaseStore).load()),
  ],
};
