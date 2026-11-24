/** Indemnisation (écran Compensations) : regroupement, ventilation, plafonds, totaux, contrôles. */
import { MBV, RSE } from './constants';
import { blank, num, r1, r2, roundDown2, sum } from './math';
import {
  Beneficiary,
  Calculation,
  CompensationEntry,
  CompensationGroup,
  ContractBase,
  Damage,
  Id,
} from './models';

/** Regroupe les dommages de l'assuré en lignes indemnisables, en reprenant les ventilations enregistrées. */
export function buildGroups(
  damages: readonly Damage[],
  calcById: Record<Id, Calculation>,
  comps: Record<string, CompensationEntry> | undefined,
): CompensationGroup[] {
  const map = new Map<string, CompensationGroup>();
  const sorted = damages
    .filter((d) => !blank(d.name))
    .sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
  for (const d of sorted) {
    const isMbv = d.l1 === MBV;
    const key = (
      isMbv
        ? [d.riskObjectId, d.l2, d.name]
        : [d.riskObjectId, d.l1, d.l2, d.mode, d.beneficiaryName ?? '']
    )
      .join('_')
      .trim();
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        riskObjectId: d.riskObjectId,
        isMbv,
        l1: isMbv ? d.l2 : d.l1,
        l2: isMbv ? d.name : d.l2,
        mode: d.mode,
        beneficiaryName: isMbv ? '' : (d.beneficiaryName ?? ''),
        isTaxed: !!calcById[d.calculationId]?.taxRegime,
        priceNoVATTotal: 0,
        priceWithTaxTotal: 0,
        obsTotal: 0,
        priceWithObsTotal: 0,
        beneficiaryId: null,
        ceiling: null,
        level1Ceiling: null,
        cPct: null,
        cAmt: null,
        immediate: 0,
        deferred: 0,
      };
      map.set(key, g);
    }
    g.priceNoVATTotal += num(d.priceNoVAT);
    g.priceWithTaxTotal += num(d.priceWithVAT);
    g.obsTotal += num(d.obsAmount);
    g.priceWithObsTotal += num(d.priceWithObs);
  }
  return [...map.values()].map((g) => {
    const c = comps?.[g.key];
    return {
      ...g,
      priceNoVATTotal: r2(g.priceNoVATTotal),
      priceWithTaxTotal: r2(g.priceWithTaxTotal),
      obsTotal: r2(g.obsTotal),
      priceWithObsTotal: r2(g.priceWithObsTotal),
      beneficiaryId: c?.beneficiaryId || null,
      ceiling: blank(c?.ceiling) ? null : c!.ceiling,
      level1Ceiling: blank(c?.level1Ceiling) ? null : c!.level1Ceiling,
      cPct: blank(c?.cPct) ? null : c!.cPct,
      cAmt: blank(c?.cAmt) ? null : c!.cAmt,
      immediate: num(c?.immediate),
      deferred: num(c?.deferred),
    };
  });
}

/** Montant des dommages de la ligne selon le régime fiscal */
export const gBase = (g: CompensationGroup): number =>
  g.isTaxed ? g.priceWithTaxTotal : g.priceNoVATTotal;
/** Assiette de la vétusté contractuelle */
const cBase = (g: CompensationGroup, option: ContractBase) =>
  option === 1 ? gBase(g) : g.priceWithObsTotal;
const isREN = (g: CompensationGroup) => g.mode === 'REN';
const noCeiling = (c: number | null) => blank(c) || c === 0;

/** Ramène immédiat + différé sous le plafond : l'immédiat d'abord, le différé prend le reste. */
function capToCeiling(g: CompensationGroup, ceiling: number | null): void {
  if (!blank(ceiling) && g.immediate + g.deferred > ceiling) {
    if (g.immediate > ceiling) {
      g.immediate = ceiling;
      g.deferred = 0;
    } else g.deferred = r2(ceiling - g.immediate);
  }
}

/** Ventilation d'une ligne vers un bénéficiaire (case cochée, chkSubNature.OnCheck) */
export function assignGroup(
  g: CompensationGroup,
  beneficiaryId: Id,
  genericPct: number | null,
  option: ContractBase,
) {
  const cAmt = r2((cBase(g, option) * num(genericPct)) / 100);
  const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
  g.beneficiaryId = beneficiaryId;
  g.cPct = blank(genericPct) ? null : genericPct;
  g.cAmt = cAmt;
  const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
  g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling!, imm));
  g.deferred = r2(isREN(g) ? 0 : recoverable);
  capToCeiling(g, g.ceiling);
  return g;
}

export function unassignGroup(g: CompensationGroup) {
  g.beneficiaryId = null;
  g.immediate = 0;
  g.deferred = 0;
  return g;
}

/** Saisie du % de vétusté contractuelle récupérable sur une ligne */
export function setContractPct(g: CompensationGroup, pct: number, option: ContractBase) {
  const p = r1(pct);
  const cAmt = r2((cBase(g, option) * p) / 100);
  const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
  g.cPct = p;
  g.cAmt = cAmt;
  g.deferred = r2(isREN(g) ? 0 : recoverable);
  g.immediate = r2(isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal);
  capToCeiling(g, g.ceiling);
  return g;
}

/** Saisie du montant de vétusté contractuelle récupérable */
export function setContractAmount(g: CompensationGroup, amount: number, option: ContractBase) {
  const base = cBase(g, option);
  g.cAmt = amount;
  if (g.priceWithTaxTotal > 0 && base > 0) g.cPct = r1((100 * amount) / base);
  g.deferred = r2(isREN(g) ? 0 : Math.min(g.obsTotal, amount));
  if (isREN(g)) g.immediate = r2(g.priceWithObsTotal + Math.min(g.obsTotal, amount));
  capToCeiling(g, g.ceiling);
  return g;
}

/** Saisie du plafond d'une ligne (null = pas de plafond) */
export function setCeiling(
  g: CompensationGroup,
  ceiling: number | null,
  genericPct: number | null,
  option: ContractBase,
) {
  const cAmt = r2((cBase(g, option) * num(genericPct)) / 100);
  const recoverable = Math.min(g.obsTotal, cAmt);
  g.ceiling = blank(ceiling) ? null : ceiling;
  g.deferred = r2(isREN(g) ? 0 : recoverable);
  const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
  g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling!, imm));
  capToCeiling(g, g.ceiling);
  return g;
}

/** Plafond d'une nature : réparti au prorata entre les lignes du bénéficiaire, arrondi à l'inférieur. */
export function setLevel1Ceiling(
  groups: CompensationGroup[],
  l1: string,
  beneficiaryId: Id,
  value: number | null,
  option: ContractBase,
) {
  const lines = groups.filter((g) => g.l1 === l1 && g.beneficiaryId === beneficiaryId);
  const lineMax = (g: CompensationGroup) =>
    Math.min(
      gBase(g),
      blank(g.ceiling) ? gBase(g) : g.ceiling,
      g.priceWithObsTotal + r2((cBase(g, option) * num(g.cPct)) / 100),
    );
  const total = sum(lines, lineMax);
  for (const g of lines) {
    g.level1Ceiling = blank(value) ? null : value;
    if (!(total > 0)) continue;
    const cAmt = r2((cBase(g, option) * num(g.cPct)) / 100);
    const recoverable = Math.min(g.obsTotal, cAmt);
    const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
    g.deferred = r2(isREN(g) ? 0 : recoverable);
    if (blank(value)) {
      // plafond de nature retiré : retour aux montants de la ligne
      g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling!, imm));
      capToCeiling(g, g.ceiling);
      continue;
    }
    const share = roundDown2(value * (lineMax(g) / total));
    g.immediate = r2(
      noCeiling(g.ceiling) ? Math.min(imm, share) : Math.min(g.ceiling!, imm, share),
    );
    capToCeiling(g, share);
  }
  return groups;
}

/** Application d'un % de vétusté contractuelle à toutes les lignes du bénéficiaire (popup MACSF) */
export function applyGenericPct(
  groups: CompensationGroup[],
  beneficiaryId: Id,
  genericPct: number | null,
  option: ContractBase,
) {
  for (const g of groups.filter((x) => x.beneficiaryId === beneficiaryId)) {
    const pct = blank(genericPct) ? g.cPct : genericPct;
    const cAmt = r2((cBase(g, option) * num(pct)) / 100);
    const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
    g.cPct = pct;
    g.cAmt = cAmt;
    g.deferred = r2(isREN(g) ? 0 : recoverable);
    // l'original reprend ObsolescenceAmountTotal pour une ligne REN sans plafond : aligné ici sur les autres formules
    const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.immediate;
    g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling!, imm));
    capToCeiling(g, g.ceiling);
  }
  return groups;
}

export const ceilingOverrun = (g: CompensationGroup): number =>
  blank(g.ceiling) ? 0 : Math.max(0, r2(gBase(g) - g.ceiling));
/** Vétusté non récupérable */
export const obsOverdraft = (g: CompensationGroup): number =>
  Math.max(0, r2(g.obsTotal - num(g.cAmt)));

export interface BeneficiaryTotals {
  damages: number;
  obs: number;
  contractObs: number;
  overdraft: number;
  ceilingOverrun: number;
  subImmediate: number;
  subDeferred: number;
  discountedImmediate: number;
  discountedDeferred: number;
  totalImmediate: number;
  totalDeferred: number;
}

/** Totaux d'un bénéficiaire : remise, pénalités, franchise, plancher à zéro */
export function beneficiaryTotals(
  groups: readonly CompensationGroup[],
  ben: Beneficiary,
): BeneficiaryTotals {
  const mine = groups.filter((g) => g.beneficiaryId === ben.id);
  const k = 1 - num(ben.discount) / 100;
  const subImmediate = sum(mine, (g) => g.immediate);
  const subDeferred = sum(mine, (g) => g.deferred);
  return {
    damages: r2(sum(mine, gBase)),
    obs: r2(sum(mine, (g) => g.obsTotal)),
    contractObs: r2(sum(mine, (g) => g.cAmt)),
    overdraft: r2(sum(mine, obsOverdraft)),
    ceilingOverrun: r2(sum(mine, ceilingOverrun)),
    subImmediate: r2(subImmediate),
    subDeferred: r2(subDeferred),
    discountedImmediate: r2(subImmediate * k),
    discountedDeferred: r2(subDeferred * k),
    totalImmediate: r2(Math.max(subImmediate * k - num(ben.penalization) - num(ben.deductible), 0)),
    totalDeferred: r2(
      Math.max(subDeferred * k - num(ben.deferredPenalization) - num(ben.deferredDeductible), 0),
    ),
  };
}

/** Contrôles de l'écran Indemnisations : premier message bloquant, ou chaîne vide */
export function compensationError(
  groups: readonly CompensationGroup[],
  beneficiaries: readonly Beneficiary[],
): string {
  if (beneficiaries.some((b) => blank(b.deductible) || blank(b.deferredDeductible)))
    return 'Les montants de franchise sont obligatoires, veuillez saisir 0 si non applicable';
  const assigned = groups.filter((g) => g.beneficiaryId);
  const overCeiling = assigned.some(
    (g) =>
      (!blank(g.level1Ceiling) &&
        r2(
          sum(
            assigned.filter((x) => x.l1 === g.l1 && x.beneficiaryId === g.beneficiaryId),
            (x) => x.immediate + x.deferred,
          ),
        ) > r2(g.level1Ceiling)) ||
      (!blank(g.ceiling) && r2(g.immediate + g.deferred) > r2(g.ceiling)),
  );
  if (overCeiling) return 'Le montant de certaines indemnités dépasse le plafond associé';
  if (
    beneficiaries.length &&
    assigned.some(
      (g) => g.l1 !== RSE && r2(g.immediate + g.deferred) > r2(gBase(g) - g.obsTotal + num(g.cAmt)),
    )
  )
    return 'Les indemnités ne doivent pas dépasser les dommages. Veuillez ajuster les montants.';
  return '';
}
