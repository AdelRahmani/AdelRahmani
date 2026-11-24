import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Case } from '../../domain';
import { LISTS } from '../../data/reference-data';
import { CaseStore } from '../../state/case-store';

type TextField = 'number' | 'type' | 'eventDate' | 'expert' | 'address' | 'department' | 'comments';

@Component({
  selector: 'app-infos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.current(); as c) {
      <section class="head">
        <div><h1>Informations générales</h1></div>
      </section>
      <div class="panel">
        <div class="grid">
          <div class="fld">
            <label for="ci-number">N° de mission</label
            ><input
              id="ci-number"
              [value]="c.number"
              (change)="set('number', $event)"
              placeholder="27FP…"
            />
          </div>
          <div class="fld">
            <label for="ci-type">Type de sinistre</label>
            <select id="ci-type" (change)="set('type', $event)">
              <option value="">—</option>
              @for (t of lists.caseTypes; track t) {
                <option [value]="t" [selected]="t === c.type">{{ t }}</option>
              }
            </select>
          </div>
          <div class="fld">
            <label for="ci-date">Date du sinistre</label
            ><input
              id="ci-date"
              type="date"
              [value]="c.eventDate"
              (change)="set('eventDate', $event)"
            />
          </div>
          <div class="fld">
            <label for="ci-expert">Expert</label
            ><input id="ci-expert" [value]="c.expert" (change)="set('expert', $event)" />
          </div>
          <div class="fld wide">
            <label for="ci-address">Adresse du sinistre</label
            ><input id="ci-address" [value]="c.address" (change)="set('address', $event)" />
          </div>
          <div class="fld">
            <label for="ci-dep">Département</label
            ><input
              id="ci-dep"
              maxlength="3"
              [value]="c.department"
              (change)="set('department', $event)"
            />
          </div>
          <div class="fld">
            <label for="ci-zone">Zone tarifaire du bordereau</label>
            <select id="ci-zone" (change)="setZone($event)">
              @for (z of [1, 2, 3, 4, 5]; track z) {
                <option [value]="z" [selected]="z === c.zone">{{ z }}</option>
              }
            </select>
          </div>
          <div class="fld">
            <label>Convention IRSI</label>
            <span class="seg" role="group"
              ><button type="button" [class.on]="!c.irsiEnabled" (click)="setIrsi(false)">
                non</button
              ><button type="button" [class.on]="c.irsiEnabled" (click)="setIrsi(true)">
                oui
              </button></span
            >
          </div>
          <div class="fld wide">
            <label for="ci-comments">Commentaires</label
            ><textarea
              id="ci-comments"
              rows="3"
              [value]="c.comments"
              (change)="set('comments', $event)"
            ></textarea>
          </div>
        </div>
      </div>
    }
  `,
})
export class InfosPage {
  protected readonly store = inject(CaseStore);
  protected readonly lists = LISTS;

  protected set(field: TextField, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.store.update((c: Case) => void (c[field] = value));
  }
  protected setZone(ev: Event): void {
    const zone = +(ev.target as HTMLSelectElement).value;
    this.store.update((c) => void (c.zone = zone));
  }
  protected setIrsi(on: boolean): void {
    this.store.update((c) => void (c.irsiEnabled = on));
  }
}
