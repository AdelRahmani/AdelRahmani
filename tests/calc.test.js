// Tests du moteur de calcul : node tests/calc.test.js
const EC = require("../src/calc.js");
const assert = require("assert");
let n = 0;
const eq = (a, b, msg) => { n++; assert.ok(Math.abs(a - b) < 0.005, `${msg}: attendu ${b}, obtenu ${a}`); };

// Prestation : 12,5 m² x 18,40 € HT, TVA 10 %, vétusté 20 %
let d = { l1: "Embellissements", qty: 12.5, unit: 18.4, vat: 10, obsPct: 20 };
let a = EC.damageAmounts(d, true);
eq(a.priceNoVAT, 230, "HT"); eq(a.priceWithVAT, 253, "TTC"); eq(a.obsAmount, 50.6, "vétusté TTC"); eq(a.priceWithObs, 202.4, "VD TTC");
a = EC.damageAmounts(d, false);
eq(a.obsAmount, 46, "vétusté HT"); eq(a.priceWithObs, 184, "VD HT");
// Montant de vétusté saisi : il remplace le %
a = EC.damageAmounts({ ...d, obsAmountInput: 33.33 }, true);
eq(a.obsPct, 0, "% remis à 0"); eq(a.obsAmount, 33.33, "montant saisi"); eq(a.priceWithObs, 219.67, "VD montant saisi");
// Bascule de régime fiscal : % recalculé, montant saisi conservé
let line = { l1: "X", priceNoVAT: 230, priceWithVAT: 253, obsPct: 20, obsAmount: 50.6 };
eq(EC.recalcOnTaxRegime(line, false).priceWithObs, 184, "bascule HT");
eq(EC.recalcOnTaxRegime({ ...line, obsPct: 0, obsAmount: 30 }, false).priceWithObs, 200, "bascule montant saisi");
// Vétusté transverse
eq(EC.transverseObsolescence({ qty: 12.5, unit: 18.4, vat: 10 }, 15, true).priceWithObs, 215.05, "transverse");
// Bonification RSE : 1 % de 2 000 € HT, TVA 10 %
a = EC.damageAmounts({ l1: EC.RSE, qty: 1, unit: 2000, vat: 10 }, true);
eq(a.priceNoVAT, 20, "RSE HT"); eq(a.priceWithVAT, 22, "RSE TTC"); eq(a.priceWithObs, 22, "RSE retenu");
// IRSI : contenu = vétusté déduite HT, sinon HT
eq(EC.irsiAmount({ damageREC: "Materiel", synth1: "Contenu" }, { qty: 1, unit: 500, obsPct: 30 }), 350, "IRSI contenu");
eq(EC.irsiAmount({ damageREC: "Materiel", synth1: "Bâtiment" }, { qty: 2, unit: 500, obsPct: 30 }), 1000, "IRSI bâtiment");
assert.strictEqual(EC.irsiAmount({ damageREC: "Immateriel" }, { qty: 1, unit: 5 }), null); n++;
// Index de ligne
const L = [{ l1: "A", l2: "x", lineIndex: "A01B01C01" }, { l1: "A", l2: "x", lineIndex: "A01B01C02" }, { l1: "A", l2: "y", lineIndex: "A01B02C01" }];
assert.strictEqual(EC.nextLineIndex([], "A", "x"), "A01B01C01");
assert.strictEqual(EC.nextLineIndex(L, "A", "x"), "A01B01C03");
assert.strictEqual(EC.nextLineIndex(L, "A", "z"), "A01B03C01");
assert.strictEqual(EC.nextLineIndex(L, "B", "x"), "A02B01C01");
assert.strictEqual(EC.nextLineIndex([], EC.MBV, "Mobilier"), "A99B01C01"); n += 5;
// Mobilier : 415,83 HT, TVA 20 %, vétusté 30 %
a = EC.mbvAmounts({ ht: 415.83, vat: 20, obsPct: 30 }, true);
eq(a.priceWithVAT, 499, "MBV TTC"); eq(a.obsAmount, 149.7, "MBV vétusté"); eq(a.priceWithObs, 349.3, "MBV VD");
eq(EC.htFromTtc(499, 20), 415.8333, "HT depuis TTC");

// Indemnisation. Ligne IP : 1 000 TTC, vétusté 250, VD 750
const mk = (mode, o) => Object.assign({ key: "k", l1: "N", l2: "D", mode, isTaxed: true, priceNoVATTotal: 909.09, priceWithTaxTotal: 1000, obsTotal: 250, priceWithObsTotal: 750, ceiling: null, level1Ceiling: null, cPct: null, cAmt: null, immediate: 0, deferred: 0 }, o);
let g = EC.assignGroup(mk("IP"), "b", 25, 1); // 25 % de la valeur à neuf = 250 récupérables
eq(g.cAmt, 250, "vét. contractuelle VàN"); eq(g.immediate, 750, "IP immédiat"); eq(g.deferred, 250, "IP différé");
g = EC.assignGroup(mk("IP"), "b", 25, 2); // 25 % de la valeur vétusté déduite = 187,50
eq(g.cAmt, 187.5, "vét. contractuelle VD"); eq(g.deferred, 187.5, "IP différé VD");
g = EC.assignGroup(mk("REN"), "b", 25, 1);
eq(g.immediate, 1000, "REN immédiat"); eq(g.deferred, 0, "REN différé");
g = EC.assignGroup(mk("IP"), "b", null, 1);
eq(g.immediate, 750, "sans vétusté récupérable"); eq(g.deferred, 0, "différé nul");
// Plafond : l'immédiat d'abord, le différé prend le reste
g = EC.assignGroup(mk("IP", { ceiling: 800 }), "b", 25, 1);
eq(g.immediate, 750, "plafond immédiat"); eq(g.deferred, 50, "plafond différé");
g = EC.assignGroup(mk("IP", { ceiling: 600 }), "b", 25, 1);
eq(g.immediate, 600, "plafond < VD"); eq(g.deferred, 0, "différé écrêté");
eq(EC.ceilingOverrun(g), 400, "dépassement plafond");
// Saisies sur la ligne
g = EC.setContractPct(EC.assignGroup(mk("IP"), "b", null, 1), 10, 1);
eq(g.cAmt, 100, "10 % VàN"); eq(g.deferred, 100, "différé 10 %"); eq(EC.obsOverdraft(g), 150, "vétusté non récupérable");
g = EC.setContractAmount(EC.assignGroup(mk("IP"), "b", null, 1), 300, 1);
eq(g.cPct, 30, "% déduit du montant"); eq(g.deferred, 250, "différé borné à la vétusté");
g = EC.setCeiling(EC.assignGroup(mk("REN"), "b", 25, 1), 900, 25, 1);
eq(g.immediate, 900, "REN plafonné");
// Plafond de nature : prorata arrondi à l'inférieur
const g1 = EC.assignGroup(mk("IP", { key: "1" }), "b", 25, 1), g2 = EC.assignGroup(mk("IP", { key: "2", priceWithTaxTotal: 500, obsTotal: 0, priceWithObsTotal: 500 }), "b", 25, 1);
EC.setLevel1Ceiling([g1, g2], "N", "b", 1000, 1); // parts : 666,66 et 333,33
eq(g1.immediate, 666.66, "prorata 1"); eq(g1.deferred, 0, "prorata différé"); eq(g2.immediate, 333.33, "prorata 2");
// Totaux bénéficiaire : remise 10 %, pénalité 20, franchise 150
const ben = { id: "b", discount: 10, penalization: 20, deductible: 150, deferredPenalization: 0, deferredDeductible: 0 };
const t = EC.beneficiaryTotals([EC.assignGroup(mk("IP"), "b", 25, 1)], ben);
eq(t.totalImmediate, 505, "total immédiat"); eq(t.totalDeferred, 225, "total différé");
eq(EC.beneficiaryTotals([EC.assignGroup(mk("IP"), "b", 25, 1)], { ...ben, deductible: 5000 }).totalImmediate, 0, "plancher à 0");
// Contrôles
assert.ok(EC.compensationError([g], [{ id: "b", deductible: null, deferredDeductible: 0 }]).startsWith("Les montants de franchise")); n++;
const bad = EC.assignGroup(mk("IP"), "b", null, 1); bad.immediate = 900;
assert.ok(EC.compensationError([bad], [ben]).startsWith("Les indemnités ne doivent pas")); n++;
const bad2 = EC.assignGroup(mk("IP", { ceiling: 700 }), "b", null, 1); bad2.immediate = 720;
assert.ok(EC.compensationError([bad2], [ben]).includes("plafond")); n++;
assert.strictEqual(EC.compensationError([EC.assignGroup(mk("IP"), "b", 25, 1)], [ben]), ""); n++;
// Vérification d'une estimation
const base = { damages: [{}], stances: [], beneficiaries: [], groups: [], damageEstimate: null, position: null, hasCoverages: false, coverages: [], riskObjectIds: ["r"] };
assert.strictEqual(EC.verifyEstimate(base).status, 2);
assert.strictEqual(EC.verifyEstimate({ ...base, damages: [], hasCoverages: true, stances: [{ stance: 1, coverageId: "c" }] }).status, 3);
assert.strictEqual(EC.verifyEstimate({ ...base, hasCoverages: true, stances: [{ stance: 1, coverageId: "c" }] }).status, 4);
const full = { ...base, hasCoverages: true, coverages: [{ id: "c", coveredRiskObjects: [] }], stances: [{ stance: 1, coverageId: "c" }], beneficiaries: [ben], groups: [{ riskObjectId: "r", beneficiaryId: "b" }, { riskObjectId: "r", beneficiaryId: null }], position: "Refus" };
assert.strictEqual(EC.verifyEstimate(full).errors.length, 1);
full.groups[1].beneficiaryId = "b";
assert.strictEqual(EC.verifyEstimate(full).status, 5);
assert.strictEqual(EC.verifyEstimate({ ...full, position: null }).errors.length, 1); n += 6;
// Pièce 3,6 x 2,8 x 2,5 avec une porte 0,83 x 2,04
const m = EC.roomMeasures({ length: 3.6, width: 2.8, height: 2.5, openings: [{ type: "Porte", width: 0.83, height: 2.04 }] });
eq(m.floor, 10.08, "sol"); eq(m.perimeter, 12.8, "périmètre"); eq(m.walls, 30.31, "murs"); eq(m.skirting, 11.97, "plinthes");
eq(EC.roomMeasures({ surface: 20, height: 2.5 }).length, 5.69, "nombre d'or");
console.log(n + " vérifications OK");
