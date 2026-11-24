/**
 * État de l'application, en signaux. Chaque modification passe par update() : elle travaille sur une
 * copie du dossier, garde l'état précédent pour « Annuler », puis enregistre via le dépôt.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Case, Estimate, Id, Referentials, isReadOnly } from '../domain';
import { CaseRepository, ReferentialRepository } from '../data/case-repository';
import { SAMPLE_REFERENTIALS } from '../data/reference-data';
import { buildDemoCase } from '../data/demo-case';
import { newEstimate } from './case-ops';
import { ToastService } from './toast.service';

const UNDO_DEPTH = 30;

@Injectable({ providedIn: 'root' })
export class CaseStore {
  private readonly cases$ = inject(CaseRepository);
  private readonly refs$ = inject(ReferentialRepository);
  private readonly toast = inject(ToastService);

  readonly cases = signal<Case[]>([]);
  readonly refs = signal<Referentials>(structuredClone(SAMPLE_REFERENTIALS));
  readonly loaded = signal(false);
  readonly caseId = signal<Id | null>(null);
  readonly estimateId = signal<Id | null>(null);
  private readonly history = signal<Case[]>([]);

  readonly current = computed(() => this.cases().find((c) => c.id === this.caseId()) ?? null);
  readonly estimate = computed<Estimate | null>(() => {
    const c = this.current();
    if (!c) return null;
    return (
      c.estimates.find((e) => e.id === this.estimateId()) ??
      c.estimates.find((e) => e.id === c.referenceEstimateId) ??
      c.estimates[0] ??
      null
    );
  });
  readonly readOnly = computed(() => !!this.estimate() && isReadOnly(this.estimate()!.status));
  readonly canUndo = computed(() => this.history().some((h) => h.id === this.caseId()));

  async load(): Promise<void> {
    if (this.loaded()) return;
    const [cases, refs] = await Promise.all([this.cases$.list(), this.refs$.load()]);
    this.cases.set(cases);
    this.refs.set(refs);
    this.loaded.set(true);
  }

  open(id: Id): boolean {
    const c = this.cases().find((x) => x.id === id);
    if (!c) return false;
    if (this.caseId() !== id) {
      this.caseId.set(id);
      this.estimateId.set(null);
    }
    if (!c.estimates.length)
      this.update(
        (d) => {
          const e = newEstimate(d);
          d.estimates.push(e);
          d.referenceEstimateId = e.id;
        },
        { undoable: false },
      );
    return true;
  }

  /**
   * Applique une modification au dossier ouvert. fn reçoit une copie (et l'estimation courante de cette copie) ;
   * si elle renvoie un message, rien n'est enregistré et le message est affiché.
   */
  update(
    fn: (draft: Case, estimate: Estimate) => string | void | null,
    opts: { undoable?: boolean } = {},
  ): boolean {
    const before = this.current();
    if (!before) return false;
    const draft = structuredClone(before);
    const e = draft.estimates.find((x) => x.id === this.estimate()?.id) ?? draft.estimates[0];
    const error = fn(draft, e);
    if (error) {
      this.toast.show(error, true);
      return false;
    }
    if (opts.undoable !== false) this.history.update((h) => [...h, before].slice(-UNDO_DEPTH));
    this.replace(draft);
    return true;
  }

  undo(): void {
    const h = this.history();
    const i = h.map((x) => x.id).lastIndexOf(this.caseId() ?? '');
    if (i < 0) return;
    this.history.set(h.filter((_, k) => k !== i));
    this.replace(h[i]);
    this.toast.show('Dernière action annulée');
  }

  async add(c: Case): Promise<void> {
    this.cases.update((all) => [c, ...all.filter((x) => x.id !== c.id)]);
    await this.persist(c);
  }

  async remove(id: Id): Promise<void> {
    this.cases.update((all) => all.filter((x) => x.id !== id));
    this.history.update((h) => h.filter((x) => x.id !== id));
    await this.cases$.remove(id);
  }

  async loadDemo(): Promise<Id> {
    const existing = this.cases().find((c) => c.demo);
    if (existing) return existing.id;
    const demo = buildDemoCase(this.refs());
    await this.add(demo);
    return demo.id;
  }

  async saveRefs(refs: Referentials): Promise<void> {
    this.refs.set(refs);
    await this.refs$.save(refs);
  }

  private replace(c: Case): void {
    this.cases.update((all) => all.map((x) => (x.id === c.id ? c : x)));
    void this.persist(c);
  }

  private async persist(c: Case): Promise<void> {
    try {
      await this.cases$.save(c);
    } catch {
      this.toast.show(
        "L'enregistrement a échoué : vos dernières modifications ne sont pas sauvegardées.",
        true,
      );
    }
  }
}
