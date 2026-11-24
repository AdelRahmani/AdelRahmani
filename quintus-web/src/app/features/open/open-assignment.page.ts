import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AssignmentError } from '../../data/case-repository';
import { CaseStore } from '../../state/case-store';

/** N° de mission Eureka, par exemple 27FP260071606A01 */
const ASSIGNMENT_NUMBER = /^[A-Z0-9][A-Z0-9-]{5,39}$/;

/**
 * Point d'entrée du bouton « Ouvrir Eureka Chiffrage » d'Eureka :
 *   /ouvrir?assignmentNumber=27FP260071606A01&env=P
 * Mêmes paramètres que l'app Power Apps (Param("assignmentNumber"), Param("env")), pour que
 * Eureka n'ait qu'à changer l'adresse de base pendant la période où les deux applications coexistent.
 * env est accepté pour compatibilité mais ignoré : l'environnement est celui où l'application est déployée.
 */
@Component({
  selector: 'app-open-assignment-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      @if (error(); as err) {
        <div class="empty" role="alert">
          <h1>Impossible d'ouvrir le chiffrage</h1>
          <p>{{ err }}</p>
          <a class="btn" routerLink="/dossiers">Voir les dossiers</a>
        </div>
      } @else {
        <div class="empty" role="status" aria-live="polite">
          <h1>Ouverture du dossier {{ assignmentNumber() }}</h1>
          <p>Récupération des informations de la mission…</p>
        </div>
      }
    </main>
  `,
  styles: `
    a.btn {
      text-decoration: none;
    }
  `,
})
export class OpenAssignmentPage {
  private readonly store = inject(CaseStore);
  private readonly router = inject(Router);
  /** paramètres d'URL, liés par withComponentInputBinding */
  readonly assignmentNumber = input<string>();
  readonly env = input<string>();
  protected readonly error = signal('');

  constructor() {
    effect(() => void this.open(this.assignmentNumber()));
  }

  private async open(raw: string | undefined): Promise<void> {
    const number = (raw ?? '').trim().toUpperCase();
    if (!ASSIGNMENT_NUMBER.test(number)) {
      this.error.set(
        number
          ? `« ${raw} » n'est pas un numéro de mission valide.`
          : "Le numéro de mission est absent de l'adresse. Rouvrez le chiffrage depuis le dossier dans Eureka.",
      );
      return;
    }
    try {
      const id = await this.store.openAssignment(number);
      // replaceUrl : le bouton Précédent ne repasse pas par cette page d'ouverture
      await this.router.navigate(['/dossiers', id, 'dommages'], { replaceUrl: true });
    } catch (err) {
      this.error.set(
        err instanceof AssignmentError
          ? err.reason === 'not-found'
            ? `La mission ${number} est introuvable dans Eureka.`
            : err.reason === 'forbidden'
              ? `Vous n'avez pas accès à la mission ${number}.`
              : "Eureka ne répond pas pour l'instant. Réessayez dans quelques minutes."
          : "L'ouverture du dossier a échoué. Réessayez, ou contactez le support si le problème persiste.",
      );
    }
  }
}
