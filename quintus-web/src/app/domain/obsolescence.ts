/** Barèmes de vétusté : taux annuel appliqué après une franchise en années, plafonné. */
import { blank, num, r1 } from './math';
import { ObsolescenceRule } from './models';

export function scaleObsolescence(
  rule: ObsolescenceRule | null | undefined,
  ageYears: number | null | undefined,
): number | null {
  if (!rule || blank(ageYears)) return null;
  const years = Math.max(0, num(ageYears) - num(rule.franchiseYears));
  return r1(Math.min(blank(rule.maxPct) ? 100 : rule.maxPct, years * num(rule.ratePerYear)));
}

/** Règle du détail, sinon de la nature */
export function findRule(
  rules: readonly ObsolescenceRule[],
  l1: string,
  l2: string,
): ObsolescenceRule | null {
  return (
    rules.find((r) => r.l1 === l1 && r.l2 === l2) ??
    rules.find((r) => r.l1 === l1 && blank(r.l2)) ??
    null
  );
}

/** Années entières révolues entre deux dates AAAA-MM-JJ */
export function yearsBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate()))
    y--;
  return y;
}
