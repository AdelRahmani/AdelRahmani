// Tests de la lecture de devis / factures : node tests/extract.test.js
const X = require("../src/extract.js");
const assert = require("assert");
let n = 0;
const line = (s, exp) => { const p = X.parseLine(s); n++;
  for (const k of Object.keys(exp)) assert.ok(typeof exp[k] === "number" ? Math.abs(p[k] - exp[k]) < 0.005 : p[k] === exp[k], `${JSON.stringify(s)} → ${k}: attendu ${exp[k]}, obtenu ${p[k]}`); };

// colonnes séparées par tabulations (PDF)
line("Peinture acrylique murs 2 couches\t28,81\tm²\t19,24\t10 %\t554,30", { name: "Peinture acrylique murs 2 couches", qty: 28.81, unit: "m²", unitPrice: 19.24, vat: 10, total: 554.3 });
line("Dépose parquet\t21,32 m²\t7,80 €\t166,30 €", { name: "Dépose parquet", qty: 21.32, unit: "m²", unitPrice: 7.8, total: 166.3 });
// milliers avec espace dans une même colonne
line("Remplacement chaudière\t1\tU\t2 450,00\t20,00\t2 450,00", { qty: 1, unitPrice: 2450, vat: 20, total: 2450, unit: "U" });
// texte collé, espaces simples : 2 × 150 = 300 et non 2 150
line("Bloc-porte intérieur 2 150,00 300,00", { name: "Bloc-porte intérieur", qty: 2, unitPrice: 150, total: 300 });
line("Fourniture carrelage 1 234,56 1 234,56", { qty: 1, unitPrice: 1234.56, total: 1234.56 });
// forfait : un seul montant
line("Déplacement et mise en sécurité 85,00 €", { name: "Déplacement et mise en sécurité", qty: 1, unitPrice: 85, total: 85 });
line("Recherche de fuite  forfait  320.00", { qty: 1, unit: "FFT", unitPrice: 320 });
// unité collée, TVA en colonne sans signe, total TTC en plus
line("Plinthes médium 15,37ml 11,65 179,06 10 196,97", { qty: 15.37, unit: "ml", unitPrice: 11.65, total: 179.06, vat: 10 });
// quantité et prix sans total
line("Main d'oeuvre 3 h 45,00", { qty: 3, unit: "H", unitPrice: 45, total: 135, check: true });
// lignes sans montant
assert.ok(X.parseLine("12 rue des Tilleuls 69003 Lyon").text !== undefined); assert.ok(X.parseLine("Lyon 69003").text !== undefined); n += 2;

const doc = X.parseQuoteText(`RÉNO SERVICES SARL
12 avenue de la République 69003 Lyon
SIRET 123 456 789 00012
Tél : 04 78 00 00 00
DEVIS N° D-2026-0142\tDate : 14/10/2026
Client : Camille Exemple
Désignation\tQté\tU\tP.U. HT\tTVA\tTotal HT
Cuisine
Lessivage et préparation des supports\t28,81\tm²\t6,45\t10 %\t185,82
Peinture acrylique murs, 2 couches\t28,81\tm²\t19,24\t10 %\t554,30
Séjour
Fourniture et pose parquet stratifié
\t21,32\tm²\t43,68\t10 %\t931,26
Déshumidificateur 7 jours\t2\tU\t218,40\t10 %\t436,80
Sous-total\t2 108,18
Total HT\t2 108,18 €
TVA 10 %\t210,82 €
Total TTC\t2 319,00 €
Conditions de règlement : 30 % à la commande
IBAN FR76 0000 0000 0000`);
assert.strictEqual(doc.kind, "devis"); assert.strictEqual(doc.number, "D-2026-0142"); assert.strictEqual(doc.date, "14/10/2026"); assert.strictEqual(doc.supplier, "RÉNO SERVICES SARL");
assert.strictEqual(doc.lines.length, 4, JSON.stringify(doc.lines.map((l) => l.name)));
assert.strictEqual(doc.lines[2].name, "Fourniture et pose parquet stratifié"); // désignation sur la ligne précédente
assert.strictEqual(doc.totals.ht, 2108.18); assert.strictEqual(doc.totals.ttc, 2319); assert.strictEqual(doc.totals.vat, 210.82);
assert.strictEqual(doc.linesTotal, 2108.18); n += 9;

// fragments PDF → lignes et colonnes
const t = X.itemsToText([{ str: "Peinture murs", x: 40, y: 500, w: 70, h: 9 }, { str: "12,5", x: 300, y: 500.4, w: 20, h: 9 }, { str: "m²", x: 322, y: 500, w: 10, h: 9 }, { str: "18,40", x: 380, y: 500, w: 25, h: 9 }, { str: "230,00", x: 470, y: 500, w: 30, h: 9 }, { str: "Total HT", x: 380, y: 480, w: 40, h: 9 }, { str: "230,00", x: 470, y: 480, w: 30, h: 9 }]);
assert.strictEqual(t, "Peinture murs\t12,5 m²\t18,40\t230,00\nTotal HT\t230,00"); n++;
const d2 = X.parseQuoteText(t); assert.strictEqual(d2.lines.length, 1); assert.strictEqual(d2.lines[0].qty, 12.5); assert.strictEqual(d2.totals.ht, 230); n += 3;
// réponse de l'analyse par Claude
const m = X.fromModel({ kind: "facture", supplier: "X", totalHT: 100, lines: [{ designation: "Pose", quantity: 2, unit: "h", unitPriceHT: 50, vatRate: 20, totalHT: 100 }, { designation: "", totalHT: 5 }] });
assert.strictEqual(m.lines.length, 1); assert.strictEqual(m.lines[0].unit, "H"); assert.strictEqual(m.kind, "facture"); n += 3;
console.log(n + " vérifications OK");
