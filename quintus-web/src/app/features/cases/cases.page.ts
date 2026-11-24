import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Case, STATUS, r2, sum } from '../../domain';
import { LISTS } from '../../data/reference-data';
import { insured, newEstimate } from '../../state/case-ops';
import { CaseStore } from '../../state/case-store';
import { ToastService } from '../../state/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { download } from '../../shared/download';
import { today, uid } from '../../shared/format';
import { EurPipe, FrDatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-cases-page',
  imports: [ReactiveFormsModule, EurPipe, FrDatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <section class="head">
        <div>
          <h1>Dossiers</h1>
          <p class="muted">Chiffrage des dommages et calcul de l'indemnisation.</p>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" (click)="openNew()">Nouveau dossier</button>
          <label class="btn ghost" for="import-case"
            >Importer un dossier<input
              type="file"
              id="import-case"
              accept=".json,application/json"
              hidden
              (change)="importCase($event)"
          /></label>
        </div>
      </section>

      @if (cards().length) {
        <div class="cases">
          @for (card of cards(); track card.c.id) {
            <article class="case-card">
              <button class="case-open" type="button" (click)="open(card.c)">
                <span class="case-num"
                  >{{ card.c.number || 'Sans numéro' }}
                  @if (card.c.demo) {
                    <span class="pill s-bro">Exemple</span>
                  }
                </span>
                <span class="muted"
                  >{{ card.c.type }} · sinistre du {{ (card.c.eventDate | frDate) || '?' }}</span
                >
                <span>{{ card.insuredName }}</span>
                <span class="case-amt">
                  @if (card.status) {
                    {{ card.ttc | eur }} TTC <span class="pill">{{ card.status }}</span>
                  } @else {
                    Aucune estimation
                  }
                </span>
              </button>
              <div class="row-actions">
                <button class="btn sm ghost" type="button" (click)="exportCase(card.c)">
                  Exporter JSON
                </button>
                <button class="btn sm ghost danger-t" type="button" (click)="remove(card.c)">
                  Supprimer
                </button>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="empty">
          <p>
            Aucun dossier. Créez-en un, ou chargez le dossier d'exemple pour parcourir les étapes.
          </p>
          <button class="btn" type="button" (click)="demo()">Charger le dossier d'exemple</button>
        </div>
      }
      @if (cards().length && !hasDemo()) {
        <p>
          <button class="link" type="button" (click)="demo()">Charger le dossier d'exemple</button>
        </p>
      }
    </main>

    <dialog #newDlg>
      <form [formGroup]="form" (ngSubmit)="create()">
        <div class="dlg-body">
          <h3>Nouveau dossier</h3>
          <div class="grid">
            <div class="fld">
              <label for="n-number">N° de mission <span class="req">*</span></label
              ><input id="n-number" formControlName="number" />
            </div>
            <div class="fld">
              <label for="n-type">Type de sinistre</label>
              <select id="n-type" formControlName="type">
                <option value="">—</option>
                @for (t of lists.caseTypes; track t) {
                  <option [value]="t">{{ t }}</option>
                }
              </select>
            </div>
            <div class="fld">
              <label for="n-date">Date du sinistre</label
              ><input id="n-date" type="date" formControlName="eventDate" />
            </div>
            <div class="fld">
              <label for="n-insured">Nom de l'assuré <span class="req">*</span></label
              ><input id="n-insured" formControlName="insuredName" />
            </div>
            <div class="fld wide">
              <label for="n-address">Adresse du sinistre</label
              ><input id="n-address" formControlName="address" />
            </div>
            <div class="fld">
              <label for="n-cp">Code postal</label><input id="n-cp" formControlName="postalCode" />
            </div>
            <div class="fld">
              <label for="n-city">Ville</label><input id="n-city" formControlName="city" />
            </div>
          </div>
          @if (form.touched && form.invalid) {
            <p class="form-err">Le n° de mission et le nom de l'assuré sont obligatoires.</p>
          }
        </div>
        <div class="dlg-foot">
          <button class="btn ghost" type="button" (click)="newDlg.close()">Annuler</button>
          <button class="btn primary" type="submit">Créer le dossier</button>
        </div>
      </form>
    </dialog>
    <app-confirm-dialog />
  `,
})
export class CasesPage {
  private readonly store = inject(CaseStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = viewChild.required(ConfirmDialog);
  private readonly newDlg = viewChild.required<ElementRef<HTMLDialogElement>>('newDlg');
  protected readonly lists = LISTS;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    number: ['', Validators.required],
    type: [''],
    eventDate: [today()],
    insuredName: ['', Validators.required],
    address: [''],
    postalCode: [''],
    city: [''],
  });

  protected readonly cards = computed(() =>
    this.store.cases().map((c) => {
      const e = c.estimates.find((x) => x.id === c.referenceEstimateId) ?? c.estimates[0];
      return {
        c,
        insuredName: insured(c)?.name ?? 'Assuré non renseigné',
        ttc: e ? r2(sum(e.damages, (d) => d.priceWithVAT)) : 0,
        status: e ? STATUS[e.status].label : null,
      };
    }),
  );
  protected readonly hasDemo = computed(() => this.store.cases().some((c) => c.demo));

  protected open(c: Case): void {
    void this.router.navigate(['/dossiers', c.id]);
  }

  protected openNew(): void {
    this.form.reset({ eventDate: today() });
    this.newDlg().nativeElement.showModal();
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const c: Case = {
      id: uid(),
      number: v.number.trim(),
      type: v.type,
      eventDate: v.eventDate,
      address: [v.address, v.postalCode, v.city].filter(Boolean).join(' '),
      department: v.postalCode.slice(0, 2),
      zone: 1,
      irsiEnabled: false,
      comments: '',
      expert: '',
      thirdParties: [
        {
          id: uid(),
          name: v.insuredName.trim(),
          insured: true,
          role: 'Lésé',
          type: '',
          insurance: '',
          contract: '',
          vat: 20,
          ceiling: null,
        },
      ],
      riskObjects: v.address
        ? [
            {
              id: uid(),
              riskType: 'Habitation',
              address1: v.address,
              postalCode: v.postalCode,
              city: v.city,
            },
          ]
        : [],
      coverages: [],
      linkedParties: [],
      rooms: [],
      estimates: [],
    };
    const e = newEstimate(c);
    c.estimates.push(e);
    c.referenceEstimateId = e.id;
    await this.store.add(c);
    this.newDlg().nativeElement.close();
    void this.router.navigate(['/dossiers', c.id, 'infos']);
  }

  protected async demo(): Promise<void> {
    const id = await this.store.loadDemo();
    void this.router.navigate(['/dossiers', id, 'dommages']);
  }

  protected exportCase(c: Case): void {
    download(
      `dossier-${(c.number || 'sans-numero').replace(/[^\w-]+/g, '_')}.json`,
      JSON.stringify({ format: 'eureka-chiffrage-case', case: c }, null, 1),
    );
  }

  /** Accepte aussi les exports du prototype web (même format) */
  protected async importCase(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const c = (json.case ?? json) as Case;
      if (!Array.isArray(c?.estimates) || !Array.isArray(c?.thirdParties))
        throw new Error('format');
      if (this.store.cases().some((x) => x.id === c.id)) c.id = uid();
      delete c.demo;
      await this.store.add(c);
      this.toast.show('Dossier importé');
    } catch {
      this.toast.show("Ce fichier n'est pas un dossier Eureka Chiffrage exporté.", true);
    }
  }

  protected async remove(c: Case): Promise<void> {
    if (
      await this.confirm().ask(
        `Supprimer définitivement le dossier ${c.number || ''} et ses estimations ?`,
      )
    )
      await this.store.remove(c.id);
  }
}
