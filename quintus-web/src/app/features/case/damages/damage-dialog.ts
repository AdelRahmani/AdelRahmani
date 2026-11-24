import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  Damage,
  Id,
  MBV,
  RSE,
  damageAmounts,
  findRule,
  roomMeasures,
  scaleObsolescence,
} from '../../../domain';
import { LISTS } from '../../../data/reference-data';
import { getCalc, upsertDamage, zonePrice } from '../../../state/case-ops';
import { CaseStore } from '../../../state/case-store';
import { pct, qty as fmtQty, n2, parseNum } from '../../../shared/format';
import { EurPipe } from '../../../shared/pipes';

/** Nombre saisi à la française ; vide accepté (Validators.required gère l'obligation) */
function decimal(max?: number) {
  return (ctl: AbstractControl): ValidationErrors | null => {
    const v = parseNum(ctl.value);
    if (v === undefined) return { decimal: true };
    if (v !== null && (v < 0 || (max !== undefined && v > max))) return { range: true };
    return null;
  };
}

export interface DamageScope {
  thirdPartyId: Id;
  riskObjectId: Id | null;
  label: string;
}

const MEASURES = [
  { value: 'floor', label: 'Sol (m²)', um: 'm²' },
  { value: 'ceiling', label: 'Plafond (m²)', um: 'm²' },
  { value: 'walls', label: 'Murs (m²)', um: 'm²' },
  { value: 'perimeter', label: 'Périmètre (ml)', um: 'ml' },
  { value: 'skirting', label: 'Plinthes (ml)', um: 'ml' },
] as const;

@Component({
  selector: 'app-damage-dialog',
  imports: [ReactiveFormsModule, EurPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="dlg-body">
          <h3>{{ editing() ? 'Modifier la prestation' : 'Ajouter une prestation' }}</h3>
          <p class="muted">{{ scope()?.label }} · règlement {{ ttc() ? 'TTC' : 'HT' }}</p>
          <div class="grid">
            <div class="fld">
              <label for="d-l1">Nature <span class="req">*</span></label>
              <select id="d-l1" formControlName="l1" (change)="form.controls.l2.setValue('')">
                <option value="">—</option>
                @for (n of natures(); track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="d-l2">Détail <span class="req">*</span></label>
              <select id="d-l2" formControlName="l2">
                <option value="">—</option>
                @for (n of details(); track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="d-rep">Bordereau</label>
              <select id="d-rep" formControlName="repairer">
                @for (r of repairers(); track r) {
                  <option [value]="r">{{ r }}</option>
                }
                <option value="Hors bordereau">Hors bordereau</option>
              </select>
            </div>
            <div class="fld">
              <label for="d-mode">Mode d'indemnisation</label>
              <select id="d-mode" formControlName="mode">
                <option value="REN">REN · réparation en nature</option>
                <option value="IP">IP · indemnité pécuniaire</option>
              </select>
            </div>
            <div class="fld wide">
              <label for="d-name">Prestation <span class="req">*</span></label>
              <input id="d-name" formControlName="name" list="d-offers" (change)="pickOffer()" />
              <datalist id="d-offers">
                @for (o of offers(); track o.name) {
                  <option [value]="o.name"></option>
                }
              </datalist>
            </div>
            <div class="fld">
              <label for="d-room">Pièce</label>
              <select id="d-room" formControlName="roomId">
                <option value="">—</option>
                @for (r of rooms(); track r.id) {
                  <option [value]="r.id">{{ r.name }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="d-measure">Reprendre une mesure</label>
              <select
                id="d-measure"
                #measure
                (change)="applyMeasure(measure.value); measure.value = ''"
                [disabled]="!form.controls.roomId.value"
              >
                <option value="">—</option>
                @for (m of measures; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="d-qty">Quantité <span class="req">*</span></label
              ><input id="d-qty" class="num" inputmode="decimal" formControlName="qty" />
            </div>
            <div class="fld">
              <label for="d-um">Unité</label>
              <select id="d-um" formControlName="um">
                <option value="">—</option>
                @for (u of lists.units; track u) {
                  <option [value]="u">{{ u }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="d-unit">Prix unitaire HT € <span class="req">*</span></label
              ><input id="d-unit" class="num" inputmode="decimal" formControlName="unit" />
            </div>
            <div class="fld">
              <label for="d-vat">TVA %</label
              ><select id="d-vat" formControlName="vat">
                @for (v of vatOptions(); track v) {
                  <option [value]="v">{{ v.replace('.', ',') }} %</option>
                }
              </select>
              <small>Taux acceptés par Sinapps</small>
            </div>
            <div class="fld">
              <label for="d-age">Âge (années)</label
              ><input
                id="d-age"
                class="num"
                inputmode="decimal"
                formControlName="age"
                (change)="applyScale()"
              />
              <small>{{ ruleText() }}</small>
            </div>
            <div class="fld">
              <label for="d-obs">Vétusté %</label
              ><input
                id="d-obs"
                class="num"
                inputmode="decimal"
                formControlName="obsPct"
                (change)="form.controls.obsAmount.setValue('')"
              />
            </div>
            <div class="fld">
              <label for="d-obsamt">Vétusté €</label
              ><input
                id="d-obsamt"
                class="num"
                inputmode="decimal"
                formControlName="obsAmount"
                (change)="form.controls.obsPct.setValue('')"
              />
              <small>Un montant saisi remplace le pourcentage.</small>
            </div>
            <div class="fld wide">
              <label for="d-ben">Bénéficiaire</label>
              <select id="d-ben" formControlName="beneficiaryName">
                <option value="">—</option>
                @for (b of beneficiaries(); track b) {
                  <option [value]="b">{{ b }}</option>
                }
              </select>
            </div>
          </div>
          @if (eco(); as alt) {
            <p class="eco">
              Alternative moins carbonée : <strong>{{ alt.name }}</strong>, {{ alt.co2 }} kg CO2e/{{
                alt.unit
              }}.
              <button class="btn sm" type="button" (click)="useOffer(alt.name)">Remplacer</button>
            </p>
          }
          <dl class="kv preview">
            <div>
              <dt>Montant HT</dt>
              <dd>{{ preview().priceNoVAT | eur }}</dd>
            </div>
            <div>
              <dt>Montant TTC</dt>
              <dd>{{ preview().priceWithVAT | eur }}</dd>
            </div>
            <div>
              <dt>Vétusté</dt>
              <dd>{{ preview().obsAmount | eur }}</dd>
            </div>
            <div>
              <dt>Vétusté déduite {{ ttc() ? 'TTC' : 'HT' }}</dt>
              <dd>{{ preview().priceWithObs | eur }}</dd>
            </div>
          </dl>
          @if (error()) {
            <p class="form-err" role="alert">{{ error() }}</p>
          }
        </div>
        <div class="dlg-foot">
          <button class="btn ghost" type="button" (click)="close()">Annuler</button>
          <button class="btn primary" type="submit">Enregistrer</button>
        </div>
      </form>
    </dialog>
  `,
})
export class DamageDialog {
  private readonly store = inject(CaseStore);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly lists = LISTS;
  protected readonly measures = MEASURES;
  protected readonly scope = signal<DamageScope | null>(null);
  protected readonly editing = signal<Damage | null>(null);
  protected readonly error = signal('');
  private meta: { co2: number | null; csr: string | null } = { co2: null, csr: null };

  protected readonly form = inject(FormBuilder).nonNullable.group({
    l1: ['', Validators.required],
    l2: ['', Validators.required],
    repairer: ['EUREXO'],
    mode: ['REN' as 'REN' | 'IP'],
    name: ['', Validators.required],
    roomId: [''],
    qty: ['', [Validators.required, decimal()]],
    um: [''],
    unit: ['', [Validators.required, decimal()]],
    vat: ['20', decimal(99.99)],
    age: ['', decimal()],
    obsPct: ['', decimal(100)],
    obsAmount: ['', decimal()],
    beneficiaryName: [''],
  });
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly ttc = computed(() => {
    const s = this.scope(),
      e = this.store.estimate();
    return !s || !e
      ? true
      : (e.calculations.find(
          (k) => k.thirdPartyId === s.thirdPartyId && (k.riskObjectId ?? null) === s.riskObjectId,
        )?.taxRegime ?? true);
  });
  private readonly benefits = computed(() => {
    const irsi = this.store.current()?.irsiEnabled ? 'true' : 'false';
    return this.store
      .refs()
      .benefits.filter((b) => b.l1 !== MBV && b.l1 !== RSE && (!b.rec || b.rec === irsi));
  });
  /** taux Sinapps, plus le taux actuel de la ligne s'il n'en fait pas partie (signalé à la vérification) */
  protected readonly vatOptions = computed(() => {
    const cur = this.value().vat ?? '';
    const list = LISTS.vat.map(String);
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  });
  protected readonly natures = computed(() => [...new Set(this.benefits().map((b) => b.l1))]);
  protected readonly details = computed(() =>
    this.benefits()
      .filter((b) => b.l1 === this.value().l1)
      .map((b) => b.l2),
  );
  protected readonly repairers = computed(() => this.store.refs().repairers.map((r) => r.name));
  protected readonly offers = computed(() => {
    const v = this.value();
    return this.store
      .refs()
      .prices.filter((p) => p.repairer === v.repairer && p.l1 === v.l1 && p.l2 === v.l2);
  });
  protected readonly rooms = computed(() => this.store.current()?.rooms ?? []);
  protected readonly beneficiaries = computed(() => {
    const c = this.store.current();
    if (!c) return [];
    const ins = c.thirdParties.find((t) => t.insured);
    return [
      ...(ins ? ['Ass. - ' + ins.name] : []),
      ...c.linkedParties.map((l) => (LISTS.linkedPrefix[l.type] ?? '') + l.lastName),
    ];
  });
  private readonly rule = computed(() =>
    findRule(this.store.refs().obsolescence ?? [], this.value().l1 ?? '', this.value().l2 ?? ''),
  );
  protected readonly ruleText = computed(() => {
    const r = this.rule();
    return r
      ? `Barème : ${pct(r.ratePerYear)} % par an${r.franchiseYears ? ` après ${fmtQty(r.franchiseYears)} an(s)` : ''}, plafonné à ${pct(r.maxPct)} %`
      : 'Aucun barème pour ce détail';
  });
  protected readonly preview = computed(() => {
    const v = this.value();
    return damageAmounts(
      {
        l1: v.l1 ?? '',
        qty: parseNum(v.qty) ?? null,
        unit: parseNum(v.unit) ?? null,
        vat: parseNum(v.vat) ?? null,
        obsPct: parseNum(v.obsPct) ?? null,
        obsAmountInput: parseNum(v.obsAmount) ?? null,
      },
      this.ttc(),
    );
  });
  protected readonly eco = computed(() => {
    this.value();
    const { csr, co2 } = this.meta;
    if (!csr) return null;
    const alt = this.store
      .refs()
      .prices.filter((p) => p.csr === csr && (p.co2 ?? 0) < (co2 ?? 0))
      .sort((a, b) => (a.co2 ?? 0) - (b.co2 ?? 0))[0];
    return alt ?? null;
  });

  open(scope: DamageScope, damage?: Damage): void {
    const tp = this.store.current()?.thirdParties.find((t) => t.id === scope.thirdPartyId);
    this.scope.set(scope);
    this.editing.set(damage ?? null);
    this.error.set('');
    this.meta = { co2: damage?.co2 ?? null, csr: damage?.csr ?? null };
    const amountEntered = !!damage && !damage.obsPct && damage.obsAmount > 0;
    this.form.reset({
      l1: damage?.l1 ?? '',
      l2: damage?.l2 ?? '',
      repairer: damage?.repairer ?? 'EUREXO',
      mode: damage?.mode ?? 'REN',
      name: damage?.name ?? '',
      roomId: damage?.roomId ?? '',
      qty: fmtQty(damage?.qty),
      um: damage?.um ?? '',
      unit: damage ? n2(damage.unit).replace(/\s/g, '') : '',
      vat: String(damage?.vat ?? tp?.vat ?? 20),
      age: fmtQty(damage?.age),
      obsPct: amountEntered ? '' : pct(damage?.obsPct),
      obsAmount: amountEntered ? n2(damage!.obsAmount).replace(/\s/g, '') : '',
      beneficiaryName: damage?.beneficiaryName ?? '',
    });
    this.dlg().nativeElement.showModal();
  }

  protected close(): void {
    this.dlg().nativeElement.close();
  }

  /** Prestation choisie dans le bordereau : prix de la zone du dossier, unité, CO2 */
  protected pickOffer(): void {
    const p = this.offers().find((o) => o.name === this.form.controls.name.value);
    const c = this.store.current();
    if (!p || !c) {
      this.meta = { co2: null, csr: null };
      return;
    }
    this.meta = { co2: p.co2 ?? null, csr: p.csr ?? null };
    this.form.patchValue({ unit: String(zonePrice(p, c)).replace('.', ','), um: p.unit });
  }
  protected useOffer(name: string): void {
    const p = this.store.refs().prices.find((x) => x.name === name);
    if (p) this.form.patchValue({ repairer: p.repairer });
    this.form.controls.name.setValue(name);
    this.pickOffer();
  }
  protected applyMeasure(key: string): void {
    const room = this.rooms().find((r) => r.id === this.form.controls.roomId.value);
    const m = MEASURES.find((x) => x.value === key);
    if (!room || !m) return;
    this.form.patchValue({ qty: fmtQty(roomMeasures(room)[m.value]), um: m.um });
  }
  protected applyScale(): void {
    const v = scaleObsolescence(this.rule(), parseNum(this.form.controls.age.value) ?? null);
    if (v !== null) this.form.patchValue({ obsPct: pct(v), obsAmount: '' });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(
        this.form.controls.qty.errors ||
          this.form.controls.unit.errors ||
          this.form.controls.vat.errors ||
          this.form.controls.obsPct.errors ||
          this.form.controls.obsAmount.errors
          ? 'Vérifiez les montants : nombres positifs, pourcentages entre 0 et 100.'
          : 'Nature, détail, prestation, quantité et prix unitaire sont obligatoires.',
      );
      return;
    }
    const v = this.form.getRawValue();
    const scope = this.scope()!;
    const editing = this.editing();
    const ok = this.store.update((c, e) => {
      getCalc(e, scope.thirdPartyId, scope.riskObjectId);
      return upsertDamage(
        c,
        e,
        this.store.refs(),
        scope,
        {
          l1: v.l1,
          l2: v.l2,
          name: v.name.trim(),
          repairer: v.repairer,
          mode: v.mode,
          qty: parseNum(v.qty) ?? 0,
          um: v.um,
          unit: parseNum(v.unit) ?? 0,
          vat: parseNum(v.vat) ?? 0,
          obsPct: parseNum(v.obsPct) ?? null,
          obsAmountInput: parseNum(v.obsAmount) ?? null,
          beneficiaryName: v.beneficiaryName,
          roomId: v.roomId || null,
          co2: this.meta.co2,
          csr: this.meta.csr,
          age: parseNum(v.age) ?? null,
        },
        editing?.id,
      );
    });
    if (ok) this.close();
  }
}
