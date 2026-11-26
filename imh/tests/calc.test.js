/* Règles de calcul du chiffrage IMH. Le premier cas reprend le classeur « CHIFFRAGE DOMMAGES 7443.xlsx ». */
const assert = require("assert");
const IMH = require("../src/calc.js");
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok", name); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.006, `${msg} : ${a} au lieu de ${b}`);
const dossier = (extra) => Object.assign(IMH.newDossier(), { franchise: "0" }, extra);
const L = (o) => Object.assign({ id: Math.random().toString(36).slice(2), tva: 10, vet: "", real: "na" }, o);

test("dossier 7443 (Confiance) : mêmes montants que le classeur", () => {
  const d = dossier({ gamme: "CONFIANCE", immo: [
    L({ rub: "hab-tce", des: "Remise en état conduit pouzzolane et conduit inox", q: 1, pu: 2726.36, vet: 25 }),
    L({ rub: "hab-tce", des: "Remplacement chapeau de cheminée", q: 1, pu: 603, vet: 25 }),
    L({ rub: "hab-tce", des: "Mise en peinture plafond séjour cuisine", q: 1, pu: 2561.56, vet: 25 }),
  ] });
  const r = IMH.compute(d), c = r.immo.corps.immo;
  near(c.van, 5890.92, "VAN HT"); near(c.vet, 1472.73, "vétusté"); near(c.vvd, 4418.19, "VVD HT");
  near(c.recup, 1472.73, "vétusté récupérable"); near(c.tva, 589.09, "TVA"); near(c.total, 6480.01, "total TTC après travaux");
  const na = r.pay.rows.find((x) => x.key === "na");
  near(na.acompte, 4418.19, "acompte"); near(na.differe, 2061.82, "différé à réception de facture");
  near(r.pay.totals.total, 6480.01, "solde");
});

test("vétusté récupérable plafonnée à 25 % de la valeur à neuf", () => {
  const r = IMH.compute(dossier({ immo: [L({ rub: "hab-emb", q: 10, pu: 100, vet: 40, tva: 0 })] }));
  const e = r.immo.corps.emb;
  near(e.vet, 400, "vétusté"); near(e.recup, 250, "récupérable"); near(e.nonRecup, 150, "non récupérable"); near(e.total, 850, "total");
});

test("pas de vétusté récupérable sur les dépendances et en gamme Nature", () => {
  near(IMH.compute(dossier({ immo: [L({ rub: "dep", q: 1, pu: 1000, vet: 20, tva: 0 })] })).immo.corps.immo.recup, 0, "dépendances");
  near(IMH.compute(dossier({ gamme: "NATURE", immo: [L({ rub: "mh-rep", q: 1, pu: 1000, vet: 20, tva: 0 })] })).immo.corps.immo.recup, 0, "Nature");
});

test("modes de réalisation : agréée, assuré, pose sans TVA", () => {
  const r = IMH.compute(dossier({ immo: [
    L({ rub: "hab-tce", q: 1, pu: 1000, vet: 10, real: "ag" }),
    L({ rub: "hab-tce", q: 1, pu: 1000, vet: 10, real: "fo" }),
    L({ rub: "hab-tce", q: 1, pu: 1000, vet: 10, real: "po" }),
  ] }));
  const row = (k) => r.pay.rows.find((x) => x.key === k);
  near(row("ag").acompte, 0, "agréée acompte"); near(row("ag").differe, 1100, "agréée différé (VVD + récupérable + TVA)");
  near(row("as").acompte, 990 + 900, "assuré acompte (fourniture TTC + pose HT)"); near(row("as").differe, 110 + 100, "assuré récupérable");
});

test("plafond d'une rubrique Nature réparti sur les règlements", () => {
  const r = IMH.compute(dossier({ gamme: "NATURE", immo: [L({ rub: "mh-frais", q: 1, pu: 4000, tva: 0 })] }));
  near(r.pay.totals.total, 3000, "plafond 3 000 €");
  assert.deepStrictEqual(r.depassements.map((x) => x.montant), [1000]);
});

test("aménagements extérieurs plafonnés sur la VVD TTC", () => {
  const r = IMH.compute(dossier({ gamme: "CONFIANCE", amen: [L({ cat: "amen", q: 1, pu: 5000, vet: 10, tva: 20 })] }));
  near(r.amen.cats[0].ttc, 5400, "VVD TTC"); near(r.amen.retenu, 4000, "plafond 4 000 €");
});

test("mobilier : seuil sans vétusté, 10 % par an, plafond 80 %", () => {
  const cat = IMH.R.gammes.CONFORT.mobilier.find((c) => c.id === "meubles");
  assert.strictEqual(IMH.suggestVet(cat, 4, "contrat"), 0);
  assert.strictEqual(IMH.suggestVet(cat, 6, "contrat"), 60);
  assert.strictEqual(IMH.suggestVet(cat, 12, "contrat"), 80);
  const info = IMH.R.gammes.CONFORT.mobilier.find((c) => c.id === "info");
  assert.strictEqual(IMH.suggestVet(info, 3, "contrat"), 30);
  assert.strictEqual(IMH.suggestVet(info, 1, "2017-socle"), 20);
  assert.strictEqual(IMH.suggestVet(info, 3, "2017-5ans"), 0);
  assert.strictEqual(IMH.ageYears("2020-06-15", "2026-06-14"), 5);
});

test("mobilier : plafonds en % du capital et capital souscrit", () => {
  const d = dossier({ gamme: "CONFIANCE", capitalMobilier: "15000", dateSinistre: "2026-01-01", mob: [
    L({ cat: "bijoux", valeur: 5000 }),
    L({ cat: "meubles", valeur: 2000, achat: "2020-01-01" }),
    L({ cat: "vetements", valeur: 1000, vet: 50 }),
  ] });
  const r = IMH.compute(d);
  near(r.mob.lines[d.mob[1].id].vetPct, 60, "vétusté proposée");
  near(r.mob.groupes[0].retenu, 3000, "bijoux : 20 % de 15 000 €");
  near(r.mob.retenu, 3000 + 800 + 500, "mobilier retenu");
  d.capitalMobilier = "1500"; // bijoux 300 + 800 + 500 = 1 600
  near(IMH.compute(d).mob.retenu, 1500, "limité au capital");
});

test("franchise déduite de l'acompte, remboursée au recours", () => {
  const d = dossier({ franchise: "150", franchiseRecours: true, autres: [L({ nat: "Frais de relogement", q: 2, pu: 100, tva: 10 })] });
  const r = IMH.compute(d);
  near(r.pay.totals.acompte, 70, "acompte"); near(r.pay.totals.recours, 150, "recours"); near(r.pay.totals.total, 220, "total");
});

test("import d'un barème CSV par zone", () => {
  const b = IMH.parseBaremeCsv("groupe;article;unité;rubrique;zone 1;zone 5\nMurs;Peinture mate/satinée;m²;hab-emb;18,5;21\nSols;Ragréage;m²;hab-emb;;12");
  assert.deepStrictEqual(b.zones, ["1", "5"]);
  assert.strictEqual(b.articles[0].prix["1"], 18.5);
  assert.deepStrictEqual(b.articles[1].prix, { 5: 12 });
  assert.deepStrictEqual(IMH.parseBaremeCsv(IMH.baremeCsv(b)).articles.map((a) => a.prix), b.articles.map((a) => a.prix));
});

console.log(`${n} tests passés`);
