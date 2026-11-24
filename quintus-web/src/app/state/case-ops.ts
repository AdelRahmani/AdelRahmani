/**
 * Opérations sur un dossier : fonctions pures qui modifient un brouillon (copie) du dossier.
 * Le magasin d'état (CaseStore) les applique sur une copie, puis enregistre.
 */
import {
  Benefit,
  Calculation,
  Case,
  CompensationGroup,
  Damage,
  Estimate,
  Id,
  MBV,
  Price,
  Referentials,
  buildGroups,
  calculationActive,
  damageAmounts,
  irsiAmount,
  mbvAmounts,
  mbvIrsiAmount,
  nextLineIndex,
  num,
  r1,
  recalcOnTaxRegime,
  RSE,
} from '../domain';
import { uid } from '../shared/format';

export const insured = (c: Case) => c.thirdParties.find((t) => t.insured);
export const calcMap = (e: Estimate): Record<Id, Calculation> =>
  Object.fromEntries(e.calculations.map((k) => [k.id, k]));
export const benefitOf = (refs: Referentials, l1: string, l2: string): Benefit | undefined =>
  refs.benefits.find((b) => b.l1 === l1 && b.l2 === l2);
export const zonePrice = (p: Price, c: Case): number => p.prices[(c.zone || 1) - 1] ?? p.prices[0];

export function newEstimate(c: Case): Estimate {
  const last = c.estimates.reduce(
    (m, e) => Math.max(m, +(String(e.name).match(/\d+/) ?? [0])[0]),
    0,
  );
  return {
    id: uid(),
    name: 'Estimation ' + (last + 1),
    status: 1,
    statusDate: new Date().toISOString(),
    active: true,
    damageEstimate: null,
    position: null,
    irsiBase: null,
    calculations: [],
    damages: [],
    stances: [],
    beneficiaries: [],
    comps: {},
  };
}

export function riskObjectLabel(c: Case, id: Id | null): string {
  const r = c.riskObjects.find((x) => x.id === id);
  return r
    ? `${r.riskType} - ${r.address1}${r.city ? `, ${r.postalCode ?? ''} ${r.city}` : ''}`
    : 'Sans objet de risque';
}

/** Calcul d'un tiers (et d'un objet de risque pour l'assuré) dans l'estimation, créé au besoin */
export function getCalc(e: Estimate, thirdPartyId: Id, riskObjectId: Id | null): Calculation {
  let k = e.calculations.find(
    (x) => x.thirdPartyId === thirdPartyId && (x.riskObjectId ?? null) === (riskObjectId ?? null),
  );
  if (!k) {
    k = {
      id: uid(),
      thirdPartyId,
      riskObjectId: riskObjectId ?? null,
      taxRegime: true,
      claimedAmount: null,
      includedInIRSI: true,
      active: false,
    };
    e.calculations.push(k);
  }
  return k;
}

/** Toute modification repasse l'estimation en brouillon */
export function touch(e: Estimate, calc?: Calculation): void {
  if (e.status !== 1) e.statusDate = new Date().toISOString();
  e.status = 1;
  e.active = true;
  if (calc) calc.active = calculationActive(calc, e.damages);
}

export const scopeDamages = (
  e: Estimate,
  thirdPartyId: Id,
  insuredParty: boolean,
  riskObjectId: Id | null,
) =>
  e.damages.filter(
    (d) =>
      d.thirdPartyId === thirdPartyId &&
      (!insuredParty || (d.riskObjectId ?? null) === (riskObjectId ?? null)),
  );

export interface DamageDraft {
  l1: string;
  l2: string;
  name: string;
  repairer: string;
  mode: 'REN' | 'IP';
  qty: number;
  um: string;
  unit: number;
  vat: number;
  obsPct: number | null;
  obsAmountInput: number | null;
  beneficiaryName: string;
  roomId: Id | null;
  co2?: number | null;
  csr?: string | null;
  age?: number | null;
  source?: string;
}

/** Ajoute ou met à jour une prestation (hors mobilier) ; renvoie un message d'erreur ou null */
export function upsertDamage(
  c: Case,
  e: Estimate,
  refs: Referentials,
  scope: { thirdPartyId: Id; riskObjectId: Id | null },
  draft: DamageDraft,
  id?: Id,
): string | null {
  const calc = getCalc(e, scope.thirdPartyId, scope.riskObjectId);
  const a = damageAmounts(
    {
      l1: draft.l1,
      qty: draft.qty,
      unit: draft.unit,
      vat: draft.vat,
      obsPct: draft.obsPct,
      obsAmountInput: draft.obsAmountInput,
    },
    calc.taxRegime,
  );
  if (draft.l1 !== RSE && a.obsAmount > a.base)
    return 'La vétusté ne peut pas dépasser le montant de la prestation';
  const existing = id ? e.damages.find((d) => d.id === id) : undefined;
  const d: Damage =
    existing ??
    ({
      id: uid(),
      calculationId: calc.id,
      thirdPartyId: scope.thirdPartyId,
      riskObjectId: scope.riskObjectId,
    } as Damage);
  const moved = existing && (existing.l1 !== draft.l1 || existing.l2 !== draft.l2);
  Object.assign(d, {
    l1: draft.l1,
    l2: draft.l2,
    name: draft.name,
    repairer: draft.repairer,
    mode: draft.mode,
    qty: num(draft.qty),
    um: draft.um,
    unit: num(draft.unit),
    vat: num(draft.vat),
    obsPct: r1(a.obsPct),
    obsAmount: a.obsAmount,
    priceWithObs: a.priceWithObs,
    priceNoVAT: a.priceNoVAT,
    priceWithVAT: a.priceWithVAT,
    beneficiaryName: draft.beneficiaryName,
    roomId: draft.roomId,
    co2: draft.co2 ?? null,
    csr: draft.csr ?? null,
    age: draft.age ?? null,
    source: draft.source ?? existing?.source,
  });
  if (!existing || moved) {
    const siblings = e.damages.filter(
      (x) => x.calculationId === calc.id && x.l1 !== MBV && x.id !== d.id,
    );
    d.lineIndex = nextLineIndex(siblings, draft.l1, draft.l2);
  }
  d.irsiAmount = irsiAmount(benefitOf(refs, d.l1, d.l2), d);
  if (!existing) e.damages.push(d);
  touch(e, calc);
  return null;
}

/** Recalcule une ligne existante après saisie directe (quantité, prix, vétusté, TVA) */
export function patchDamage(
  e: Estimate,
  refs: Referentials,
  id: Id,
  patch: Partial<Pick<Damage, 'qty' | 'unit' | 'obsPct' | 'vat'>>,
): string | null {
  const d = e.damages.find((x) => x.id === id);
  if (!d) return 'Ligne introuvable';
  const calc = calcMap(e)[d.calculationId];
  const n = { qty: d.qty, unit: d.unit, vat: d.vat, obsPct: d.obsPct, ...patch };
  const amountEntered =
    !('obsPct' in patch) && num(d.obsPct) === 0 && num(d.obsAmount) > 0 && d.l1 !== RSE;
  const keep = amountEntered ? d.obsAmount : null;
  const a =
    d.l1 === MBV
      ? mbvAmounts(
          { ht: n.unit, vat: n.vat, obsPct: n.obsPct, obsAmountInput: keep },
          calc.taxRegime,
        )
      : damageAmounts(
          {
            l1: d.l1,
            qty: n.qty,
            unit: n.unit,
            vat: n.vat,
            obsPct: n.obsPct,
            obsAmountInput: keep,
          },
          calc.taxRegime,
        );
  if (d.l1 !== RSE && a.obsAmount > a.base + 0.001)
    return 'La vétusté ne peut pas dépasser le montant de la ligne';
  Object.assign(d, {
    qty: d.l1 === MBV ? 1 : n.qty,
    unit: n.unit,
    vat: n.vat,
    obsPct: r1(a.obsPct),
    obsAmount: a.obsAmount,
    priceWithObs: a.priceWithObs,
    priceNoVAT: a.priceNoVAT,
    priceWithVAT: a.priceWithVAT,
  });
  d.irsiAmount =
    d.l1 === MBV
      ? mbvIrsiAmount(benefitOf(refs, MBV, d.l2), { ht: d.unit, obsPct: d.obsPct })
      : irsiAmount(benefitOf(refs, d.l1, d.l2), d);
  touch(e, calc);
  return null;
}

export function removeDamage(e: Estimate, id: Id): void {
  const d = e.damages.find((x) => x.id === id);
  if (!d) return;
  e.damages = e.damages.filter((x) => x !== d);
  touch(e, calcMap(e)[d.calculationId]);
}

/** Bascule HT/TTC : recalcul des lignes du calcul et remise à zéro des ventilations concernées */
export function setTaxRegime(
  e: Estimate,
  calc: Calculation,
  ttc: boolean,
  isInsured: boolean,
): boolean {
  if (calc.taxRegime === ttc) return false;
  calc.taxRegime = ttc;
  e.damages
    .filter((d) => d.calculationId === calc.id)
    .forEach((d) => Object.assign(d, recalcOnTaxRegime(d, ttc)));
  let reset = false;
  if (isInsured) {
    for (const key of Object.keys(e.comps))
      if (key.startsWith(`${calc.riskObjectId}_`)) {
        delete e.comps[key];
        reset = true;
      }
  }
  touch(e, calc);
  return reset;
}

/** Lignes indemnisables de l'assuré, ventilations vers des bénéficiaires supprimés écartées */
export function groupsOf(c: Case, e: Estimate): CompensationGroup[] {
  const ins = insured(c);
  const groups = buildGroups(
    ins ? e.damages.filter((d) => d.thirdPartyId === ins.id) : [],
    calcMap(e),
    e.comps,
  );
  const ids = new Set(e.beneficiaries.map((b) => b.id));
  for (const g of groups)
    if (g.beneficiaryId && !ids.has(g.beneficiaryId))
      Object.assign(g, { beneficiaryId: null, immediate: 0, deferred: 0 });
  return groups;
}

export function duplicateEstimate(c: Case, sourceId: Id): Estimate {
  const src = c.estimates.find((x) => x.id === sourceId)!;
  const copy = structuredClone(src);
  const fresh = newEstimate(c);
  const ids = new Map<Id, Id>();
  const remap = (old: Id) => {
    const n = uid();
    ids.set(old, n);
    return n;
  };
  Object.assign(copy, {
    id: fresh.id,
    name: fresh.name,
    status: 1,
    statusDate: fresh.statusDate,
    active: false,
  });
  copy.calculations.forEach((k) => (k.id = remap(k.id)));
  copy.damages.forEach((d) => {
    d.id = uid();
    d.calculationId = ids.get(d.calculationId)!;
  });
  copy.stances.forEach((s) => (s.id = remap(s.id)));
  copy.beneficiaries.forEach((b) => {
    b.id = remap(b.id);
    if (b.stanceId) b.stanceId = ids.get(b.stanceId) ?? null;
  });
  Object.values(copy.comps).forEach((k) => {
    if (k.beneficiaryId) k.beneficiaryId = ids.get(k.beneficiaryId) ?? null;
  });
  c.estimates.push(copy);
  return copy;
}
