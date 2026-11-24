/** Lignes de dommages : prestations et mobilier (écrans Edit Damage et Edit MBV). */
import { MBV, RSE } from './constants';
import { blank, num, r2 } from './math';
import { Benefit, Damage } from './models';

export interface LinePrices {
  priceNoVAT: number;
  priceWithVAT: number;
}
export interface LineAmounts extends LinePrices {
  /** montant servant au calcul de la vétusté (HT ou TTC selon le régime fiscal) */
  base: number;
  obsPct: number;
  obsAmount: number;
  priceWithObs: number;
}
export interface DamageInput {
  l1: string;
  qty: number | null;
  unit: number | null;
  vat: number | null;
  obsPct?: number | null;
  /** montant de vétusté saisi : remplace le pourcentage */
  obsAmountInput?: number | null;
}

/** Colonnes calculées Dataverse PriceNoVAT / PriceWithVAT */
export function linePrices(d: Pick<DamageInput, 'l1' | 'qty' | 'unit' | 'vat'>): LinePrices {
  const ht = d.l1 === RSE ? num(d.unit) / 100 : num(d.unit) * num(d.qty);
  return { priceNoVAT: r2(ht), priceWithVAT: r2(ht * (1 + num(d.vat) / 100)) };
}

/** Montants d'une prestation selon le régime fiscal du règlement (ttc = true) */
export function damageAmounts(d: DamageInput, ttc: boolean): LineAmounts {
  const p = linePrices(d);
  if (d.l1 === RSE) {
    // 1 % RSE : pas de vétusté, le montant retenu est le montant de la bonification
    const amount = ttc ? p.priceWithVAT : p.priceNoVAT;
    return { ...p, base: amount, obsPct: 0, obsAmount: amount, priceWithObs: amount };
  }
  const base = r2(num(d.unit) * num(d.qty) * (ttc ? 1 + num(d.vat) / 100 : 1));
  const entered = !blank(d.obsAmountInput);
  const obsPct = entered ? 0 : num(d.obsPct);
  const obsAmount = entered ? num(d.obsAmountInput) : r2((base * obsPct) / 100);
  return { ...p, base, obsPct, obsAmount, priceWithObs: r2(base - obsAmount) };
}

/** Changement de régime fiscal HT/TTC : recalcul de la vétusté de chaque ligne */
export function recalcOnTaxRegime(
  d: Damage,
  ttc: boolean,
): Pick<Damage, 'obsAmount' | 'priceWithObs'> {
  if (d.l1 === RSE) {
    const a = damageAmounts(d, ttc);
    return { obsAmount: a.obsAmount, priceWithObs: a.priceWithObs };
  }
  const price = r2(ttc ? d.priceWithVAT : d.priceNoVAT);
  const amountEntered = num(d.obsPct) === 0 && num(d.obsAmount) > 0;
  const obsAmount = amountEntered ? d.obsAmount : r2((price * num(d.obsPct)) / 100);
  return { obsAmount, priceWithObs: r2(price - obsAmount) };
}

/** Vétusté transverse appliquée à toute une nature (niveau 1) */
export function transverseObsolescence(
  d: Pick<Damage, 'qty' | 'unit' | 'vat'>,
  pct: number,
  ttc: boolean,
) {
  const base = num(d.qty) * num(d.unit) * (ttc ? 1 + num(d.vat) / 100 : 1);
  return {
    obsPct: Math.round(pct * 10) / 10,
    obsAmount: r2((base * pct) / 100),
    priceWithObs: r2(base * (1 - pct / 100)),
  };
}

const isContent = (b: Benefit) => b.synth1 === 'Contenu' || b.synth1 === 'Contenu professionnel';

/** Montant retenu pour l'assiette IRSI (lblCalculatedDamageAmount_EditDamage) */
export function irsiAmount(
  benefit: Benefit | undefined,
  d: Pick<Damage, 'l1' | 'qty' | 'unit' | 'obsPct' | 'priceWithObs'>,
): number | null {
  if (!benefit || benefit.damageREC !== 'Materiel') return null;
  if (d.l1 === RSE) return isContent(benefit) ? num(d.priceWithObs) : num(d.unit);
  const ht = num(d.unit) * num(d.qty);
  return isContent(benefit) ? ht * (1 - num(d.obsPct) / 100) : ht;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Index de ligne AxxBxxCxx : nature / détail / prestation. Le mobilier est rangé sous A99. */
export function nextLineIndex(
  damages: readonly Pick<Damage, 'l1' | 'l2' | 'lineIndex'>[],
  l1: string,
  l2: string,
): string {
  const sorted = [...damages].sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
  if (l1 === MBV) {
    const same = sorted.filter((d) => d.l2 === l2);
    if (same.length) {
      const last = same[same.length - 1].lineIndex;
      return last.slice(0, 7) + pad2(+last.slice(-2) + 1);
    }
    const last = sorted.length ? +sorted[sorted.length - 1].lineIndex.slice(4, 6) : 0;
    return 'A99B' + pad2(last + 1) + 'C01';
  }
  const first = sorted.find((d) => d.l1 === l1);
  if (!first) {
    if (!sorted.length) return 'A01B01C01';
    return 'A' + pad2(+sorted[sorted.length - 1].lineIndex.slice(1, 3) + 1) + 'B01C01';
  }
  const aIdx = first.lineIndex.slice(0, 3);
  const sameDetail = sorted.filter((d) => d.l1 === l1 && d.l2 === l2);
  if (!sameDetail.length) {
    const inA = sorted.filter((d) => d.lineIndex.slice(0, 3) === aIdx);
    return aIdx + 'B' + pad2(+inA[inA.length - 1].lineIndex.slice(4, 6) + 1) + 'C01';
  }
  const last = sameDetail[sameDetail.length - 1].lineIndex;
  return last.slice(0, 7) + pad2(+last.slice(-2) + 1);
}

/* ---------- Mobilier et biens volés ---------- */

export interface MbvInput {
  ht: number | null;
  vat: number | null;
  obsPct?: number | null;
  obsAmountInput?: number | null;
}

export function mbvAmounts(m: MbvInput, ttc: boolean): LineAmounts {
  const ht = num(m.ht);
  const ttcAmount = r2(ht * (1 + num(m.vat) / 100));
  const base = ttc ? ttcAmount : ht;
  const entered = !blank(m.obsAmountInput);
  const obsPct = entered ? 0 : num(m.obsPct);
  const obsAmount = entered ? num(m.obsAmountInput) : r2((base * obsPct) / 100);
  return {
    priceNoVAT: r2(ht),
    priceWithVAT: blank(m.vat) ? r2(ht) : ttcAmount,
    base,
    obsPct,
    obsAmount,
    priceWithObs: r2(base - obsAmount),
  };
}

export const htFromTtc = (ttcAmount: number | null, vat: number | null): number =>
  num(ttcAmount) / (1 + num(vat) / 100);

export function mbvIrsiAmount(
  benefit: Benefit | undefined,
  m: { ht: number | null; obsPct: number | null },
): number | null {
  if (!benefit || benefit.damageREC !== 'Materiel') return null;
  return isContent(benefit) ? num(m.ht) * (1 - num(m.obsPct) / 100) : num(m.ht);
}
