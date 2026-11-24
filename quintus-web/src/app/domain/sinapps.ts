/**
 * Contrôles Sinapps sur un chiffrage, avant envoi (commande chiffrerDommages, spécification 8.1.0-rc.40).
 * Chaque contrôle cite la règle Sinapps qu'il anticipe : un chiffrage qui passe ici ne doit pas être
 * refusé par Sinapps pour ces raisons-là.
 */
import { MBV, RSE } from './constants';
import { blank, num, r2 } from './math';
import { Case, Estimate, Id, Referentials } from './models';

/** Taux de TVA acceptés (RG_CHIFFRAGE_EXP_0068) */
export const SINAPPS_VAT_RATES = [0, 2, 2.1, 4, 5.5, 7, 8.5, 10, 19.6, 20];

/** NatureDommagesChiffrage */
export const SINAPPS_NATURES = [
  'Immobilier',
  'Embellissement',
  'Jardin',
  'AmenagementExterieur',
  'CadreDeVie',
  'Piscine',
  'Valeur',
  'Marchandise',
  'AutresPrejudices',
  'SPAJacuzzis',
  'Diagnostic',
  'BonificationRSE',
];

/** TypeBien : catégories du mobilier */
export const SINAPPS_GOOD_TYPES = [
  'MobiliersCourantsMeublants',
  'ElectrodomestiquesBlanc',
  'ElectrodomestiquesBrun',
  'ElectrodomestiquesGris',
  'ElectrodomestiquesSpecifique',
  'Animaux',
  'Vegetaux',
  'VetementsChaussuresLinge',
  'InstrumentsMusique',
  'ObjetDeValeur',
  'ObjetPrecieux',
  'Bijoux',
  'Autres',
  'VehiculeTerrestreAMoteur',
  'VinsEtAlcools',
  'EffetsPersonnels',
];

export const isSinappsVat = (rate: number | null | undefined): boolean =>
  SINAPPS_VAT_RATES.some((r) => Math.abs(r - num(rate)) < 1e-9);

export interface SinappsIssue {
  /** règle Sinapps anticipée */
  rule: string;
  message: string;
  damageId?: Id;
}

export function sinappsIssues(c: Case, e: Estimate, refs: Referentials): SinappsIssue[] {
  const issues: SinappsIssue[] = [];
  const calcs = Object.fromEntries(e.calculations.map((k) => [k.id, k]));
  const insuredId = c.thirdParties.find((t) => t.insured)?.id;
  // la correspondance Sinapps n'est contrôlée que si le référentiel la porte
  const mapped = refs.benefits.some((b) => !blank(b.sinappsNature) || !blank(b.sinappsDetail));

  for (const d of e.damages) {
    const label = `« ${d.name || 'ligne sans désignation'} »`;
    const isGood = d.l1 === MBV;
    if (blank(d.l1) || blank(d.l2))
      issues.push({
        rule: 'DommageDetailParNature',
        damageId: d.id,
        message: `${label} : la nature et le détail sont obligatoires`,
      });
    else if (mapped && d.l1 !== RSE) {
      const b = refs.benefits.find((x) => x.l1 === d.l1 && x.l2 === d.l2);
      if (
        !b ||
        (isGood ? blank(b.sinappsDetail) : blank(b.sinappsNature) || blank(b.sinappsDetail))
      )
        issues.push({
          rule: 'RG_CHIFFRAGE_EXP_0030',
          damageId: d.id,
          message: `${label} : « ${d.l1} › ${d.l2} » n'a pas de correspondance Sinapps`,
        });
    }
    if (!isSinappsVat(d.vat))
      issues.push({
        rule: 'RG_CHIFFRAGE_EXP_0068',
        damageId: d.id,
        message: `${label} : TVA à ${String(d.vat).replace('.', ',')} % refusée par Sinapps (taux acceptés : 0, 2, 2,1, 4, 5,5, 7, 8,5, 10, 19,6 et 20 %)`,
      });
    if (num(d.obsPct) > 100)
      issues.push({
        rule: 'RG_CHIFFRAGE_EXP_0048',
        damageId: d.id,
        message: `${label} : le taux de vétusté dépasse 100 %`,
      });
    const calc = calcs[d.calculationId];
    const amount = calc?.taxRegime ? d.priceWithVAT : d.priceNoVAT;
    if (d.l1 !== RSE && r2(d.obsAmount) > r2(amount))
      issues.push({
        rule: isGood ? 'RG_CHIFFRAGE_EXP_0062' : 'RG_CHIFFRAGE_EXP_0004',
        damageId: d.id,
        message: `${label} : la vétusté dépasse le montant de la ligne`,
      });
    if (isGood && d.goodStatus === 'Bien volé' && blank(d.proof))
      issues.push({
        rule: 'RG_CHIFFRAGE_EXP_0058',
        damageId: d.id,
        message: `${label} : le justificatif est obligatoire pour un bien volé`,
      });
    if (d.thirdPartyId === insuredId && blank(d.riskObjectId))
      issues.push({
        rule: 'RG_CHIFFRAGE_EXP_0052',
        damageId: d.id,
        message: `${label} : l'objet de risque est obligatoire pour l'assuré`,
      });
  }

  // un même bénéficiaire (acteur) garde le même régime fiscal sur tous ses chiffrages
  const byParty = new Map<Id, Set<boolean>>();
  for (const k of e.calculations) {
    if (!e.damages.some((d) => d.calculationId === k.id)) continue;
    byParty.set(k.thirdPartyId, (byParty.get(k.thirdPartyId) ?? new Set()).add(k.taxRegime));
  }
  for (const [id, regimes] of byParty)
    if (regimes.size > 1) {
      const name = c.thirdParties.find((t) => t.id === id)?.name ?? 'Un tiers';
      issues.push({
        rule: 'RG_CHIFFRAGE_EXP_0051',
        message: `${name} : le régime fiscal (HT ou TTC) doit être le même sur tous ses objets de risque`,
      });
    }
  return issues;
}
