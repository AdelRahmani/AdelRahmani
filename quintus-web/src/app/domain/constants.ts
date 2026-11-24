import { StanceValue } from './models';

export const MBV = 'Dommages mobiliers et biens volés';
export const RSE = 'Bonification RSE';
/** Ouvertures déduites des plinthes */
export const OPENING_TYPES = ['Porte', 'Porte fenêtre', 'Baie coulissante'];

export type StatusCategory = 'Brouillon' | 'Vérifiée' | 'Exportée' | 'Communiquée' | 'Figée';

/** ava_estimateinformationstatuses */
export const STATUS: Record<number, { label: string; category: StatusCategory }> = {
  1: { label: 'Brouillon', category: 'Brouillon' },
  2: { label: 'Chiffrages vérifiés', category: 'Vérifiée' },
  3: { label: 'Garanties vérifiées', category: 'Vérifiée' },
  4: { label: 'Chiffrages et garanties vérifiés', category: 'Vérifiée' },
  5: { label: 'Indemnisations vérifiées', category: 'Vérifiée' },
  6: { label: 'Chiffrages exportés vers Excel', category: 'Exportée' },
  7: { label: 'Garanties exportées vers Excel', category: 'Exportée' },
  8: { label: 'Chiffrages et garanties exportés vers Excel', category: 'Exportée' },
  9: { label: 'Indemnisations exportées vers Excel', category: 'Exportée' },
  10: { label: "Chiffrages communiqués à l'assureur", category: 'Communiquée' },
  11: { label: "Garanties communiquées à l'assureur", category: 'Communiquée' },
  12: { label: "Chiffrages et garanties communiqués à l'assureur", category: 'Communiquée' },
  13: { label: "Indemnisations communiquées à l'assureur", category: 'Communiquée' },
  14: { label: 'Chiffrages figés', category: 'Figée' },
  15: { label: 'Garanties figées', category: 'Figée' },
  16: { label: 'Chiffrages et garanties figés', category: 'Figée' },
  17: { label: 'Indemnisations figées', category: 'Figée' },
};

/** ReadOnlyEstimateInformationStatuses : exportée, communiquée ou figée */
export const isReadOnly = (status: number): boolean => status >= 6;

export const STANCES: Record<StanceValue, { label: string; compensable: boolean }> = {
  1: { label: 'Sans réserve', compensable: true },
  2: { label: 'Avec réserve', compensable: true },
  3: { label: 'Garantie non applicable', compensable: false },
};
