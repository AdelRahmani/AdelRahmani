/**
 * Accès aux données. Les écrans ne connaissent que ces deux contrats : l'implémentation
 * (navigateur, Dataverse, API) se choisit dans app.config.ts.
 */
import { Case, Id, Referentials } from '../domain';

export abstract class CaseRepository {
  abstract list(): Promise<Case[]>;
  abstract save(item: Case): Promise<void>;
  abstract remove(id: Id): Promise<void>;
  /**
   * Dossier de chiffrage d'une mission Eureka, créé s'il n'existe pas encore.
   * Côté serveur, c'est un seul appel : l'API Eureka crée le dossier et son estimation à partir
   * des données de la mission, en une transaction. Rejette AssignmentError si la mission est
   * introuvable ou si l'utilisateur n'y a pas accès.
   */
  abstract openAssignment(assignmentNumber: string): Promise<Case>;
}

export class AssignmentError extends Error {
  constructor(
    readonly reason: 'not-found' | 'forbidden' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

export abstract class ReferentialRepository {
  abstract load(): Promise<Referentials>;
  abstract save(refs: Referentials): Promise<void>;
}
