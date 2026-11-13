/* Lecture d'un devis ou d'une facture : repère les lignes chiffrées dans le texte du document.
   Fonctions pures (testables sous Node). Les colonnes sont séparées par des tabulations quand
   le texte vient d'un PDF ; un texte collé, séparé par de simples espaces, est aussi accepté. */
(function (root) {
  "use strict";

  const VAT_RATES = [0, 2.1, 5.5, 8.5, 10, 20];
  const UNITS = [
    [/^(m²|m2|m\^2|mq)$/i, "m²"], [/^(m3|m³)$/i, "m3"], [/^(ml|m|mètres?|metres?|ml\.)$/i, "ml"],
    [/^(h|hr|hrs|heures?)$/i, "H"], [/^(f|ff|fft|forf|forfait|forfaits|ft)$/i, "FFT"],
    [/^(u|un|unité|unités|unite|pce|pces|pièce|pièces|piece|ens|ensemble|lot|j|jour|jours)\.?$/i, "U"],
  ];
  const SKIP = /^(sous[- ]?total|total|totaux|t\.?v\.?a\b|net\s+[àa]\s+payer|acompte|montant|base\s+h\.?t|remise|escompte|page\b|siret|siren|iban|bic|t[ée]l\b|t[ée]l[ée]phone|fax|capital|r\.?c\.?s|ape\b|naf\b|n°\s*tva|date\b|devis\b|facture\b|validit[ée]|conditions|r[èe]glement|[ée]ch[ée]ance|bon\s+pour|signature|report\b|d[ée]signation|description|libell[ée]|r[ée]f[ée]rence\b|quantit[ée]|qt[ée]\b|code\s+client|client\b|adresse)/i;

  const near = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
  const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;

  // "1 234,56" · "1.234,56" · "1234.56" · "12,5"
  function toNumber(s) {
    let t = String(s).replace(/[\s  €]/g, "");
    if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (t.includes(",")) t = t.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  const NUM_GROUPED = /-?\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g; // séparateur de milliers accepté
  const NUM_PLAIN = /-?\d+(?:[.,]\d+)?/g;
  const isNumTok = (t) => /^-?\d+(?:[.,]\d+)*$/.test(t);
  const unitOf = (t) => { const u = UNITS.find(([re]) => re.test(t)); return u ? u[1] : null; };
  const isFiller = (t) => /^(€|eur|euros?|%|x|×|\*|=|:|ht|h\.t\.?|ttc|t\.t\.c\.?|-)$/i.test(t);

  // Cherche quantité × prix unitaire = total parmi les nombres de fin de ligne
  function findTriple(nums) {
    for (let k = nums.length - 1; k >= 2; k--)
      for (let j = k - 1; j >= 1; j--)
        for (let i = j - 1; i >= 0; i--)
          if (nums[i] > 0 && nums[j] >= 0 && near(nums[i] * nums[j], nums[k])) return { i, j, k };
    return null;
  }

  function parseLine(raw) {
    let s = raw.replace(/ | /g, " ").replace(/^[\s\-•*·]+/, "").trim();
    if (!s) return null;
    // "20m²" → "20 m²", "12,50€" → "12,50 €"
    s = s.replace(/(\d)(m²|m2|m3|m³|ml|€|%)(?=\s|$)/gi, "$1 $2");
    const cells = s.split(/\t+| {2,}/).map((c) => c.trim()).filter(Boolean);
    const toks = cells.join(" \t ").split(/ +/).filter(Boolean);
    // fin de ligne faite uniquement de nombres, unités et symboles
    let cut = toks.length;
    while (cut > 0) {
      const t = toks[cut - 1];
      if (t === "\t" || isNumTok(t) || isFiller(t) || (unitOf(t) && cut - 1 > 0) || /^\d+(?:[.,]\d+)?%$/.test(t)) cut--;
      else break;
    }
    // la désignation garde ses propres nombres ("Peinture 2 couches")
    while (cut < toks.length && (toks[cut] === "\t" || isFiller(toks[cut]))) cut++;
    const name = toks.slice(0, cut).filter((t) => t !== "\t").join(" ").replace(/[\s:;,.\-]+$/, "").trim();
    const tailToks = toks.slice(cut);
    if (!tailToks.some(isNumTok) && !tailToks.some((t) => /\d%$/.test(t))) return { text: s };

    let unit = null, vat = null;
    const hasCurrency = tailToks.some((t) => /^(€|eur|euros?)$/i.test(t));
    const kept = [];
    tailToks.forEach((t, idx) => {
      const pm = t.match(/^(\d+(?:[.,]\d+)?)%$/);
      if (pm) { vat = toNumber(pm[1]); return; }
      if (t === "%" && kept.length && isNumTok(kept[kept.length - 1])) { vat = toNumber(kept.pop()); return; }
      const u = !isNumTok(t) && unitOf(t);
      if (u) { if (!unit) unit = u; kept.push("\t"); return; }
      if (isFiller(t)) { kept.push("\t"); return; }
      kept.push(t);
    });
    const tail = kept.join(" ");
    const hasDecimals = /\d[.,]\d{2}(?!\d)/.test(tail);
    const read = (re) => tail.split("\t").flatMap((cell) => (cell.match(re) || []).map(toNumber)).filter((x) => x !== null);
    let nums, tri;
    if (cells.length > 1) {
      // vraies colonnes : "2 450,00" dans une cellule est un seul montant
      nums = read(NUM_GROUPED); tri = findTriple(nums);
    } else {
      // espaces simples : "2 150,00 300,00" se lit 2 × 150 = 300, "1 234,56 1 234,56" un montant répété
      const g = read(NUM_GROUPED), tg = findTriple(g), pl = read(NUM_PLAIN), tp = findTriple(pl);
      const useGrouped = (g.length === 2 && near(g[0], g[1])) || (tg && tp ? g[tg.k] > pl[tp.k] : !tp);
      if (useGrouped) { nums = g; tri = tg; } else { nums = pl; tri = tp; }
    }

    let qty, unitPrice, total, check = false;
    if (tri) {
      qty = nums[tri.i]; unitPrice = nums[tri.j]; total = nums[tri.k];
      if (vat === null) { const rest = nums.filter((_, x) => x !== tri.i && x !== tri.j && x !== tri.k).find((x) => VAT_RATES.includes(x) && x > 0); if (rest !== undefined) vat = rest; }
    } else if (nums.length === 1) {
      if (!hasDecimals && !hasCurrency && !unit) return { text: s };
      qty = 1; unitPrice = nums[0]; total = nums[0];
    } else if (nums.length === 2) {
      if (!hasDecimals && !hasCurrency) return { text: s };
      if (near(nums[0], nums[1])) { qty = 1; unitPrice = nums[1]; total = nums[1]; }
      else { qty = nums[0]; unitPrice = nums[1]; total = r2(qty * unitPrice); check = true; }
    } else {
      // pas de produit cohérent : on retient le dernier montant comme total
      if (!hasDecimals && !hasCurrency) return { text: s };
      total = nums[nums.length - 1]; qty = 1; unitPrice = total; check = true;
    }
    if (!(unitPrice > 0) && !(total > 0)) return { text: s };
    return { name, qty, unit, unitPrice, vat, total: r2(total), check };
  }

  function lastAmount(line) {
    const m = line.replace(/ | /g, " ").match(NUM_GROUPED);
    if (!m) return null;
    const dec = m.filter((x) => /[.,]\d{2}$/.test(x));
    return toNumber((dec.length ? dec : m).pop());
  }

  function parseQuoteText(text) {
    const lines = String(text || "").replace(/;/g, "\t").split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
    const out = { kind: null, supplier: null, number: null, date: null, totals: { ht: null, vat: null, ttc: null }, lines: [] };
    let pending = null;
    for (const raw of lines) {
      const s = raw.trim();
      if (!s) { pending = null; continue; }
      if (!out.supplier && /[A-Za-zÀ-ÿ]{3}/.test(s) && !SKIP.test(s)) out.supplier = s.split(/\t| {2,}/)[0].trim().slice(0, 60);
      if (!out.kind) { const k = s.match(/\b(facture|devis)\b/i); if (k) out.kind = k[1].toLowerCase(); }
      if (!out.number) { const n = s.match(/\b(?:facture|devis)\s*(?:n[°ºo]\.?|num[ée]ro|#)?\s*[:#]?\s*([A-Z0-9][\w\-\/]*\d[\w\-\/]*)/i); if (n) out.number = n[1]; }
      if (!out.date) { const d = s.match(/\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/); if (d) out.date = d[1]; }
      if (/total\s*(g[ée]n[ée]ral\s*)?t\.?\s*t\.?\s*c|net\s+[àa]\s+payer|montant\s*t\.?t\.?c/i.test(s)) { out.totals.ttc = lastAmount(s); pending = null; continue; }
      if (/(total|montant|base)\s*(g[ée]n[ée]ral\s*)?h\.?\s*t/i.test(s) && !/sous/i.test(s)) { out.totals.ht = lastAmount(s); pending = null; continue; }
      if (/^(total\s*)?(montant\s*)?t\.?v\.?a/i.test(s)) { out.totals.vat = lastAmount(s); pending = null; continue; }
      if (SKIP.test(s)) { pending = null; continue; }
      const p = parseLine(raw);
      if (!p) continue;
      if (p.text !== undefined) { if (/[A-Za-zÀ-ÿ]{3}/.test(p.text)) pending = p.text.replace(/\t/g, " "); continue; } // seule la dernière ligne de texte sert de désignation
      if (p.name.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 3) {
        if (!pending) continue; // montant isolé sans désignation
        p.name = (pending + " " + p.name).trim();
      }
      pending = null;
      out.lines.push(p);
    }
    out.linesTotal = r2(out.lines.reduce((a, l) => a + l.total, 0));
    return out;
  }

  /* Texte d'une page PDF à partir des fragments positionnés (pdf.js) :
     même ordonnée = même ligne, grand écart horizontal = changement de colonne. */
  function itemsToText(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, (it.h || 8) * 0.35));
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = "", end = null;
      for (const it of r.items) {
        if (end !== null) { const gap = it.x - end; line += gap > Math.max(7, (it.h || 8) * 0.9) ? "\t" : gap > 0.8 ? " " : ""; }
        line += it.str.trim(); end = it.x + (it.w || 0);
      }
      return line;
    }).join("\n");
  }

  // Réponse JSON de l'analyse par Claude → même structure que parseQuoteText
  function fromModel(j) {
    const n = (x) => (typeof x === "number" && isFinite(x) ? x : typeof x === "string" ? toNumber(x) : null);
    const out = { kind: j && /fact/i.test(j.kind || "") ? "facture" : j && j.kind ? "devis" : null, supplier: (j && j.supplier) || null, number: (j && j.number) || null, date: (j && j.date) || null,
      totals: { ht: n(j && j.totalHT), vat: null, ttc: n(j && j.totalTTC) }, lines: [] };
    for (const l of (j && Array.isArray(j.lines) ? j.lines : [])) {
      const total = n(l.totalHT), q = n(l.quantity), pu = n(l.unitPriceHT);
      if (!l.designation || (total === null && pu === null)) continue;
      const qty = q > 0 ? q : 1, unitPrice = pu !== null ? pu : r2(total / qty);
      out.lines.push({ name: String(l.designation).trim(), qty, unit: l.unit ? unitOf(String(l.unit).trim()) || null : null, unitPrice, vat: n(l.vatRate), total: total !== null ? r2(total) : r2(qty * unitPrice), check: total !== null && !near(qty * unitPrice, total) });
    }
    out.linesTotal = r2(out.lines.reduce((a, l) => a + l.total, 0));
    return out;
  }

  const api = { parseQuoteText, parseLine, itemsToText, fromModel, toNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ECExtract = api;
})(typeof window !== "undefined" ? window : globalThis);
