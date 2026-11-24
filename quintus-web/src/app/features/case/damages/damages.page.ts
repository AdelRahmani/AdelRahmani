import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import {
  Damage,
  MBV,
  RSE,
  num,
  r2,
  sum,
  transverseObsolescence,
  irsiAmount,
} from '../../../domain';
import {
  benefitOf,
  calcMap,
  getCalc,
  patchDamage,
  removeDamage,
  riskObjectLabel,
  scopeDamages,
  setTaxRegime,
  touch,
  upsertDamage,
} from '../../../state/case-ops';
import { CaseStore } from '../../../state/case-store';
import { ToastService } from '../../../state/toast.service';
import { ConfirmDialog } from '../../../shared/confirm-dialog';
import { n2, parseNum, pct, qty } from '../../../shared/format';
import { EurPipe, PctPipe, QtyPipe } from '../../../shared/pipes';
import { DamageDialog } from './damage-dialog';

interface Totals {
  ht: number;
  ttc: number;
  obs: number;
  vd: number;
}
type Row =
  | ({
      kind: 'l1';
      key: string;
      label: string;
      collapsed: boolean;
      uniformPct: number | null;
    } & Totals)
  | ({ kind: 'l2'; key: string; label: string } & Totals)
  | { kind: 'line'; key: string; d: Damage; room: string; eco: boolean }
  | ({ kind: 'total'; key: string } & Totals);

const totals = (ds: readonly Damage[]): Totals => ({
  ht: r2(sum(ds, (d) => d.priceNoVAT)),
  ttc: r2(sum(ds, (d) => d.priceWithVAT)),
  obs: r2(sum(ds, (d) => (d.l1 === RSE ? 0 : d.obsAmount))),
  vd: r2(sum(ds, (d) => d.priceWithObs)),
});

@Component({
  selector: 'app-damages-page',
  imports: [EurPipe, PctPipe, QtyPipe, DamageDialog, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.current(); as c) {
      <section class="head">
        <div><h1>Dommages</h1></div>
        @if (tp() && tab() === 'prest') {
          <div class="actions">
            <button class="btn primary" type="button" [disabled]="ro()" (click)="add()">
              Ajouter une prestation
            </button>
          </div>
        }
      </section>

      @if (!tp()) {
        <div class="empty"><p>Ajoutez d'abord l'assuré dans les parties prenantes.</p></div>
      } @else if (tp()!.insured && !c.riskObjects.length) {
        <div class="empty">
          <p>Ajoutez un objet de risque : les dommages de l'assuré y sont rattachés.</p>
        </div>
      } @else {
        <div class="filters">
          <div class="fld">
            <label for="dm-tp">Tiers</label>
            <select id="dm-tp" (change)="tpId.set($any($event.target).value)">
              @for (t of c.thirdParties; track t.id) {
                <option [value]="t.id" [selected]="t.id === tp()!.id">
                  {{ t.name }}{{ t.insured ? ' (assuré)' : '' }}
                </option>
              }
            </select>
          </div>
          @if (tp()!.insured) {
            <div class="fld">
              <label for="dm-ro">Objet de risque</label>
              <select id="dm-ro" (change)="roId.set($any($event.target).value)">
                @for (r of c.riskObjects; track r.id) {
                  <option [value]="r.id" [selected]="r.id === riskObjectId()">
                    {{ roLabel(r.id) }}
                  </option>
                }
              </select>
            </div>
          }
          <div class="fld">
            <label for="dm-claimed">Montant réclamé €</label>
            <input
              id="dm-claimed"
              class="num"
              inputmode="decimal"
              [value]="n2(calc()?.claimedAmount)"
              [disabled]="ro()"
              (change)="setClaimed($event)"
            />
          </div>
          <div class="fld">
            <label>Régime fiscal du règlement</label>
            <span class="seg" role="group"
              ><button
                type="button"
                [class.on]="!ttc()"
                [disabled]="ro()"
                (click)="setRegime(false)"
              >
                HT</button
              ><button type="button" [class.on]="ttc()" [disabled]="ro()" (click)="setRegime(true)">
                TTC
              </button></span
            >
          </div>
          <div class="fld">
            <label>IRSI</label>
            <span class="seg" role="group"
              ><button
                type="button"
                [class.on]="!c.irsiEnabled"
                [disabled]="ro()"
                (click)="setIrsi(false)"
              >
                non</button
              ><button
                type="button"
                [class.on]="c.irsiEnabled"
                [disabled]="ro()"
                (click)="setIrsi(true)"
              >
                oui
              </button></span
            >
          </div>
          <div class="fld">
            <label>Inclus dans l'assiette IRSI</label>
            <span class="seg" role="group"
              ><button
                type="button"
                [class.on]="!(calc()?.includedInIRSI ?? true)"
                [disabled]="ro() || !c.irsiEnabled"
                (click)="setIncluded(false)"
              >
                non</button
              ><button
                type="button"
                [class.on]="calc()?.includedInIRSI ?? true"
                [disabled]="ro() || !c.irsiEnabled"
                (click)="setIncluded(true)"
              >
                oui
              </button></span
            >
          </div>
        </div>

        <div class="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [class.on]="tab() === 'prest'"
            [attr.aria-selected]="tab() === 'prest'"
            (click)="tab.set('prest')"
          >
            Prestations <span class="count">{{ counts().prest }}</span>
          </button>
          <button
            type="button"
            role="tab"
            [class.on]="tab() === 'mbv'"
            [attr.aria-selected]="tab() === 'mbv'"
            (click)="tab.set('mbv')"
          >
            Mobilier et biens volés <span class="count">{{ counts().mbv }}</span>
          </button>
        </div>

        @if (tab() === 'mbv') {
          <p class="muted">
            La fenêtre d'ajout d'un bien mobilier reste à porter ; les biens existants se modifient
            dans le tableau.
          </p>
        }
        @if (rows().length) {
          <section class="panel flush">
            <div class="tw">
              <table>
                <thead>
                  <tr>
                    <th>{{ tab() === 'mbv' ? 'Bien' : 'Prestation' }}</th>
                    <th>Pièce</th>
                    <th class="r">Qté</th>
                    <th class="r">Prix unitaire HT €</th>
                    <th class="r">Montant HT €</th>
                    <th class="r">TVA</th>
                    <th class="r">Montant TTC €</th>
                    <th class="r">Vétusté %</th>
                    <th class="r">Vétusté €</th>
                    <th class="r">Vétusté déduite {{ ttc() ? 'TTC' : 'HT' }} €</th>
                    <th>Mode</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.key) {
                    @switch (row.kind) {
                      @case ('l1') {
                        <tr class="l1">
                          <td colspan="4">
                            <button
                              class="tw-btn"
                              type="button"
                              [attr.aria-expanded]="!row.collapsed"
                              (click)="toggle(row.key)"
                            >
                              {{ row.collapsed ? '▸' : '▾' }}
                            </button>
                            {{ row.label }}
                          </td>
                          <td class="r">{{ row.ht | eur }}</td>
                          <td></td>
                          <td class="r">{{ row.ttc | eur }}</td>
                          <td class="r">
                            @if (tab() === 'prest' && row.label !== rse) {
                              <input
                                class="num xs"
                                inputmode="decimal"
                                placeholder="Vét. %"
                                [value]="pct(row.uniformPct)"
                                [disabled]="ro()"
                                (change)="transverse(row.label, $event)"
                                aria-label="Vétusté appliquée à toute la nature"
                              />
                            }
                          </td>
                          <td class="r">{{ row.obs | eur }}</td>
                          <td class="r">{{ row.vd | eur }}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      }
                      @case ('l2') {
                        <tr class="l2">
                          <td colspan="4">{{ row.label }}</td>
                          <td class="r">{{ row.ht | eur }}</td>
                          <td></td>
                          <td class="r">{{ row.ttc | eur }}</td>
                          <td></td>
                          <td class="r">{{ row.obs | eur }}</td>
                          <td class="r">{{ row.vd | eur }}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      }
                      @case ('line') {
                        <tr class="l3">
                          <td>
                            <button
                              class="link ln"
                              type="button"
                              [disabled]="row.d.l1 === mbv"
                              (click)="edit(row.d)"
                            >
                              {{ row.d.name }}
                            </button>
                            @if (row.eco) {
                              <span
                                class="leaf"
                                title="Prestation la moins carbonée de sa catégorie"
                                >éco</span
                              >
                            }
                            @if (row.d.goodStatus || row.d.proof) {
                              <br /><small class="muted"
                                >{{ row.d.goodStatus }} · {{ row.d.proof }}</small
                              >
                            }
                            @if (row.d.source) {
                              <br /><small class="muted">{{ row.d.source }}</small>
                            }
                          </td>
                          <td>{{ row.room }}</td>
                          <td class="r">
                            @if (row.d.l1 === rse) {
                              1 %
                            } @else if (ro() || row.d.l1 === mbv) {
                              {{ row.d.qty | qty }} {{ row.d.um }}
                            } @else {
                              <span class="join end"
                                ><input
                                  class="num cell"
                                  inputmode="decimal"
                                  [value]="qtyFmt(row.d.qty)"
                                  (change)="patch(row.d, 'qty', $event)"
                                  aria-label="Quantité"
                                /><span class="um">{{ row.d.um }}</span></span
                              >
                            }
                          </td>
                          <td class="r">
                            @if (row.d.l1 === rse || ro()) {
                              {{ row.d.unit | eur }}
                            } @else {
                              <input
                                class="num cell"
                                inputmode="decimal"
                                [value]="n2(row.d.unit)"
                                (change)="patch(row.d, 'unit', $event)"
                                aria-label="Prix unitaire HT"
                              />
                            }
                          </td>
                          <td class="r">{{ row.d.priceNoVAT | eur }}</td>
                          <td class="r">{{ row.d.vat | pct }} %</td>
                          <td class="r">{{ row.d.priceWithVAT | eur }}</td>
                          <td class="r">
                            @if (row.d.l1 !== rse) {
                              @if (ro()) {
                                {{ row.d.obsPct | pct }} %
                              } @else {
                                <input
                                  class="num cell"
                                  inputmode="decimal"
                                  [value]="pct(row.d.obsPct)"
                                  (change)="patch(row.d, 'obsPct', $event)"
                                  aria-label="Vétusté %"
                                />
                              }
                            }
                          </td>
                          <td class="r">
                            @if (row.d.l1 !== rse) {
                              {{ row.d.obsAmount | eur }}
                            }
                          </td>
                          <td class="r">{{ row.d.priceWithObs | eur }}</td>
                          <td>{{ row.d.mode }}</td>
                          <td class="acts">
                            @if (!ro()) {
                              <button
                                class="ico"
                                type="button"
                                title="Monter"
                                aria-label="Monter la ligne"
                                (click)="move(row.d, -1)"
                              >
                                ↑
                              </button>
                              <button
                                class="ico"
                                type="button"
                                title="Descendre"
                                aria-label="Descendre la ligne"
                                (click)="move(row.d, 1)"
                              >
                                ↓
                              </button>
                              @if (row.d.l1 !== mbv) {
                                <button
                                  class="ico"
                                  type="button"
                                  title="Dupliquer"
                                  aria-label="Dupliquer la ligne"
                                  (click)="duplicate(row.d)"
                                >
                                  ⧉
                                </button>
                              }
                              <button
                                class="ico danger-t"
                                type="button"
                                title="Supprimer"
                                aria-label="Supprimer la ligne"
                                (click)="remove(row.d)"
                              >
                                ✕
                              </button>
                            }
                          </td>
                        </tr>
                      }
                      @case ('total') {
                        <tr class="tot">
                          <td colspan="4">TOTAL</td>
                          <td class="r">{{ row.ht | eur }}</td>
                          <td></td>
                          <td class="r">{{ row.ttc | eur }}</td>
                          <td></td>
                          <td class="r">{{ row.obs | eur }}</td>
                          <td class="r">{{ row.vd | eur }}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      }
                    }
                  }
                </tbody>
              </table>
            </div>
          </section>
        } @else {
          <div class="empty">
            <p>
              {{
                tab() === 'mbv'
                  ? 'Aucun bien mobilier saisi pour ce tiers.'
                  : 'Aucune prestation saisie pour ce tiers.'
              }}
            </p>
          </div>
        }
      }
    }
    <app-damage-dialog />
    <app-confirm-dialog />
  `,
})
export class DamagesPage {
  protected readonly store = inject(CaseStore);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required(DamageDialog);
  private readonly confirm = viewChild.required(ConfirmDialog);
  protected readonly mbv = MBV;
  protected readonly rse = RSE;
  protected readonly n2 = n2;
  protected readonly pct = pct;
  protected readonly qtyFmt = qty;
  protected readonly ro = this.store.readOnly;

  protected readonly tab = signal<'prest' | 'mbv'>('prest');
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** tiers affiché : l'assuré par défaut */
  protected readonly tpId = linkedSignal(
    () =>
      this.store.current()?.thirdParties.find((t) => t.insured)?.id ??
      this.store.current()?.thirdParties[0]?.id ??
      null,
  );
  protected readonly roId = linkedSignal(() => this.store.current()?.riskObjects[0]?.id ?? null);

  protected readonly tp = computed(
    () => this.store.current()?.thirdParties.find((t) => t.id === this.tpId()) ?? null,
  );
  protected readonly riskObjectId = computed(() => (this.tp()?.insured ? this.roId() : null));
  protected readonly calc = computed(() => {
    const e = this.store.estimate(),
      tp = this.tp();
    return e && tp
      ? (e.calculations.find(
          (k) => k.thirdPartyId === tp.id && (k.riskObjectId ?? null) === this.riskObjectId(),
        ) ?? null)
      : null;
  });
  protected readonly ttc = computed(() => this.calc()?.taxRegime ?? true);
  private readonly scoped = computed(() => {
    const e = this.store.estimate(),
      tp = this.tp();
    return e && tp ? scopeDamages(e, tp.id, tp.insured, this.riskObjectId()) : [];
  });
  protected readonly counts = computed(() => ({
    prest: this.scoped().filter((d) => d.l1 !== MBV).length,
    mbv: this.scoped().filter((d) => d.l1 === MBV).length,
  }));

  protected readonly rows = computed<Row[]>(() => {
    const isMbv = this.tab() === 'mbv';
    const list = this.scoped()
      .filter((d) => (d.l1 === MBV) === isMbv)
      .sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
    if (!list.length) return [];
    const c = this.store.current()!,
      prices = this.store.refs().prices;
    const roomName = (id?: string | null) => c.rooms.find((r) => r.id === id)?.name ?? '';
    const level1 = (d: Damage) => (isMbv ? d.l2 : d.l1);
    const out: Row[] = [];
    for (const l1 of [...new Set(list.map(level1))]) {
      const g1 = list.filter((d) => level1(d) === l1);
      const key = 'c:' + l1,
        collapsed = this.collapsed().has(key);
      const pcts = [...new Set(g1.map((d) => num(d.obsPct)))];
      out.push({
        kind: 'l1',
        key,
        label: l1,
        collapsed,
        uniformPct: pcts.length === 1 && pcts[0] ? pcts[0] : null,
        ...totals(g1),
      });
      if (collapsed) continue;
      for (const l2 of isMbv ? [null] : [...new Set(g1.map((d) => d.l2))]) {
        const g2 = l2 === null ? g1 : g1.filter((d) => d.l2 === l2);
        if (l2 !== null && l2 !== 'N/A')
          out.push({ kind: 'l2', key: `${key}|${l2}`, label: l2, ...totals(g2) });
        for (const d of g2) {
          const better = !!d.csr && prices.some((p) => p.csr === d.csr && num(p.co2) < num(d.co2));
          out.push({
            kind: 'line',
            key: d.id,
            d,
            room: roomName(d.roomId),
            eco: !!d.csr && !better,
          });
        }
      }
    }
    out.push({ kind: 'total', key: 'total', ...totals(list) });
    return out;
  });

  protected roLabel(id: string): string {
    return riskObjectLabel(this.store.current()!, id);
  }
  protected toggle(key: string): void {
    this.collapsed.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  private scopeInfo() {
    const c = this.store.current()!,
      tp = this.tp()!;
    return {
      thirdPartyId: tp.id,
      riskObjectId: this.riskObjectId(),
      label: tp.name + (tp.insured ? ' · ' + riskObjectLabel(c, this.riskObjectId()) : ''),
    };
  }
  protected add(): void {
    this.dialog().open(this.scopeInfo());
  }
  protected edit(d: Damage): void {
    if (d.l1 === MBV) return;
    if (this.ro()) return;
    this.dialog().open(this.scopeInfo(), d);
  }

  /** Saisie directe dans le tableau */
  protected patch(d: Damage, key: 'qty' | 'unit' | 'obsPct', ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const v = parseNum(input.value);
    const bad =
      v === undefined ||
      (v ?? 0) < 0 ||
      (key !== 'obsPct' && v === null) ||
      (key === 'qty' && !(num(v) > 0)) ||
      (key === 'obsPct' && num(v) > 100);
    if (bad) {
      this.toast.show(`La valeur saisie '${input.value}' n'est pas valide`, true);
      input.value = key === 'obsPct' ? pct(d[key]) : key === 'qty' ? qty(d[key]) : n2(d[key]);
      return;
    }
    if (num(v) === num(d[key])) return;
    this.store.update((_, e) => patchDamage(e, this.store.refs(), d.id, { [key]: num(v) }));
  }

  protected transverse(l1: string, ev: Event): void {
    const v = parseNum((ev.target as HTMLInputElement).value);
    if (v === undefined || v === null || v < 0 || v > 100)
      return this.toast.show('La vétusté doit être un pourcentage entre 0 et 100', true);
    const tp = this.tp()!,
      roId = this.riskObjectId();
    this.store.update((_, e) => {
      const calc = getCalc(e, tp.id, roId);
      for (const d of scopeDamages(e, tp.id, tp.insured, roId).filter((x) => x.l1 === l1)) {
        Object.assign(d, transverseObsolescence(d, v, calc.taxRegime));
        d.irsiAmount = irsiAmount(benefitOf(this.store.refs(), d.l1, d.l2), d);
      }
      touch(e, calc);
    });
  }

  protected setRegime(ttc: boolean): void {
    const tp = this.tp()!,
      roId = this.riskObjectId();
    let reset = false;
    this.store.update((_, e) => {
      reset = setTaxRegime(e, getCalc(e, tp.id, roId), ttc, tp.insured);
    });
    if (reset)
      this.toast.show(
        "Régime fiscal modifié : l'indemnisation de ces dommages est à ventiler de nouveau.",
      );
  }
  protected setClaimed(ev: Event): void {
    const v = parseNum((ev.target as HTMLInputElement).value);
    if (v === undefined || (v ?? 0) < 0)
      return this.toast.show("Le montant réclamé n'est pas valide", true);
    const tp = this.tp()!,
      roId = this.riskObjectId();
    this.store.update((_, e) => {
      const k = getCalc(e, tp.id, roId);
      k.claimedAmount = v || null;
      touch(e, k);
    });
  }
  protected setIrsi(on: boolean): void {
    this.store.update((c) => void (c.irsiEnabled = on));
  }
  protected setIncluded(on: boolean): void {
    const tp = this.tp()!,
      roId = this.riskObjectId();
    this.store.update((_, e) => {
      const k = getCalc(e, tp.id, roId);
      k.includedInIRSI = on;
      touch(e, k);
    });
  }

  protected move(d: Damage, dir: -1 | 1): void {
    this.store.update((_, e) => {
      const sib = e.damages
        .filter((x) => x.calculationId === d.calculationId && x.l1 === d.l1 && x.l2 === d.l2)
        .sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
      const i = sib.findIndex((x) => x.id === d.id),
        other = sib[i + dir];
      if (!other) return 'Cette ligne est déjà en bout de liste';
      [sib[i].lineIndex, other.lineIndex] = [other.lineIndex, sib[i].lineIndex];
      return null;
    });
  }
  protected duplicate(d: Damage): void {
    this.store.update((c, e) =>
      upsertDamage(
        c,
        e,
        this.store.refs(),
        { thirdPartyId: d.thirdPartyId, riskObjectId: d.riskObjectId },
        {
          l1: d.l1,
          l2: d.l2,
          name: d.name,
          repairer: d.repairer ?? '',
          mode: d.mode,
          qty: d.qty,
          um: d.um ?? '',
          unit: d.unit,
          vat: d.vat,
          obsPct: d.obsPct,
          obsAmountInput: !d.obsPct && d.obsAmount > 0 ? d.obsAmount : null,
          beneficiaryName: d.beneficiaryName ?? '',
          roomId: d.roomId ?? null,
          co2: d.co2,
          csr: d.csr,
          age: d.age,
          source: d.source,
        },
      ),
    );
  }
  protected async remove(d: Damage): Promise<void> {
    if (await this.confirm().ask(`Supprimer la ligne « ${d.name} » ?`))
      this.store.update((_, e) => removeDamage(e, d.id));
  }
}
