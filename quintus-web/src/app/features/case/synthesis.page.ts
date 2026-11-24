import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  MBV,
  RSE,
  STATUS,
  beneficiaryTotals,
  blank,
  compensationError,
  irsiBase,
  r2,
  sum,
  verifyEstimate,
  sinappsIssues,
} from '../../domain';
import { benefitOf, calcMap, groupsOf, insured } from '../../state/case-ops';
import { CaseStore } from '../../state/case-store';
import { ToastService } from '../../state/toast.service';
import { EurPipe, PctPipe, QtyPipe } from '../../shared/pipes';

@Component({
  selector: 'app-synthesis-page',
  imports: [EurPipe, PctPipe, QtyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.current(); as c) {
      @if (store.estimate(); as e) {
        <section class="head">
          <div>
            <h1>Synthèse</h1>
            <p class="muted">{{ c.number }} · {{ insuredName() }} · {{ e.name }}</p>
          </div>
          <div class="actions">
            @switch (category()) {
              @case ('Brouillon') {
                <button class="btn primary" type="button" (click)="verify()">
                  Vérifier l'estimation
                </button>
              }
              @case ('Vérifiée') {
                <button class="btn primary" type="button" (click)="advance()">
                  Exporter et verrouiller</button
                ><button class="btn ghost" type="button" (click)="verify()">
                  Vérifier à nouveau
                </button>
              }
              @case ('Exportée') {
                <button class="btn primary" type="button" (click)="advance()">
                  Marquer comme communiquée à l'assureur
                </button>
              }
              @case ('Communiquée') {
                <button class="btn primary" type="button" (click)="advance()">
                  Figer l'estimation
                </button>
              }
            }
          </div>
        </section>
        @if (errors().length) {
          <div class="banner err" role="alert">
            <strong>Échec de la vérification.</strong> Corrigez les points suivants :
            <ul>
              @for (x of errors(); track x) {
                <li>{{ x }}</li>
              }
            </ul>
          </div>
        }
        <dl class="kv big">
          <div>
            <dt>Dommages TTC</dt>
            <dd>{{ kpi().ttc | eur }}</dd>
          </div>
          <div>
            <dt>Dommages vétusté déduite</dt>
            <dd>{{ kpi().vd | eur }}</dd>
          </div>
          <div>
            <dt>Indemnisation totale</dt>
            <dd>{{ kpi().indemnity | eur }}</dd>
          </div>
          <div>
            <dt>IRSI, assiette du local</dt>
            <dd>{{ kpi().irsi === null ? 'Non calculée' : (kpi().irsi | eur) }}</dd>
          </div>
        </dl>
        <div class="tabs" role="tablist">
          <button type="button" role="tab" [class.on]="tab() === 'main'" (click)="tab.set('main')">
            Synthèse
          </button>
          <button
            type="button"
            role="tab"
            [class.on]="tab() === 'detail'"
            (click)="tab.set('detail')"
          >
            Détail des dommages
          </button>
        </div>
        @if (tab() === 'main') {
          @for (block of byParty(); track block.name) {
            <section class="panel flush">
              <div class="panel-h pad">
                <h2>
                  {{ block.name }}
                  @if (block.insured) {
                    <span class="pill s-ver">Assuré</span>
                  }
                </h2>
                <span class="muted">Montant réclamé : {{ block.claimed | eur }}</span>
              </div>
              <div class="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Nature</th>
                      <th class="r">Valeur à neuf HT €</th>
                      <th class="r">Valeur à neuf TTC €</th>
                      <th class="r">Montant vétusté €</th>
                      <th class="r">Montant vétusté déduite €</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of block.lines; track l.label) {
                      <tr [class.tot]="l.total">
                        <td>
                          {{ l.label }}
                          @if (l.synth) {
                            <small class="muted">{{ l.synth }}</small>
                          }
                        </td>
                        <td class="r">{{ l.ht | eur }}</td>
                        <td class="r">{{ l.ttc | eur }}</td>
                        <td class="r">{{ l.obs | eur }}</td>
                        <td class="r">{{ l.vd | eur }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          } @empty {
            <div class="empty"><p>Aucun dommage chiffré sur cette estimation.</p></div>
          }
        } @else {
          <section class="panel flush">
            <div class="tw">
              <table>
                <thead>
                  <tr>
                    <th>Tiers</th>
                    <th>Nature</th>
                    <th>Détail</th>
                    <th>Désignation</th>
                    <th class="r">Qté</th>
                    <th class="r">Prix unitaire €</th>
                    <th class="r">Montant HT €</th>
                    <th class="r">TVA %</th>
                    <th class="r">Montant TTC €</th>
                    <th class="r">Vétusté €</th>
                    <th class="r">Montant VD €</th>
                    <th>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of details(); track d.id) {
                    <tr>
                      <td>{{ party(d.thirdPartyId) }}</td>
                      <td>{{ d.l1 }}</td>
                      <td>{{ d.l2 }}</td>
                      <td>{{ d.name }}</td>
                      <td class="r">{{ d.qty | qty }} {{ d.um }}</td>
                      <td class="r">{{ d.unit | eur }}</td>
                      <td class="r">{{ d.priceNoVAT | eur }}</td>
                      <td class="r">{{ d.vat | pct }}</td>
                      <td class="r">{{ d.priceWithVAT | eur }}</td>
                      <td class="r">{{ (d.l1 === rse ? 0 : d.obsAmount) | eur }}</td>
                      <td class="r">{{ d.priceWithObs | eur }}</td>
                      <td>{{ d.mode }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="12" class="muted">Aucune ligne.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    }
  `,
})
export class SynthesisPage {
  protected readonly store = inject(CaseStore);
  private readonly toast = inject(ToastService);
  protected readonly rse = RSE;
  protected readonly tab = signal<'main' | 'detail'>('main');
  protected readonly errors = signal<string[]>([]);

  protected readonly category = computed(() => STATUS[this.store.estimate()?.status ?? 1].category);
  protected readonly insuredName = computed(() => insured(this.store.current()!)?.name ?? '');
  private readonly groups = computed(() => groupsOf(this.store.current()!, this.store.estimate()!));
  protected readonly kpi = computed(() => {
    const c = this.store.current()!,
      e = this.store.estimate()!;
    const irsi = !c.irsiEnabled
      ? null
      : e.status === 1
        ? irsiBase(e.damages, calcMap(e))
        : e.irsiBase;
    return {
      ttc: r2(sum(e.damages, (d) => d.priceWithVAT)),
      vd: r2(sum(e.damages, (d) => d.priceWithObs)),
      indemnity: r2(
        sum(e.beneficiaries, (b) => {
          const t = beneficiaryTotals(this.groups(), b);
          return t.totalImmediate + t.totalDeferred;
        }),
      ),
      irsi,
    };
  });
  protected readonly byParty = computed(() => {
    const c = this.store.current()!,
      e = this.store.estimate()!,
      refs = this.store.refs();
    const line = (label: string, ds: typeof e.damages, synth = '', total = false) => ({
      label,
      synth,
      total,
      ht: r2(sum(ds, (d) => d.priceNoVAT)),
      ttc: r2(sum(ds, (d) => d.priceWithVAT)),
      obs: r2(sum(ds, (d) => (d.l1 === RSE ? 0 : d.obsAmount))),
      vd: r2(sum(ds, (d) => d.priceWithObs)),
    });
    return c.thirdParties.flatMap((tp) => {
      const ds = e.damages.filter((d) => d.thirdPartyId === tp.id);
      if (!ds.length) return [];
      const natures = [...new Set(ds.map((d) => d.l1))];
      return [
        {
          name: tp.name,
          insured: tp.insured,
          claimed:
            e.calculations
              .filter((k) => k.thirdPartyId === tp.id)
              .reduce((a, k) => a + (k.claimedAmount ?? 0), 0) || null,
          lines: [
            ...natures.map((l1) =>
              line(
                l1,
                ds.filter((d) => d.l1 === l1),
                l1 === MBV
                  ? ''
                  : (benefitOf(refs, l1, ds.find((d) => d.l1 === l1)!.l2)?.synth1 ?? ''),
              ),
            ),
            line('TOTAL', ds, '', true),
          ],
        },
      ];
    });
  });
  protected readonly details = computed(() =>
    [...this.store.estimate()!.damages].sort((a, b) =>
      a.thirdPartyId + a.lineIndex < b.thirdPartyId + b.lineIndex ? -1 : 1,
    ),
  );

  protected party(id: string): string {
    return this.store.current()!.thirdParties.find((t) => t.id === id)?.name ?? '';
  }

  /** btnCheckCurrentEstimate_SMS */
  protected verify(): void {
    const c = this.store.current()!,
      e = this.store.estimate()!,
      groups = this.groups();
    const cErr =
      e.beneficiaries.length && groups.some((g) => g.beneficiaryId)
        ? compensationError(groups, e.beneficiaries)
        : '';
    const res = verifyEstimate({
      damages: e.damages,
      stances: e.stances.filter((s) => !blank(s.stance)),
      beneficiaries: e.beneficiaries,
      groups,
      damageEstimate: e.damageEstimate,
      position: e.position,
      hasCoverages: c.coverages.length > 0,
      coverages: c.coverages,
      riskObjectIds: c.riskObjects.map((r) => r.id),
    });
    const sinapps = sinappsIssues(c, e, this.store.refs()).map(
      (i) => `Sinapps (${i.rule}) : ${i.message}`,
    );
    const errors = [...res.errors, ...(cErr ? [cErr] : []), ...sinapps];
    this.errors.set(errors);
    if (errors.length) return;
    if (!res.status)
      return this.toast.show(
        'Rien à vérifier : saisissez des dommages ou une prise de position.',
        true,
      );
    const status = res.status;
    this.store.update((d, est) => {
      est.status = status;
      est.statusDate = new Date().toISOString();
      est.irsiBase = d.irsiEnabled ? irsiBase(est.damages, calcMap(est)) : null;
    });
    this.toast.show(STATUS[status].label);
  }

  /** Vérifiée → exportée → communiquée → figée (même objet : +4) */
  protected advance(): void {
    const e = this.store.estimate()!;
    if (e.status < 2 || e.status > 13) return;
    const next = e.status + 4;
    this.store.update((_, est) => {
      est.status = next;
      est.statusDate = new Date().toISOString();
    });
    this.toast.show(STATUS[next].label);
  }
}
