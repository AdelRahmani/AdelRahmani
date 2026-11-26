/* Parcours complet dans Chromium : node imh/tests/e2e.js (après python3 imh/build.py). */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  const text = (sel) => page.locator(sel).first().innerText();
  const fr = (s) => s.replace(/\s/g, " ");

  // Dossier d'exemple : travaux du classeur 7443 + mobilier et relogement
  await page.click('[data-act="tab"][data-v="recap"]');
  const na = await page.locator("tr", { hasText: "Travaux par entreprise non agréée" }).innerText();
  assert.ok(fr(na).includes("4 418,19") && fr(na).includes("2 061,82"), "règlement 7443 : " + na);
  console.log("ok récapitulatif du dossier 7443");

  // Nouvelle ligne immobilière saisie au clavier, recalcul en direct
  await page.click('[data-act="tab"][data-v="immo"]');
  await page.click('[data-act="add-line"][data-v="hab-emb"]');
  const id = await page.locator('[data-f="des"]:focus').getAttribute("data-id");
  await page.keyboard.type("Peinture murs chambre");
  await page.fill(`[data-id="${id}"][data-f="q"]`, "20");
  await page.fill(`[data-id="${id}"][data-f="pu"]`, "25");
  await page.fill(`[data-id="${id}"][data-f="vet"]`, "40");
  assert.strictEqual(fr(await text(`[data-o="immo:${id}:recup"]`)), "125,00 €", "vétusté récupérable limitée à 25 %");
  assert.strictEqual(fr(await text(`[data-o="immo:${id}:total"]`)), "467,50 €");
  console.log("ok saisie d'une prestation d'embellissement");

  // Barème : import CSV collé, puis ajout depuis le barème avec le prix de la zone du dossier
  await page.click('[data-act="tab"][data-v="bareme"]');
  await page.click('[data-act="import-csv"]');
  await page.fill("#csv-text", "groupe;article;unité;rubrique;zone 1;zone 5\nMurs;Peinture mate/satinée;m²;hab-emb;18;21,5\nSols;Ragréage;m²;hab-emb;9;11");
  await page.click('#dlg button[value="ok"]');
  await page.click('[data-act="tab"][data-v="immo"]');
  await page.click('[data-act="bareme-pick"][data-v="hab-emb"]');
  await page.fill("#pq-c1", "12");
  await page.click('#dlg button[value="ok"]');
  const last = page.locator('tr:has([data-f="des"][value="Peinture mate/satinée"])');
  assert.strictEqual(await last.locator('[data-f="pu"]').inputValue(), "21.5", "prix de la zone 5");
  console.log("ok barème importé et utilisé");

  // Gamme Nature : rubriques mobil-home, plafond 3 000 €
  await page.click('[data-act="new"]');
  await page.selectOption("#d-gamme", "NATURE");
  await page.fill("#d-franchise", "0");
  await page.click('[data-act="tab"][data-v="immo"]');
  await page.click('[data-act="add-line"][data-v="mh-frais"]');
  const nid = await page.locator('[data-f="des"]:focus').getAttribute("data-id");
  await page.fill(`[data-id="${nid}"][data-f="q"]`, "1");
  await page.fill(`[data-id="${nid}"][data-f="pu"]`, "3500");
  await page.selectOption(`[data-id="${nid}"][data-f="tva"]`, "0");
  assert.ok(fr(await text("#strip")).includes("3 000,00 €"), "plafond Nature appliqué");
  assert.ok(fr(await text("#strip")).includes("1 plafond dépassé"));
  console.log("ok gamme Nature plafonnée");

  // Mobilier : vétusté proposée d'après la date d'achat
  await page.click('[data-act="tab"][data-v="dossier"]');
  await page.selectOption("#d-gamme", "CONFORT");
  await page.fill("#d-dateSinistre", "2026-11-01");
  await page.click('[data-act="tab"][data-v="mob"]');
  await page.click('[data-act="add-line"][data-sec="mob"]');
  const mid = await page.locator('[data-f="des"]:focus').getAttribute("data-id");
  await page.fill(`[data-id="${mid}"][data-f="valeur"]`, "1000");
  await page.fill(`[data-id="${mid}"][data-f="achat"]`, "2019-05-01");
  assert.strictEqual(await page.getAttribute(`[data-id="${mid}"][data-f="vet"]`, "placeholder"), "auto 70");
  assert.strictEqual(fr(await text(`[data-o="mob:${mid}:indem"]`)), "300,00 €");
  console.log("ok vétusté mobilière proposée");

  // Persistance après rechargement
  await page.reload();
  assert.strictEqual(await page.locator("#dossier-pick option").count(), 2, "deux dossiers enregistrés");
  console.log("ok dossiers conservés");

  // Largeur téléphone : pas de défilement horizontal de la page
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('[data-act="tab"][data-v="recap"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, "débordement horizontal de " + overflow + " px");
  console.log("ok largeur téléphone");

  assert.deepStrictEqual(errors, [], "erreurs dans la page");
  await browser.close();
  console.log("parcours terminé");
})().catch((e) => { console.error(e); process.exit(1); });
