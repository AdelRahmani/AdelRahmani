/** Arithmétique des montants : arrondis identiques à Power Fx (Round, RoundDown). */

export const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
export const blank = (x: unknown): x is null | undefined | '' =>
  x === null || x === undefined || x === '';

/** Arrondi au plus proche, demi vers l'extérieur (Round de Power Fx) */
export function round(x: number | null | undefined, digits: number): number {
  const f = 10 ** digits;
  const v = num(x) * f;
  return (Math.sign(v) * Math.round(Math.abs(v) + 1e-9)) / f;
}
export const r1 = (x: number | null | undefined): number => round(x, 1);
export const r2 = (x: number | null | undefined): number => round(x, 2);
/** RoundDown(x, 2) */
export const roundDown2 = (x: number | null | undefined): number =>
  Math.floor(num(x) * 100 + 1e-7) / 100;
export const sum = <T>(items: readonly T[], f: (item: T) => number | null | undefined): number =>
  items.reduce((acc, item) => acc + num(f(item)), 0);
