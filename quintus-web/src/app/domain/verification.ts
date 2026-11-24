/** Vérification d'une estimation (btnCheckCurrentEstimate_SMS) et assiette IRSI. */
import { blank, num, r2, sum } from './math';
import {
  Beneficiary,
  Calculation,
  CompensationGroup,
  Coverage,
  Damage,
  Id,
  Stance,
} from './models';

export interface VerifyContext {
  damages: readonly Damage[];
  /** prises de position renseignées */
  stances: readonly Stance[];
  beneficiaries: readonly Beneficiary[];
  groups: readonly CompensationGroup[];
  damageEstimate: number | null;
  position: string | null;
  /** le dossier porte des contrats (équivalent d'un dossier initié par ProsPecT) */
  hasCoverages: boolean;
  coverages: readonly Coverage[];
  riskObjectIds: readonly Id[];
}
export interface VerifyResult {
  /** nouveau statut, ou null si rien n'est vérifiable */
  status: number | null;
  errors: string[];
}

export function verifyEstimate(ctx: VerifyContext): VerifyResult {
  const {
    damages,
    stances,
    beneficiaries,
    groups,
    damageEstimate,
    position,
    hasCoverages,
    coverages,
    riskObjectIds,
  } = ctx;
  const hasDamages = damages.length > 0 || num(damageEstimate) > 0;
  const assigned = groups.filter((g) => g.beneficiaryId);
  const errors: string[] = [];
  let status: number | null = null;
  if (!beneficiaries.length || !assigned.length) {
    if ((hasDamages && !stances.length) || (hasDamages && !hasCoverages)) status = 2;
    else if (!hasDamages && stances.length && hasCoverages) status = 3;
    else if (hasDamages && stances.length && hasCoverages) status = 4;
  } else {
    // objets de risque couverts par une garantie applicable
    const applicable = new Set<Id | null>();
    for (const s of stances.filter((x) => x.stance === 1 || x.stance === 2)) {
      const cov = coverages.find((c) => c.id === s.coverageId);
      const covered = cov?.coveredRiskObjects?.length ? cov.coveredRiskObjects : riskObjectIds;
      covered.forEach((id) => applicable.add(id));
    }
    const allCompensated = groups
      .filter((g) => applicable.has(g.riskObjectId))
      .every((g) => g.beneficiaryId);
    if (!allCompensated)
      errors.push(
        "Tous les dommages couverts par une garantie applicable doivent être ventilés dans l'indemnisation",
      );
    if (blank(position))
      errors.push("Une position de l'assuré sur l'indemnisation doit être sélectionnée");
    if (allCompensated && !blank(position)) status = 5;
  }
  return { status, errors };
}

/** Assiette IRSI : montants IRSI des calculs actifs inclus dans l'assiette */
export function irsiBase(damages: readonly Damage[], calcById: Record<Id, Calculation>): number {
  return r2(
    sum(
      damages.filter((d) => {
        const c = calcById[d.calculationId];
        return c && c.includedInIRSI && c.active;
      }),
      (d) => d.irsiAmount,
    ),
  );
}

/** Un calcul est actif s'il porte un montant de dommages ou un montant réclamé */
export const calculationActive = (calc: Calculation, damages: readonly Damage[]): boolean =>
  sum(
    damages.filter((d) => d.calculationId === calc.id && num(d.priceWithVAT) > 0),
    (d) => d.priceWithVAT,
  ) > 0 || num(calc.claimedAmount) > 0;
