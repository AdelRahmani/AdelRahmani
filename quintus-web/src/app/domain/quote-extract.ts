/**
 * Lecture d'un devis ou d'une facture : repère les lignes chiffrées dans le texte du document, sans IA.
 * Les colonnes sont séparées par des tabulations quand le texte vient d'un PDF ; un texte collé,
 * séparé par de simples espaces, est aussi accepté. Porté du prototype web (src/extract.js).
 */
import { Benefit, Price } from './models';

export interface QuoteLine {
  name: string;
  qty: number;
  /** unité normalisée : m², m3, ml, H, FFT, U */
  unit: string | null;
  unitPrice: number;
  vat: number | null;
  total: number;
  /** quantité ou prix déduits sans recoupement : à vérifier */
  check: boolean;
}
export interface QuoteDocument {
  kind: 'devis' | 'facture' | null;
  supplier: string | null;
  number: string | null;
  date: string | null;
  totals: { ht: number | null; vat: number | null; ttc: number | null };
  lines: QuoteLine[];
  linesTotal: number;
}
/** Fragment de texte positionné, tel que pdf.js le donne */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

const VAT_RATES = [0, 2.1, 5.5, 8.5, 10, 20];
const UNITS: [RegExp, string][] = [
  [/^(m²|m2|m\^2|mq)$/i, 'm²'],
  [/^(m3|m³)$/i, 'm3'],
  [/^(ml|m|mètres?|metres?|ml\.)$/i, 'ml'],
  [/^(h|hr|hrs|heures?)$/i, 'H'],
  [/^(f|ff|fft|forf|forfait|forfaits|ft)$/i, 'FFT'],
  [
    /^(u|un|unité|unités|unite|pce|pces|pièce|pièces|piece|ens|ensemble|lot|j|jour|jours)\.?$/i,
    'U',
  ],
];
/** Lignes d'en-tête, de pied et de totaux, jamais des prestations */
const SKIP =
  /^(sous[- ]?total|total|totaux|t\.?v\.?a\b|net\s+[àa]\s+payer|acompte|montant|base\s+h\.?t|remise|escompte|page\b|siret|siren|iban|bic|t[ée]l\b|t[ée]l[ée]phone|fax|capital|r\.?c\.?s|ape\b|naf\b|n°\s*tva|date\b|devis\b|facture\b|validit[ée]|conditions|r[èe]glement|[ée]ch[ée]ance|bon\s+pour|signature|report\b|d[ée]signation|description|libell[ée]|r[ée]f[ée]rence\b|quantit[ée]|qt[ée]\b|code\s+client|client\b|adresse)/i;
const SPACES = /[  ]/g;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
const r2 = (x: number) => Math.round(x * 100 + 1e-9) / 100;

/** "1 234,56" · "1.234,56" · "1234.56" · "12,5" */
export function toNumber(s: string): number | null {
  let t = String(s).replace(/[\s  €]/g, '');
  if (t.includes(',') && t.includes('.'))
    t =
      t.lastIndexOf(',') > t.lastIndexOf('.')
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

/** nombres avec séparateur de milliers accepté */
const NUM_GROUPED = /-?\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g;
const NUM_PLAIN = /-?\d+(?:[.,]\d+)?/g;
const isNumTok = (t: string) => /^-?\d+(?:[.,]\d+)*$/.test(t);
const unitOf = (t: string) => UNITS.find(([re]) => re.test(t))?.[1] ?? null;
const isFiller = (t: string) =>
  /^(€|eur|euros?|%|x|×|\*|=|:|ht|h\.t\.?|ttc|t\.t\.c\.?|-)$/i.test(t);

/** Cherche quantité × prix unitaire = total parmi les nombres de fin de ligne */
function findTriple(nums: number[]) {
  for (let k = nums.length - 1; k >= 2; k--)
    for (let j = k - 1; j >= 1; j--)
      for (let i = j - 1; i >= 0; i--)
        if (nums.at(i)! > 0 && nums.at(j)! >= 0 && near(nums.at(i)! * nums.at(j)!, nums.at(k)!))
          return { i, j, k };
  return null;
}

/** Une ligne du document : une prestation chiffrée, ou { text } si elle ne porte pas de montant */
export function parseLine(raw: string): QuoteLine | { text: string } | null {
  let s = raw
    .replace(SPACES, ' ')
    .replace(/^[\s\-•*·]+/, '')
    .trim();
  if (!s) return null;
  // "20m²" → "20 m²", "12,50€" → "12,50 €"
  s = s.replace(/(\d)(m²|m2|m3|m³|ml|€|%)(?=\s|$)/gi, '$1 $2');
  const cells = s
    .split(/\t+| {2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  const toks = cells.join(' \t ').split(/ +/).filter(Boolean);
  // fin de ligne faite uniquement de nombres, unités et symboles
  let cut = toks.length;
  while (cut > 0) {
    const t = toks[cut - 1];
    if (
      t === '\t' ||
      isNumTok(t) ||
      isFiller(t) ||
      (unitOf(t) && cut - 1 > 0) ||
      /^\d+(?:[.,]\d+)?%$/.test(t)
    )
      cut--;
    else break;
  }
  // la désignation garde ses propres nombres ("Peinture 2 couches")
  while (cut < toks.length && (toks[cut] === '\t' || isFiller(toks[cut]))) cut++;
  const name = toks
    .slice(0, cut)
    .filter((t) => t !== '\t')
    .join(' ')
    .replace(/[\s:;,.-]+$/, '')
    .trim();
  const tailToks = toks.slice(cut);
  if (!tailToks.some(isNumTok) && !tailToks.some((t) => /\d%$/.test(t))) return { text: s };

  let unit: string | null = null;
  let vat: number | null = null;
  const hasCurrency = tailToks.some((t) => /^(€|eur|euros?)$/i.test(t));
  const kept: string[] = [];
  for (const t of tailToks) {
    const pm = t.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (pm) {
      vat = toNumber(pm[1]);
      continue;
    }
    if (t === '%' && kept.length && isNumTok(kept[kept.length - 1])) {
      vat = toNumber(kept.pop()!);
      continue;
    }
    const u = !isNumTok(t) && unitOf(t);
    if (u) {
      unit ??= u;
      kept.push('\t');
      continue;
    }
    kept.push(isFiller(t) ? '\t' : t);
  }
  const tail = kept.join(' ');
  const hasDecimals = /\d[.,]\d{2}(?!\d)/.test(tail);
  const read = (re: RegExp) =>
    tail
      .split('\t')
      .flatMap((cell) => (cell.match(re) ?? []).map(toNumber))
      .filter((x): x is number => x !== null);
  let nums: number[];
  let tri: ReturnType<typeof findTriple>;
  if (cells.length > 1) {
    // vraies colonnes : "2 450,00" dans une cellule est un seul montant
    nums = read(NUM_GROUPED);
    tri = findTriple(nums);
  } else {
    // espaces simples : "2 150,00 300,00" se lit 2 × 150 = 300, "1 234,56 1 234,56" un montant répété
    const g = read(NUM_GROUPED),
      tg = findTriple(g),
      pl = read(NUM_PLAIN),
      tp = findTriple(pl);
    const useGrouped =
      (g.length === 2 && near(g[0], g[1])) || (tg && tp ? g.at(tg.k)! > pl.at(tp.k)! : !tp);
    [nums, tri] = useGrouped ? [g, tg] : [pl, tp];
  }

  let qty: number,
    unitPrice: number,
    total: number,
    check = false;
  if (tri) {
    [qty, unitPrice, total] = [nums.at(tri.i)!, nums.at(tri.j)!, nums.at(tri.k)!];
    if (vat === null) {
      const rest = nums
        .filter((_, x) => x !== tri!.i && x !== tri!.j && x !== tri!.k)
        .find((x) => VAT_RATES.includes(x) && x > 0);
      if (rest !== undefined) vat = rest;
    }
  } else if (nums.length === 1) {
    if (!hasDecimals && !hasCurrency && !unit) return { text: s };
    qty = 1;
    unitPrice = total = nums[0];
  } else if (nums.length === 2) {
    if (!hasDecimals && !hasCurrency) return { text: s };
    if (near(nums[0], nums[1])) {
      qty = 1;
      unitPrice = total = nums[1];
    } else {
      [qty, unitPrice] = nums;
      total = r2(qty * unitPrice);
      check = true;
    }
  } else {
    // pas de produit cohérent : on retient le dernier montant comme total
    if (!hasDecimals && !hasCurrency) return { text: s };
    total = nums[nums.length - 1];
    qty = 1;
    unitPrice = total;
    check = true;
  }
  if (!(unitPrice > 0) && !(total > 0)) return { text: s };
  return { name, qty, unit, unitPrice, vat, total: r2(total), check };
}

function lastAmount(line: string): number | null {
  const m = line.replace(SPACES, ' ').match(NUM_GROUPED);
  if (!m) return null;
  const dec = m.filter((x) => /[.,]\d{2}$/.test(x));
  return toNumber((dec.length ? dec : m)[(dec.length ? dec : m).length - 1]);
}

/** Lit tout le document : en-tête (type, n°, date, fournisseur), lignes chiffrées, totaux */
export function parseQuoteText(text: string): QuoteDocument {
  const lines = String(text ?? '')
    .replace(/;/g, '\t')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''));
  const out: QuoteDocument = {
    kind: null,
    supplier: null,
    number: null,
    date: null,
    totals: { ht: null, vat: null, ttc: null },
    lines: [],
    linesTotal: 0,
  };
  let pending: string | null = null;
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) {
      pending = null;
      continue;
    }
    if (!out.supplier && /[A-Za-zÀ-ÿ]{3}/.test(s) && !SKIP.test(s))
      out.supplier = s
        .split(/\t| {2,}/)[0]
        .trim()
        .slice(0, 60);
    if (!out.kind) {
      const k = s.match(/\b(facture|devis)\b/i);
      if (k) out.kind = k[1].toLowerCase() as 'devis' | 'facture';
    }
    if (!out.number) {
      const n = s.match(
        /\b(?:facture|devis)\s*(?:n[°ºo]\.?|num[ée]ro|#)?\s*[:#]?\s*([A-Z0-9][\w\-/]*\d[\w\-/]*)/i,
      );
      if (n) out.number = n[1];
    }
    if (!out.date) {
      const d = s.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/);
      if (d) out.date = d[1];
    }
    if (
      /total\s*(g[ée]n[ée]ral\s*)?t\.?\s*t\.?\s*c|net\s+[àa]\s+payer|montant\s*t\.?t\.?c/i.test(s)
    ) {
      out.totals.ttc = lastAmount(s);
      pending = null;
      continue;
    }
    if (/(total|montant|base)\s*(g[ée]n[ée]ral\s*)?h\.?\s*t/i.test(s) && !/sous/i.test(s)) {
      out.totals.ht = lastAmount(s);
      pending = null;
      continue;
    }
    if (/^(total\s*)?(montant\s*)?t\.?v\.?a/i.test(s)) {
      out.totals.vat = lastAmount(s);
      pending = null;
      continue;
    }
    if (SKIP.test(s)) {
      pending = null;
      continue;
    }
    const p = parseLine(raw);
    if (!p) continue;
    if ('text' in p) {
      // seule la dernière ligne de texte sert de désignation à une ligne de montants seule
      if (/[A-Za-zÀ-ÿ]{3}/.test(p.text)) pending = p.text.replace(/\t/g, ' ');
      continue;
    }
    if (p.name.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 3) {
      if (!pending) continue; // montant isolé sans désignation
      p.name = `${pending} ${p.name}`.trim();
    }
    pending = null;
    out.lines.push(p);
  }
  out.linesTotal = r2(out.lines.reduce((a, l) => a + l.total, 0));
  return out;
}

/**
 * Texte d'une page PDF à partir des fragments positionnés (pdf.js) :
 * même ordonnée = même ligne, grand écart horizontal = changement de colonne.
 */
export function itemsToText(items: readonly TextItem[]): string {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, (it.h || 8) * 0.35));
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = '';
      let end: number | null = null;
      for (const it of r.items) {
        if (end !== null) {
          const gap = it.x - end;
          line += gap > Math.max(7, (it.h || 8) * 0.9) ? '\t' : gap > 0.8 ? ' ' : '';
        }
        line += it.str.trim();
        end = it.x + (it.w || 0);
      }
      return line;
    })
    .join('\n');
}

/* ---------- Nature proposée d'après la désignation ---------- */

const STOP = new Set([
  'fourniture',
  'fournitures',
  'remplacement',
  'couches',
  'location',
  'jours',
  'dépose',
  'depose',
  'installation',
  'prestation',
  'travaux',
  'divers',
  'mise',
  'avec',
  'pour',
  'sans',
]);
const norm = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const words = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w))
    .map((w) => w.slice(0, 6));

export interface NatureChoice {
  l1: string;
  l2: string;
}
/**
 * Propose la nature (et le détail) dont le nom ou les prestations du bordereau ressemblent le plus
 * à la désignation : 2 points par mot du détail, 1 par mot d'une prestation du bordereau.
 */
export function guessNature(
  name: string,
  benefits: readonly Benefit[],
  prices: readonly Price[],
): NatureChoice | null {
  const ws = new Set(words(name));
  let best: NatureChoice | null = null;
  let score = 0;
  for (const b of benefits) {
    const kw2 = words(b.l2);
    const kw1 = new Set(
      prices.filter((p) => p.l1 === b.l1 && p.l2 === b.l2).flatMap((p) => words(p.name)),
    );
    let sc = 0;
    kw2.forEach((w) => ws.has(w) && (sc += 2));
    kw1.forEach((w) => ws.has(w) && (sc += 1));
    if (sc > score) {
      score = sc;
      best = { l1: b.l1, l2: b.l2 };
    }
  }
  return best;
}
