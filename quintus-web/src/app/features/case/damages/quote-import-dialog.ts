import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  Id,
  MBV,
  QuoteDocument,
  RSE,
  guessNature,
  isSinappsVat,
  parseQuoteText,
  r2,
} from '../../../domain';
import { LISTS } from '../../../data/reference-data';
import { getCalc, upsertDamage } from '../../../state/case-ops';
import { CaseStore } from '../../../state/case-store';
import { ToastService } from '../../../state/toast.service';
import { n2, parseNum, pct, qty as fmtQty } from '../../../shared/format';
import { readPdfText } from '../../../shared/pdf-text';
import { EurPipe } from '../../../shared/pipes';

export interface ImportScope {
  thirdPartyId: Id;
  riskObjectId: Id | null;
  label: string;
  /** TVA par défaut du tiers */
  vat: number;
}

/** Ligne du document, modifiable avant intégration (valeurs saisies telles quelles) */
interface Row {
  keep: boolean;
  name: string;
  qty: string;
  unit: string;
  unitPrice: string;
  vat: string;
  /** "Nature›Détail", vide = nature par défaut */
  nature: string;
  check: boolean;
}

const SEP = '›';

/**
 * Import d'un devis ou d'une facture, sans IA : le document est lu dans le navigateur
 * (PDF texte, fichier texte ou CSV, texte collé), puis l'expert contrôle les lignes avant de les intégrer.
 */
@Component({
  selector: 'app-quote-import-dialog',
  imports: [EurPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg [class.wide]="doc()">
      @if (!doc()) {
        <div class="dlg-body">
          <h3>Importer un devis ou une facture</h3>
          <p class="muted">
            Les lignes chiffrées sont repérées, vous les contrôlez, puis elles rejoignent les
            prestations de {{ scope()?.label }}.
          </p>
          <div class="fld">
            <label for="qi-file">Document : PDF, fichier texte ou CSV</label>
            <input
              type="file"
              id="qi-file"
              #file
              accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
            />
          </div>
          <div class="fld">
            <label for="qi-text">Ou collez ici le texte du document</label>
            <textarea
              id="qi-text"
              #paste
              rows="6"
              placeholder="Désignation   Qté   U   P.U. HT   TVA   Total HT"
            ></textarea>
          </div>
          <p class="muted">
            La lecture se fait dans ce navigateur : le document n'est envoyé nulle part.
          </p>
          @if (status()) {
            <p [class.form-err]="!busy()" [class.muted]="busy()" role="status">{{ status() }}</p>
          }
        </div>
        <div class="dlg-foot">
          <button class="btn ghost" type="button" (click)="close()">Annuler</button>
          <button class="btn primary" type="button" [disabled]="busy()" (click)="read(file, paste)">
            Extraire les lignes
          </button>
        </div>
      } @else {
        <div class="dlg-body">
          <h3>Contrôler les lignes à intégrer</h3>
          <p class="muted">
            {{ source() }}{{ doc()!.date ? ' du ' + doc()!.date : '' }} · {{ fileLabel() }}
          </p>
          <p
            class="banner"
            [class.ok]="check().state === 'ok'"
            [class.warn]="check().state === 'gap'"
            [class.info]="check().state === 'unknown'"
            role="status"
          >
            {{ check().text }}
          </p>
          <div class="grid">
            <div class="fld">
              <label for="qi-nat">Nature par défaut</label>
              <select
                id="qi-nat"
                [value]="defaultNature()"
                (change)="defaultNature.set(val($event))"
              >
                <option value="">À choisir</option>
                @for (n of natures(); track n.value) {
                  <option [value]="n.value">{{ n.label }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="qi-mode">Mode d'indemnisation</label>
              <select id="qi-mode" (change)="mode.set($any(val($event)))">
                <option value="IP">IP · indemnité pécuniaire</option>
                <option value="REN">REN · réparation en nature</option>
              </select>
            </div>
            <div class="fld">
              <label for="qi-obs">Vétusté %</label
              ><input id="qi-obs" class="num" inputmode="decimal" (change)="obs.set(val($event))" />
            </div>
            <div class="fld">
              <label for="qi-room">Pièce</label>
              <select id="qi-room" (change)="room.set(val($event))">
                <option value="">—</option>
                @for (r of rooms(); track r.id) {
                  <option [value]="r.id">{{ r.name }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="qi-ben">Bénéficiaire</label>
              <select id="qi-ben" (change)="beneficiary.set(val($event))">
                <option value="">—</option>
                @for (b of beneficiaries(); track b) {
                  <option [value]="b">{{ b }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label class="inline"
                ><input
                  type="checkbox"
                  id="qi-claimed"
                  (change)="reportClaimed.set($any($event.target).checked)"
                />
                Reporter le total du document dans le montant réclamé</label
              >
            </div>
          </div>
          <div class="tw imp-tw">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Désignation</th>
                  <th class="r">Qté</th>
                  <th>Unité</th>
                  <th class="r">Prix unitaire HT €</th>
                  <th class="r">TVA %</th>
                  <th class="r">Montant HT €</th>
                  <th>Nature</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track $index; let i = $index) {
                  <tr [class.off]="!row.keep">
                    <td>
                      <input
                        type="checkbox"
                        [id]="'qi-keep-' + i"
                        [checked]="row.keep"
                        (change)="set(i, 'keep', $any($event.target).checked)"
                        aria-label="Retenir la ligne"
                      />
                    </td>
                    <td>
                      <input
                        class="qi-name"
                        [id]="'qi-name-' + i"
                        [value]="row.name"
                        (change)="set(i, 'name', val($event))"
                        aria-label="Désignation"
                      />
                      @if (row.check) {
                        <small class="warn-t">Quantité ou prix à vérifier</small>
                      }
                    </td>
                    <td>
                      <input
                        class="num xs"
                        [id]="'qi-qty-' + i"
                        inputmode="decimal"
                        [value]="row.qty"
                        (input)="set(i, 'qty', val($event))"
                        aria-label="Quantité"
                      />
                    </td>
                    <td>
                      <select
                        [id]="'qi-unit-' + i"
                        (change)="set(i, 'unit', val($event))"
                        aria-label="Unité"
                      >
                        <option value="" [selected]="!row.unit">—</option>
                        @for (u of lists.units; track u) {
                          <option [value]="u" [selected]="u === row.unit">{{ u }}</option>
                        }
                      </select>
                    </td>
                    <td>
                      <input
                        class="num"
                        [id]="'qi-pu-' + i"
                        inputmode="decimal"
                        [value]="row.unitPrice"
                        (input)="set(i, 'unitPrice', val($event))"
                        aria-label="Prix unitaire HT"
                      />
                    </td>
                    <td>
                      <input
                        class="num xs"
                        [id]="'qi-vat-' + i"
                        inputmode="decimal"
                        [value]="row.vat"
                        [placeholder]="defaultVat()"
                        (input)="set(i, 'vat', val($event))"
                        aria-label="TVA %"
                      />
                    </td>
                    <td class="r">{{ lineTotal(row) | eur }}</td>
                    <td>
                      <select
                        class="qi-nat"
                        [id]="'qi-nat-' + i"
                        (change)="set(i, 'nature', val($event))"
                        aria-label="Nature"
                      >
                        <option value="" [selected]="!row.nature">Nature par défaut</option>
                        @for (n of natures(); track n.value) {
                          <option [value]="n.value" [selected]="n.value === row.nature">
                            {{ n.label }}
                          </option>
                        }
                      </select>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (error()) {
            <p class="form-err" role="alert">{{ error() }}</p>
          }
        </div>
        <div class="dlg-foot">
          <button class="btn ghost" type="button" (click)="close()">Annuler</button>
          <button class="btn ghost" type="button" (click)="restart()">Autre document</button>
          <button
            class="btn primary"
            type="button"
            [disabled]="!kept().length"
            (click)="integrate()"
          >
            {{
              kept().length
                ? 'Intégrer ' +
                  kept().length +
                  ' ligne' +
                  (kept().length > 1 ? 's' : '') +
                  ' au chiffrage'
                : 'Aucune ligne retenue'
            }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog.wide {
      width: min(1120px, calc(100vw - 24px));
    }
    .imp-tw .qi-name {
      min-width: 300px;
    }
    .imp-tw select {
      min-width: 72px;
    }
    .imp-tw .qi-nat {
      min-width: 200px;
    }
  `,
})
export class QuoteImportDialog {
  private readonly store = inject(CaseStore);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly lists = LISTS;

  protected readonly scope = signal<ImportScope | null>(null);
  protected readonly doc = signal<QuoteDocument | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected readonly fileLabel = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly defaultNature = signal('');
  protected readonly mode = signal<'IP' | 'REN'>('IP');
  protected readonly obs = signal('');
  protected readonly room = signal('');
  protected readonly beneficiary = signal('');
  protected readonly reportClaimed = signal(false);

  private readonly benefits = computed(() => {
    const irsi = this.store.current()?.irsiEnabled ? 'true' : 'false';
    return this.store
      .refs()
      .benefits.filter((b) => b.l1 !== MBV && b.l1 !== RSE && (!b.rec || b.rec === irsi));
  });
  protected readonly natures = computed(() =>
    this.benefits().map((b) => ({ value: b.l1 + SEP + b.l2, label: `${b.l1} › ${b.l2}` })),
  );
  protected readonly rooms = computed(() => this.store.current()?.rooms ?? []);
  protected readonly beneficiaries = computed(() => {
    const c = this.store.current();
    const ins = c?.thirdParties.find((t) => t.insured);
    return [
      ...(ins ? ['Ass. - ' + ins.name] : []),
      ...(c?.linkedParties ?? []).map((l) => (LISTS.linkedPrefix[l.type] ?? '') + l.lastName),
    ];
  });
  protected readonly defaultVat = computed(() => pct(this.scope()?.vat ?? 20));
  protected readonly source = computed(() => {
    const d = this.doc();
    return d
      ? [
          d.kind === 'facture' ? 'Facture' : 'Devis',
          d.number ? 'n° ' + d.number : '',
          d.supplier ?? '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';
  });
  protected readonly kept = computed(() => this.rows().filter((r) => r.keep));
  /** Total des lignes retenues comparé au total HT du document */
  protected readonly check = computed(() => {
    const sum = r2(this.kept().reduce((a, r) => a + (this.lineTotal(r) ?? 0), 0));
    const n = this.kept().length,
      ht = this.doc()?.totals.ht ?? null;
    const head = `${n} ligne${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''} pour ${n2(sum)} € HT. `;
    if (ht === null)
      return {
        state: 'unknown',
        sum,
        text: head + "Le total HT du document n'a pas été repéré : comparez avec le document.",
      };
    if (Math.abs(sum - ht) < 0.015)
      return { state: 'ok', sum, text: head + 'Identique au total HT du document.' };
    return {
      state: 'gap',
      sum,
      text: head + `Le document annonce ${n2(ht)} € HT : écart de ${n2(r2(sum - ht))} €.`,
    };
  });

  open(scope: ImportScope): void {
    this.scope.set(scope);
    this.restart();
    this.dlg().nativeElement.showModal();
  }
  protected close(): void {
    this.dlg().nativeElement.close();
  }
  protected restart(): void {
    this.doc.set(null);
    this.rows.set([]);
    this.status.set('');
    this.error.set('');
    this.busy.set(false);
    this.defaultNature.set('');
    this.mode.set('IP');
    this.obs.set('');
    this.room.set('');
    this.beneficiary.set('');
    this.reportClaimed.set(false);
  }

  protected val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }
  protected set<K extends keyof Row>(i: number, key: K, value: Row[K]): void {
    this.rows.update((rows) => rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)));
  }
  protected lineTotal(r: Row): number | null {
    const q = parseNum(r.qty),
      pu = parseNum(r.unitPrice);
    return q && q > 0 && pu !== undefined && pu !== null && pu >= 0 ? r2(q * pu) : null;
  }

  protected async read(file: HTMLInputElement, paste: HTMLTextAreaElement): Promise<void> {
    const f = file.files?.[0];
    let text = paste.value.trim();
    if (!f && !text) return this.status.set('Choisissez un document ou collez son texte.');
    this.fileLabel.set(f ? f.name : 'texte collé');
    if (!text && f) {
      this.busy.set(true);
      this.status.set('Lecture du document…');
      try {
        text =
          /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)
            ? await readPdfText(f)
            : (await f.text()).trim();
      } catch {
        this.busy.set(false);
        return this.status.set(
          "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit d'un PDF ou d'un fichier texte, ou collez son texte.",
        );
      }
      this.busy.set(false);
      if (!text)
        return this.status.set(
          'Ce PDF est un scan : il ne contient pas de texte. Collez le texte du document à la place.',
        );
    }
    const d = parseQuoteText(text);
    if (!d.lines.length)
      return this.status.set(
        'Aucune ligne chiffrée reconnue. Vérifiez que chaque ligne porte une désignation et un montant.',
      );
    const refs = this.store.refs();
    this.rows.set(
      d.lines.map((l) => {
        const g = guessNature(l.name, this.benefits(), refs.prices);
        return {
          keep: true,
          name: l.name,
          qty: fmtQty(l.qty),
          unit: l.unit ?? '',
          unitPrice: n2(l.unitPrice),
          vat: l.vat === null ? '' : pct(l.vat),
          nature: g ? g.l1 + SEP + g.l2 : '',
          check: l.check,
        };
      }),
    );
    this.status.set('');
    this.doc.set(d);
  }

  protected integrate(): void {
    const scope = this.scope()!,
      d = this.doc()!;
    const obs = parseNum(this.obs());
    if (obs === undefined || (obs !== null && (obs < 0 || obs > 100)))
      return this.error.set('La vétusté doit être un pourcentage entre 0 et 100.');
    const lines: {
      name: string;
      q: number;
      pu: number;
      vat: number;
      l1: string;
      l2: string;
      um: string;
    }[] = [];
    for (const r of this.kept()) {
      const name = r.name.trim(),
        q = parseNum(r.qty),
        pu = parseNum(r.unitPrice),
        vat = parseNum(r.vat);
      const nature = r.nature || this.defaultNature();
      if (!name) return this.error.set("Une ligne retenue n'a pas de désignation.");
      if (!q || q <= 0)
        return this.error.set(`« ${name} » : la quantité doit être supérieure à 0.`);
      if (pu === undefined || pu === null || pu < 0)
        return this.error.set(`« ${name} » : le prix unitaire n'est pas valide.`);
      if (vat === undefined || (vat !== null && !isSinappsVat(vat)))
        return this.error.set(
          `« ${name} » : TVA à ${r.vat} % refusée par Sinapps (taux acceptés : 0, 2, 2,1, 4, 5,5, 7, 8,5, 10, 19,6 et 20 %).`,
        );
      if (!nature)
        return this.error.set('Choisissez une nature par défaut, ou une nature sur chaque ligne.');
      const [l1, l2] = nature.split(SEP);
      lines.push({ name, q, pu, vat: vat ?? scope.vat, l1, l2, um: r.unit });
    }
    const source = this.source(),
      claimed = this.reportClaimed() ? (d.totals.ttc ?? d.totals.ht ?? this.check().sum) : null;
    const ok = this.store.update((c, e) => {
      for (const x of lines) {
        const err = upsertDamage(c, e, this.store.refs(), scope, {
          l1: x.l1,
          l2: x.l2,
          name: x.name,
          repairer: 'Hors bordereau',
          mode: this.mode(),
          qty: x.q,
          um: x.um,
          unit: x.pu,
          vat: x.vat,
          obsPct: obs,
          obsAmountInput: null,
          beneficiaryName: this.beneficiary(),
          roomId: this.room() || null,
          source,
        });
        if (err) return `« ${x.name} » : ${err}`;
      }
      if (claimed !== null)
        getCalc(e, scope.thirdPartyId, scope.riskObjectId).claimedAmount = claimed;
      return null;
    });
    if (!ok) return;
    this.close();
    this.toast.show(
      `${lines.length} ligne${lines.length > 1 ? 's' : ''} intégrée${lines.length > 1 ? 's' : ''} au chiffrage`,
    );
  }
}
