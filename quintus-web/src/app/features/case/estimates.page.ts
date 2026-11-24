import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { STATUS, isReadOnly, r2, sum } from '../../domain';
import { duplicateEstimate, newEstimate, touch } from '../../state/case-ops';
import { CaseStore } from '../../state/case-store';
import { ToastService } from '../../state/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { n2, parseNum } from '../../shared/format';
import { EurPipe, FrDatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-estimates-page',
  imports: [EurPipe, FrDatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.current(); as c) {
      <section class="head">
        <div>
          <h1>Estimations</h1>
          <p class="muted">
            L'évaluation des dommages sert quand aucun chiffrage détaillé n'est saisi.
          </p>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" (click)="add()">Nouvelle estimation</button>
        </div>
      </section>
      <section class="panel flush">
        <div class="tw">
          <table>
            <thead>
              <tr>
                <th>Estimation</th>
                <th>Statut</th>
                <th class="r">Lignes</th>
                <th class="r">Total HT €</th>
                <th class="r">Total TTC €</th>
                <th class="r">Évaluation des dommages €</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.e.id) {
                <tr>
                  <td>
                    <strong>{{ row.e.name }}</strong>
                    @if (row.e.id === c.referenceEstimateId) {
                      <span class="pill s-ver">Référence</span>
                    }
                  </td>
                  <td>
                    <span class="pill">{{ row.status }}</span
                    ><br /><small class="muted">{{ row.e.statusDate | frDate }}</small>
                  </td>
                  <td class="r">{{ row.e.damages.length }}</td>
                  <td class="r">{{ row.ht | eur }}</td>
                  <td class="r">{{ row.ttc | eur }}</td>
                  <td class="r">
                    <input
                      class="num"
                      inputmode="decimal"
                      [value]="n2(row.e.damageEstimate)"
                      [disabled]="row.readOnly"
                      (change)="setEstimate(row.e.id, $event)"
                      aria-label="Évaluation des dommages"
                    />
                  </td>
                  <td class="acts">
                    <button class="btn sm" type="button" (click)="openEstimate(row.e.id)">
                      Ouvrir
                    </button>
                    <button class="btn sm ghost" type="button" (click)="duplicate(row.e.id)">
                      Dupliquer
                    </button>
                    @if (row.e.id !== c.referenceEstimateId) {
                      <button class="btn sm ghost" type="button" (click)="setReference(row.e.id)">
                        Définir en référence
                      </button>
                    }
                    @if (c.estimates.length > 1) {
                      <button
                        class="btn sm ghost danger-t"
                        type="button"
                        (click)="remove(row.e.id, row.e.name)"
                      >
                        Supprimer
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
    <app-confirm-dialog />
  `,
})
export class EstimatesPage {
  protected readonly store = inject(CaseStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = viewChild.required(ConfirmDialog);
  protected readonly n2 = n2;

  protected readonly rows = computed(() =>
    (this.store.current()?.estimates ?? []).map((e) => ({
      e,
      status: STATUS[e.status].label,
      readOnly: isReadOnly(e.status),
      ht: r2(sum(e.damages, (d) => d.priceNoVAT)),
      ttc: r2(sum(e.damages, (d) => d.priceWithVAT)),
    })),
  );

  protected add(): void {
    this.store.update((c) => {
      const e = newEstimate(c);
      c.estimates.push(e);
      this.store.estimateId.set(e.id);
    });
  }
  protected openEstimate(id: string): void {
    this.store.estimateId.set(id);
    void this.router.navigate(['/dossiers', this.store.caseId(), 'dommages']);
  }
  protected duplicate(id: string): void {
    this.store.update((c) => {
      const copy = duplicateEstimate(c, id);
      this.store.estimateId.set(copy.id);
      this.toast.show(`${copy.name} créée en brouillon`);
    });
  }
  protected setReference(id: string): void {
    this.store.update((c) => void (c.referenceEstimateId = id));
  }
  protected setEstimate(id: string, ev: Event): void {
    const v = parseNum((ev.target as HTMLInputElement).value);
    if (v === undefined || (v !== null && v < 0))
      return this.toast.show(`La valeur saisie n'est pas valide`, true);
    this.store.update((c) => {
      const e = c.estimates.find((x) => x.id === id)!;
      e.damageEstimate = v || null;
      touch(e);
    });
  }
  protected async remove(id: string, name: string): Promise<void> {
    if (!(await this.confirm().ask(`Supprimer ${name} et tout son chiffrage ?`))) return;
    this.store.update((c) => {
      c.estimates = c.estimates.filter((x) => x.id !== id);
      if (c.referenceEstimateId === id) c.referenceEstimateId = c.estimates[0].id;
    });
    this.store.estimateId.set(null);
  }
}
