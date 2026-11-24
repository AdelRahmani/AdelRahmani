/** Formats français des montants et saisies numériques (virgule ou point acceptés). */
import { blank } from '../domain';

const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nbsp = (s: string) => s.replace(/ /g, ' ');

export const eur = (x: number | null | undefined): string =>
  blank(x) ? '–' : nbsp(nf2.format(x)) + ' €';
export const n2 = (x: number | null | undefined): string => (blank(x) ? '' : nbsp(nf2.format(x)));
export const pct = (x: number | null | undefined): string =>
  blank(x) ? '' : String(Math.round(x * 10) / 10).replace('.', ',');
export const qty = (x: number | null | undefined): string =>
  blank(x) ? '' : String(Math.round(x * 1000) / 1000).replace('.', ',');
export const frDate = (d: string | null | undefined): string =>
  d ? d.slice(0, 10).split('-').reverse().join('/') : '';

/** undefined : saisie invalide · null : champ vide */
export function parseNum(s: unknown): number | null | undefined {
  const t = String(s ?? '')
    .replace(/[\s  €%]/g, '')
    .replace(',', '.');
  if (t === '') return null;
  return /^[-+]?\d*\.?\d+$/.test(t) ? parseFloat(t) : undefined;
}

export const uid = (): string => crypto.randomUUID();
export const today = (): string => new Date().toISOString().slice(0, 10);
