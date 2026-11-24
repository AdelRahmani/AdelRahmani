import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { CaseStore } from '../state/case-store';

/** Dans un dossier, le titre de l'onglet commence par le n° de mission : plusieurs onglets ouverts depuis Eureka restent reconnaissables */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly store = inject(CaseStore);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const base = this.buildTitle(snapshot) ?? 'Eureka Chiffrage';
    let id: string | undefined;
    for (let r: ActivatedRouteSnapshot | null = snapshot.root; r; r = r.firstChild)
      id = r.params['id'] ?? id;
    const c = id ? this.store.cases().find((x) => x.id === id) : undefined;
    this.title.setTitle(c ? `${c.number || 'Sans numéro'} · ${base}` : base);
  }
}
