import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CaseStore } from './state/case-store';
import { ToastService } from './state/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <header class="top">
      <div class="wrap">
        <div class="top-row">
          <a class="logo" routerLink="/dossiers" aria-label="Eureka Chiffrage, retour aux dossiers"
            ><i></i>Eureka Chiffrage</a
          >
          @if (store.current(); as c) {
            <div class="crumb">
              <a class="link" routerLink="/dossiers">Dossiers</a><span>/</span
              ><strong>{{ c.number || 'Sans numéro' }}</strong>
              @if (c.demo) {
                <span class="pill s-bro">Exemple</span>
              }
            </div>
            <button
              class="btn sm ghost undo"
              type="button"
              [disabled]="!store.canUndo()"
              (click)="store.undo()"
            >
              Annuler la dernière action
            </button>
          }
        </div>
      </div>
    </header>
    <router-outlet />
    @if (toast.current(); as t) {
      <div class="toast show" [class.err]="t.error" role="status" aria-live="polite">
        {{ t.text }}
      </div>
    }
  `,
  styles: `
    a.logo {
      text-decoration: none;
    }
  `,
})
export class App {
  protected readonly store = inject(CaseStore);
  protected readonly toast = inject(ToastService);

  /** Ctrl+Z hors champ de saisie : annule la dernière action du dossier ouvert */
  onKey(ev: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    if (
      (ev.ctrlKey || ev.metaKey) &&
      ev.key.toLowerCase() === 'z' &&
      !ev.shiftKey &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) &&
      !document.querySelector('dialog[open]')
    ) {
      ev.preventDefault();
      this.store.undo();
    }
  }
}
