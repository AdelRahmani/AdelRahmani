/**
 * Accès aux données. Les écrans ne connaissent que ces deux contrats : l'implémentation
 * (navigateur, Dataverse, API) se choisit dans app.config.ts.
 */
import { Case, Id, Referentials } from '../domain';

export abstract class CaseRepository {
  abstract list(): Promise<Case[]>;
  abstract save(item: Case): Promise<void>;
  abstract remove(id: Id): Promise<void>;
}

export abstract class ReferentialRepository {
  abstract load(): Promise<Referentials>;
  abstract save(refs: Referentials): Promise<void>;
}
