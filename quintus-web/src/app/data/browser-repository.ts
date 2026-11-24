/** Stockage dans le navigateur (localStorage) : développement, démonstration, poste isolé. */
import { Injectable } from '@angular/core';
import { Case, Id, Referentials } from '../domain';
import { CaseRepository, ReferentialRepository } from './case-repository';
import { newEstimate } from '../state/case-ops';
import { today, uid } from '../shared/format';
import { SAMPLE_REFERENTIALS } from './reference-data';

const CASES_KEY = 'quintus-web/cases/v1';
const REFS_KEY = 'quintus-web/refs/v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

@Injectable()
export class BrowserCaseRepository extends CaseRepository {
  async list(): Promise<Case[]> {
    return read<Case[]>(CASES_KEY, []);
  }
  async save(item: Case): Promise<void> {
    const all = read<Case[]>(CASES_KEY, []);
    const i = all.findIndex((c) => c.id === item.id);
    if (i >= 0) all[i] = item;
    else all.unshift(item);
    write(CASES_KEY, all);
  }
  async remove(id: Id): Promise<void> {
    write(
      CASES_KEY,
      read<Case[]>(CASES_KEY, []).filter((c) => c.id !== id),
    );
  }

  /** Sans Eureka : retrouve le dossier par son n° de mission, ou crée un dossier vide à compléter */
  async openAssignment(assignmentNumber: string): Promise<Case> {
    const existing = read<Case[]>(CASES_KEY, []).find((c) => c.number === assignmentNumber);
    if (existing) return existing;
    const c: Case = {
      id: uid(),
      number: assignmentNumber,
      type: '',
      eventDate: today(),
      address: '',
      department: '',
      zone: 1,
      irsiEnabled: false,
      comments: '',
      expert: '',
      thirdParties: [
        {
          id: uid(),
          name: 'Assuré à renseigner',
          insured: true,
          role: 'Lésé',
          type: '',
          insurance: '',
          contract: '',
          vat: 20,
          ceiling: null,
        },
      ],
      riskObjects: [],
      coverages: [],
      linkedParties: [],
      rooms: [],
      estimates: [],
    };
    const e = newEstimate(c);
    c.estimates.push(e);
    c.referenceEstimateId = e.id;
    await this.save(c);
    return c;
  }
}

@Injectable()
export class BrowserReferentialRepository extends ReferentialRepository {
  async load(): Promise<Referentials> {
    return read<Referentials>(REFS_KEY, structuredClone(SAMPLE_REFERENTIALS));
  }
  async save(refs: Referentials): Promise<void> {
    write(REFS_KEY, refs);
  }
}
