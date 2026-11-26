/* Moteur de calcul du chiffrage IMH, sans dépendance au navigateur.
   Reprend les formules des classeurs « CHIFFRAGE DOMMAGES <GAMME> » :
   valeur à neuf = Q × PU ; vétusté = VAN × taux ; VVD = VAN − vétusté ;
   vétusté récupérable = VAN × min(taux, 25 %) sur les locaux d'habitation ;
   aménagements extérieurs = min(VVD TTC, plafond) ; mobilier selon la catégorie. */
const IMH = (() => {
  const R = typeof IMHData !== "undefined" ? IMHData : require("./gammes.js");
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const blank = (v) => v == null || String(v).trim() === "";
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);

  function plafondValue(p, d) {
    if (!p) return Infinity;
    if (p.eur != null) return p.eur;
    if (p.pct != null) { const cap = num(d.capitalMobilier); const v = cap > 0 ? cap * p.pct : Infinity; return p.max != null ? Math.min(v, p.max) : v; }
    if (p.field) { const v = num(d[p.field]); return v > 0 ? v : Infinity; }
    return Infinity;
  }
  function plafondLabel(p) {
    if (!p) return "Sans plafond";
    if (p.eur != null) return `${p.eur.toLocaleString("fr-FR")} €`;
    if (p.pct != null) return `${Math.round(p.pct * 100)} % du capital mobilier${p.max != null ? `, ${p.max.toLocaleString("fr-FR")} € au plus` : ""}`;
    if (p.field === "valeurOccasionMH") return "Valeur d'occasion du mobil-home";
    return "";
  }

  /* Âge en années révolues entre la date d'achat et la date de référence (sinistre). */
  function ageYears(achat, ref) {
    if (blank(achat)) return null;
    const a = new Date(achat), r = blank(ref) ? new Date() : new Date(ref);
    if (isNaN(a) || isNaN(r)) return null;
    let y = r.getFullYear() - a.getFullYear();
    if (r.getMonth() < a.getMonth() || (r.getMonth() === a.getMonth() && r.getDate() < a.getDate())) y--;
    return Math.max(0, y);
  }

  /* Taux de vétusté proposé (en %), ou null quand il s'apprécie de gré à gré. */
  function suggestVet(cat, age, grille) {
    if (!cat || cat.kind === "occasion") return 0;
    if (age == null) return null;
    const y = age + 1; // « 1re année » = moins d'un an
    if (!grille || grille === "contrat") {
      if (cat.kind !== "neuf") return null;
      return age < (cat.seuil == null ? 0 : cat.seuil) ? 0 : Math.min(80, 10 * age);
    }
    const opt = grille.replace("2017-", "");
    if (cat.fam === "vet") return [0, 40, 60][y - 1] ?? 80;
    if (cat.fam === "equip") { if (opt === "illimite") return 0; if (opt === "5ans" && y <= 5) return 0; return Math.min(80, 10 * (y - 1)); }
    if (cat.fam === "info") { if (opt === "illimite") return 0; if (opt === "5ans") return y <= 5 ? 0 : 80; return Math.min(80, 20 * (y - 1)); }
    return null;
  }

  function newDossier() {
    return { id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ref: "", assure: "", dateSinistre: "", dateExpertise: "", cabinet: "", collaborateur: "",
      gamme: "CONFIANCE", zone: "1", capitalMobilier: "", franchise: "", franchiseRecours: false, valeurOccasionMH: "", grilleMob: "contrat", observations: "",
      immo: [], mob: [], autres: [], amen: [], ng: [] };
  }

  /* ----- Immobilier ----- */
  function immoLine(l, rub, g) {
    const van = num(l.q) * num(l.pu), t = num(l.vet) / 100;
    const vet = van * t, vvd = van - vet;
    const recup = rub && rub.recupOk ? van * Math.min(t, g.recupMax) : 0;
    const tvaRate = l.real === "po" ? 0 : num(l.tva) / 100;
    const tvaVvd = vvd * tvaRate, tvaRecup = recup * tvaRate, tva = tvaVvd + tvaRecup;
    const total = vvd + recup + tva;
    let acompte, differe;
    if (l.real === "ag") { acompte = 0; differe = total; }
    else if (l.real === "fo" || l.real === "po") { acompte = vvd + tvaVvd; differe = recup + tvaRecup; }
    else { acompte = vvd; differe = recup + tva; }
    return { van, vet, vvd, recup, nonRecup: vet - recup, tva, tvaRate, total, acompte, differe, vvdTtc: vvd + tvaVvd };
  }

  function compute(d) {
    const g = R.gammes[d.gamme] || R.gammes.CONFIANCE;
    const alertes = [], depassements = [];
    const fix = (o) => { for (const k in o) if (typeof o[k] === "number") o[k] = r2(o[k]); return o; };

    // Immobilier
    const immoLines = {}, rubs = g.rubriques.map((r) => ({ ...r, recupOk: r.recup, van: 0, vet: 0, vvd: 0, recup: 0, nonRecup: 0, tva: 0, total: 0, n: 0 }));
    const byRub = Object.fromEntries(rubs.map((r) => [r.id, r]));
    const payImmo = { ag: [0, 0], as: [0, 0], na: [0, 0] };
    d.immo.forEach((l, i) => {
      const rub = byRub[l.rub];
      if (!rub) { alertes.push(`Immobilier, ligne ${i + 1} : rubrique absente de la gamme ${g.label}, ligne non comptée.`); immoLines[l.id] = { excluded: true }; return; }
      const c = immoLine(l, rub, g); immoLines[l.id] = c; rub.n++;
      for (const k of ["van", "vet", "vvd", "recup", "nonRecup", "tva", "total"]) rub[k] += c[k];
      if (num(l.pu) === 0 && !blank(l.des)) alertes.push(`Immobilier, « ${l.des} » : prix unitaire à saisir.`);
    });
    for (const r of rubs) {
      r.plafondVal = plafondValue(r.plafond, d);
      r.retenu = Math.min(r.total, r.plafondVal); r.ratio = r.total > 0 ? r.retenu / r.total : 1; r.depass = r.total - r.retenu;
      if (r.depass > 0.005) depassements.push({ label: r.label, plafond: plafondLabel(r.plafond), montant: r2(r.depass) });
      if (r.plafond && r.plafond.field && r.n && r.plafondVal === Infinity) alertes.push(`${r.label} : saisir la valeur d'occasion du mobil-home sur le dossier pour appliquer le plafond.`);
    }
    d.immo.forEach((l) => {
      const c = immoLines[l.id]; if (c.excluded) return; const ratio = byRub[l.rub].ratio;
      const key = l.real === "ag" ? "ag" : l.real === "fo" || l.real === "po" ? "as" : "na";
      payImmo[key][0] += c.acompte * ratio; payImmo[key][1] += c.differe * ratio;
    });
    const corps = {};
    for (const k of ["emb", "immo"]) {
      const rs = rubs.filter((r) => r.corps === k);
      corps[k] = fix({ van: sum(rs, (r) => r.van), vet: sum(rs, (r) => r.vet), vvd: sum(rs, (r) => r.vvd), recup: sum(rs, (r) => r.recup), nonRecup: sum(rs, (r) => r.nonRecup), tva: sum(rs, (r) => r.tva), total: sum(rs, (r) => r.total), retenu: sum(rs, (r) => r.retenu) });
    }
    const corpsTotal = fix(Object.fromEntries(Object.keys(corps.emb).map((k) => [k, corps.emb[k] + corps.immo[k]])));

    // Mobilier
    const cats = g.mobilier.map((c) => ({ ...c, total: 0, valeur: 0, n: 0 })), byCat = Object.fromEntries(cats.map((c) => [c.id, c]));
    const mobLines = {};
    d.mob.forEach((l, i) => {
      const c = byCat[l.cat];
      if (!c) { alertes.push(`Mobilier, ligne ${i + 1} : catégorie absente de la gamme ${g.label}, ligne non comptée.`); mobLines[l.id] = { excluded: true }; return; }
      const age = ageYears(l.achat, d.dateSinistre), sugg = suggestVet(c, age, d.grilleMob);
      const valeur = num(l.valeur);
      const vetPct = c.kind === "occasion" ? 0 : !blank(l.vet) ? num(l.vet) : sugg != null ? sugg : 0;
      const vet = valeur * vetPct / 100, indem = valeur - vet;
      mobLines[l.id] = { age, sugg, vetPct, vet, indem, auto: c.kind !== "occasion" && blank(l.vet) };
      if (c.kind !== "occasion" && blank(l.vet) && sugg == null && valeur > 0) alertes.push(`Mobilier, « ${l.des || c.label} » : vétusté à apprécier (aucune proposée).`);
      c.total += indem; c.valeur += valeur; c.n++;
    });
    const groupes = (g.plafondsMob || []).map((p) => {
      const total = sum(p.cats, (id) => (byCat[id] ? byCat[id].total : 0)), pv = plafondValue(p.plafond, d), retenu = Math.min(total, pv);
      if (p.plafond && p.plafond.pct != null && p.plafond.max == null && num(d.capitalMobilier) <= 0 && total > 0) alertes.push(`${p.label} : saisir le capital mobilier souscrit pour appliquer le plafond.`);
      if (total - retenu > 0.005) depassements.push({ label: p.label, plafond: plafondLabel(p.plafond), montant: r2(total - retenu) });
      return { label: p.label, cats: p.cats, plafond: plafondLabel(p.plafond), total: r2(total), retenu: r2(retenu) };
    });
    const capped = new Set(groupes.flatMap((p) => p.cats));
    let mobRetenu = sum(groupes, (p) => p.retenu) + sum(cats.filter((c) => !capped.has(c.id)), (c) => c.total);
    const mobTotal = sum(cats, (c) => c.total), capital = num(d.capitalMobilier);
    if (capital > 0 && mobRetenu > capital) { depassements.push({ label: "Mobilier, capital souscrit", plafond: `${capital.toLocaleString("fr-FR")} €`, montant: r2(mobRetenu - capital) }); mobRetenu = capital; }

    // Autres préjudices
    const autresLines = {}, parNature = {};
    d.autres.forEach((l) => { const ht = num(l.q) * num(l.pu), ttc = ht * (1 + num(l.tva) / 100); autresLines[l.id] = { ht, ttc }; parNature[l.nat] = (parNature[l.nat] || 0) + ttc; });
    const autresTotal = sum(Object.values(autresLines), (x) => x.ttc);

    // Aménagements extérieurs
    const amenCats = (g.amenag || []).map((a) => ({ ...a, van: 0, vvd: 0, ttc: 0, n: 0 })), byAmen = Object.fromEntries(amenCats.map((a) => [a.id, a]));
    const amenLines = {};
    d.amen.forEach((l, i) => {
      const a = byAmen[l.cat];
      if (!a) { alertes.push(`Aménagements extérieurs, ligne ${i + 1} : catégorie non garantie par la gamme ${g.label}, ligne non comptée.`); amenLines[l.id] = { excluded: true }; return; }
      const van = num(l.q) * num(l.pu), vet = van * num(l.vet) / 100, vvd = van - vet, ttc = vvd * (1 + num(l.tva) / 100);
      amenLines[l.id] = { van, vet, vvd, ttc }; a.van += van; a.vvd += vvd; a.ttc += ttc; a.n++;
    });
    for (const a of amenCats) {
      const pv = plafondValue(a.plafond, d); a.retenu = Math.min(a.ttc, pv); a.plafondTxt = a.note && !a.plafond ? a.note : plafondLabel(a.plafond);
      if (a.plafond && a.plafond.pct != null && num(d.capitalMobilier) <= 0 && a.ttc > 0) alertes.push(`${a.label} : saisir le capital mobilier souscrit pour appliquer le plafond.`);
      if (a.ttc - a.retenu > 0.005) depassements.push({ label: a.label, plafond: a.plafondTxt, montant: r2(a.ttc - a.retenu) });
    }
    const amenRetenu = sum(amenCats, (a) => a.retenu);

    // Non garantis (pour mémoire)
    const ngLines = {};
    d.ng.forEach((l) => { const van = num(l.van), ttc = van * (1 + num(l.tva) / 100), vet = ttc * num(l.vet) / 100; ngLines[l.id] = { ttc, vet, vvd: ttc - vet }; });

    // Récapitulatif des règlements
    const fr = num(d.franchise);
    if (blank(d.franchise)) alertes.push("Franchise non renseignée sur le dossier.");
    const rows = [
      { key: "ag", label: "Travaux par entreprise agréée", acompte: payImmo.ag[0], differe: payImmo.ag[1], recours: 0 },
      { key: "as", label: "Travaux par l'assuré", acompte: payImmo.as[0], differe: payImmo.as[1], recours: 0 },
      { key: "na", label: "Travaux par entreprise non agréée", acompte: payImmo.na[0], differe: payImmo.na[1], recours: 0 },
      { key: "mob", label: "Mobilier", acompte: mobRetenu, differe: 0, recours: 0 },
      { key: "autres", label: "Autres dommages garantis", acompte: autresTotal, differe: 0, recours: 0 },
      { key: "amen", label: "Aménagements extérieurs garantis", acompte: amenRetenu, differe: 0, recours: 0 },
      { key: "fr", label: "Franchise", acompte: -fr, differe: 0, recours: d.franchiseRecours ? fr : 0 },
    ].map((r) => fix({ ...r, total: r.acompte + r.differe + r.recours }));
    const totals = fix({ acompte: sum(rows, (r) => r.acompte), differe: sum(rows, (r) => r.differe), recours: sum(rows, (r) => r.recours) });
    totals.total = r2(totals.acompte + totals.differe + totals.recours);
    if (totals.acompte < 0) alertes.push("L'acompte est négatif : la franchise dépasse les montants réglables immédiatement.");

    return {
      gamme: g, alertes, depassements,
      immo: { lines: immoLines, rubriques: rubs.map(fix), corps, corpsTotal },
      mob: { lines: mobLines, cats: cats.map(fix), groupes, total: r2(mobTotal), retenu: r2(mobRetenu) },
      autres: { lines: autresLines, parNature, total: r2(autresTotal) },
      amen: { lines: amenLines, cats: amenCats.map(fix), retenu: r2(amenRetenu) },
      ng: { lines: ngLines, total: r2(sum(Object.values(ngLines), (x) => x.ttc)) },
      pay: { rows, totals },
    };
  }

  /* Barème : CSV « groupe;article;unité;rubrique;zone 1;zone 2;… » (séparateur ; ou ,). */
  function parseBaremeCsv(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("Le fichier doit contenir une ligne d'en-tête et au moins un article.");
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
    const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
    const head = split(lines[0]).map((h) => h.toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const iG = col(/^groupe|corps/), iA = col(/article|désignation|designation|libell/), iU = col(/^unit/), iR = col(/^rubrique/);
    if (iA < 0) throw new Error("Colonne « article » introuvable dans l'en-tête.");
    const zoneCols = head.map((h, i) => [h, i]).filter(([h]) => /^zone/.test(h)).map(([h, i]) => [h.replace(/^zone\s*/, "").trim() || String(i), i]);
    if (!zoneCols.length) throw new Error("Aucune colonne de prix « zone … » dans l'en-tête.");
    const articles = lines.slice(1).map((l, n) => {
      const c = split(l), prix = {};
      for (const [z, i] of zoneCols) if (!blank(c[i])) prix[z] = num(c[i]);
      return { id: "c" + (n + 1), grp: iG >= 0 ? c[iG] || "Divers" : "Divers", des: c[iA] || "", unite: iU >= 0 ? c[iU] || "u" : "u", rub: iR >= 0 && c[iR] ? c[iR] : "hab-tce", prix };
    }).filter((a) => a.des);
    return { zones: zoneCols.map(([z]) => z), articles };
  }
  function baremeCsv(b) {
    const esc = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return "﻿" + [["groupe", "article", "unité", "rubrique", ...b.zones.map((z) => "zone " + z)], ...b.articles.map((a) => [a.grp, a.des, a.unite, a.rub, ...b.zones.map((z) => (a.prix[z] == null ? "" : String(a.prix[z]).replace(".", ",")))])].map((r) => r.map(esc).join(";")).join("\r\n");
  }

  return { compute, num, blank, r2, sum, ageYears, suggestVet, plafondValue, plafondLabel, newDossier, parseBaremeCsv, baremeCsv, R };
})();
if (typeof module !== "undefined") module.exports = IMH;
