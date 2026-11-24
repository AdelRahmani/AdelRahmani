import { Type } from '@angular/core';

export interface CaseStep {
  path: string;
  label: string;
  /** écran qui dépend de l'estimation choisie */
  perEstimate: boolean;
  load: () => Promise<Type<unknown>>;
  /** fonctionnalités du prototype encore à porter sur cet écran */
  todo?: string[];
}

const todo = () => import('./todo.page').then((m) => m.TodoPage);

export const CASE_STEPS: CaseStep[] = [
  {
    path: 'infos',
    label: 'Infos générales',
    perEstimate: false,
    load: () => import('./infos.page').then((m) => m.InfosPage),
  },
  {
    path: 'parties',
    label: 'Parties prenantes',
    perEstimate: false,
    load: todo,
    todo: [
      'Assuré et tiers : rôle, qualité, assureur, contrat, TVA par défaut, plafond',
      'Objets de risque',
      'Contrats et garanties, objets de risque couverts',
      'Parties liées : réparateur agréé, délégation de paiement, centre de gestion',
    ],
  },
  {
    path: 'lieux',
    label: 'Localisations',
    perEstimate: false,
    load: todo,
    todo: [
      'Pièces : dimensions ou surface seule (nombre d’or)',
      'Ouvertures déduites des murs et des plinthes',
      'Mesures reprises en quantité dans les dommages (déjà dans le domaine : roomMeasures)',
    ],
  },
  {
    path: 'estimations',
    label: 'Estimations',
    perEstimate: false,
    load: () => import('./estimates.page').then((m) => m.EstimatesPage),
  },
  {
    path: 'dommages',
    label: 'Dommages',
    perEstimate: true,
    load: () => import('./damages/damages.page').then((m) => m.DamagesPage),
  },
  {
    path: 'garanties',
    label: 'Garanties',
    perEstimate: true,
    load: todo,
    todo: [
      'Prise de position par garantie : sans réserve, avec réserve, non applicable',
      'Commentaire obligatoire avec réserve ou non applicable',
      'Montant des dommages non couverts',
      'Retrait des bénéficiaires d’une garantie qui n’est plus applicable',
    ],
  },
  {
    path: 'beneficiaires',
    label: 'Bénéficiaires',
    perEstimate: true,
    load: todo,
    todo: [
      'Couple garantie applicable / bénéficiaire (assuré, réparateur agréé, délégation de paiement, centre de gestion, autre)',
      'Sans contrat : garantie choisie dans la liste',
      'Contrôle des doublons',
    ],
  },
  {
    path: 'indemnisations',
    label: 'Indemnisations',
    perEstimate: true,
    load: todo,
    todo: [
      'Ventilation des lignes par bénéficiaire, par ligne ou par nature (domaine porté : assignGroup, setLevel1Ceiling…)',
      'Vétusté contractuelle récupérable, assiette valeur à neuf ou vétusté déduite',
      'Plafonds par ligne et par nature',
      'Remise, pénalités, franchise, totaux immédiat et différé',
      'Contrôles bloquants (compensationError) et position de l’assuré',
    ],
  },
  {
    path: 'synthese',
    label: 'Synthèse',
    perEstimate: true,
    load: () => import('./synthesis.page').then((m) => m.SynthesisPage),
  },
];
