import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { STATUS } from '../../domain';
import { duplicateEstimate } from '../../state/case-ops';
import { CaseStore } from '../../state/case-store';
import { ToastService } from '../../state/toast.service';
import { CASE_STEPS } from './steps';

@Component({
  selector: 'app-case-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.current(); as c) {
      <nav class="steps-bar" aria-label="Étapes du dossier">
        <div class="wrap steps">
          @for (s of steps; track s.path; let i = $index) {
            <a class="step" [routerLink]="s.path" routerLinkActive="on" ariaCurrentWhenActive="page"
              ><i>{{ i + 1 }}</i
              >{{ s.label }}</a
            >
          }
        </div>
      </nav>
      <main class="wrap">
        @if (step()?.perEstimate && store.estimate(); as e) {
          <div class="estbar">
            <label for="est-sel">Estimation</label>
            <select id="est-sel" [value]="e.id" (change)="selectEstimate($event)">
              @for (x of c.estimates; track x.id) {
                <option [value]="x.id" [selected]="x.id === e.id">
                  {{ x.name }}{{ x.id === c.referenceEstimateId ? ' (référence)' : '' }}
                </option>
              }
            </select>
            <span class="pill">{{ status(e.status) }}</span>
            @if (store.readOnly()) {
              <span class="lock"
                >Estimation verrouillée : dupliquez-la pour la modifier.
                <button class="link" type="button" (click)="duplicate(e.id)">
                  Dupliquer
                </button></span
              >
            }
          </div>
        }
        <router-outlet />
        <nav class="pager">
          @if (prev(); as p) {
            <a class="btn ghost" [routerLink]="p.path">← {{ p.label }}</a>
          } @else {
            <span></span>
          }
          @if (next(); as n) {
            <a class="btn primary" [routerLink]="n.path">Étape suivante : {{ n.label }} →</a>
          }
        </nav>
      </main>
    }
  `,
  styles: `
    .steps-bar {
      background: var(--surface);
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 49px;
      z-index: 4;
    }
    .steps {
      padding-top: 6px;
    }
    a.btn {
      text-decoration: none;
    }
    @media (max-width: 860px) {
      .steps-bar {
        position: static;
      }
    }
  `,
})
export class CaseLayout {
  protected readonly store = inject(CaseStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  readonly id = input.required<string>();
  protected readonly steps = CASE_STEPS;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly step = computed(() => {
    const path = this.url().split('?')[0].split('/').pop();
    return CASE_STEPS.find((s) => s.path === path);
  });
  private readonly index = computed(() => CASE_STEPS.findIndex((s) => s === this.step()));
  protected readonly prev = computed(() => CASE_STEPS[this.index() - 1]);
  protected readonly next = computed(() =>
    this.index() >= 0 ? CASE_STEPS[this.index() + 1] : undefined,
  );

  constructor() {
    effect(() => {
      if (!this.store.open(this.id())) void this.router.navigate(['/dossiers']);
    });
  }

  protected status = (s: number) => STATUS[s].label;

  protected selectEstimate(ev: Event): void {
    this.store.estimateId.set((ev.target as HTMLSelectElement).value);
  }

  protected duplicate(id: string): void {
    let name = '';
    this.store.update((c) => {
      const copy = duplicateEstimate(c, id);
      name = copy.name;
      this.store.estimateId.set(copy.id);
    });
    this.toast.show(`${name} créée en brouillon`);
  }
}
