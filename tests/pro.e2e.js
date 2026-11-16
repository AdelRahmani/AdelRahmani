// Outils de chiffrage : node tests/pro.e2e.js [dossier contenant xlsx.full.min.js] [dossier de captures]
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), assert = require("assert");
(async () => {
  const [xlsxDir, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  if (xlsxDir) await p.route("https://cdnjs.cloudflare.com/ajax/libs/xlsx/**", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(xlsxDir, "xlsx.full.min.js")) }));
  await p.goto("file://" + path.resolve(__dirname, "../index.html"));
  await p.click('[data-act="load-demo"]');
  const main = () => p.innerText("#main");
  const lineId = (name) => p.evaluate((n) => ECApp.db.cases[0].estimates[0].damages.find((d) => d.name === n).id, name);
  const line = (name) => p.evaluate((n) => ECApp.db.cases[0].estimates[0].damages.find((d) => d.name === n), name);
  const closed = () => p.waitForSelector("#dlg:not([open])", { state: "attached" });

  // Saisie directe : 10 m² × 7,80 = 78,00 HT, puis vétusté 50 % → 85,80 TTC, 42,90 de vétusté
  const dep = await lineId("Dépose de parquet stratifié");
  await p.fill(`#ln-qty-${dep}`, "10"); await p.dispatchEvent(`#ln-qty-${dep}`, "change");
  await p.fill(`#ln-obsPct-${dep}`, "50"); await p.dispatchEvent(`#ln-obsPct-${dep}`, "change");
  let d = await line("Dépose de parquet stratifié");
  assert.deepStrictEqual([d.priceNoVAT, d.priceWithVAT, d.obsAmount, d.priceWithObs], [78, 85.8, 42.9, 42.9]);
  await p.fill(`#ln-qty-${dep}`, "abc"); await p.dispatchEvent(`#ln-qty-${dep}`, "change");
  assert.ok((await p.innerText("#toast")).includes("n'est pas valide")); assert.strictEqual(await p.inputValue(`#ln-qty-${dep}`), "10");
  // Annuler : deux retours en arrière rendent la quantité d'origine
  await p.click("#undo"); await p.click("#undo");
  assert.strictEqual((await line("Dépose de parquet stratifié")).qty, 21.32);

  // Chiffrage depuis le bordereau, quantité reprise du sol du séjour (21,32 m²)
  await p.click('[data-act="catalog"]'); await p.selectOption("#cat-room", { label: "Séjour" }); await p.fill("#cat-q", "pvc");
  assert.strictEqual(await p.locator("#cat-body tr").count(), 1);
  await p.selectOption("#cat-body .cat-m", "floor"); assert.strictEqual(await p.inputValue("#cat-body .cat-qty"), "21,32");
  await p.fill("#cat-q", "prise"); await p.fill("#cat-body .cat-qty", "3");
  assert.ok((await p.innerText("#cat-sum")).includes("2 prestation(s)"));
  await p.fill("#cat-obs", "10"); await p.click("#cat-go"); await closed();
  d = await line("Sol PVC en lés, fourniture et pose");
  assert.strictEqual(d.qty, 21.32); assert.strictEqual(d.obsPct, 10); assert.strictEqual(d.roomId, "rm2"); assert.ok((await main()).includes("Remplacement prise ou interrupteur"));
  if (out) await p.screenshot({ path: path.join(out, "09-tableau.png"), fullPage: true });

  // Modifier toute une nature : prix −10 %, mode REN
  const before = (await line("Peinture acrylique murs, 2 couches")).unit;
  await p.click('[data-act="bulk-nature"][data-l1="Embellissements"]'); await p.fill("#f-adjust", "-10"); await p.selectOption("#f-mode", "REN"); await p.click('#dlg button[type="submit"]'); await closed();
  d = await line("Peinture acrylique murs, 2 couches");
  assert.strictEqual(d.unit, Math.round(before * 0.9 * 100) / 100); assert.strictEqual(d.mode, "REN"); assert.strictEqual(d.obsPct, 20);
  // Monter une ligne
  const pid = await lineId("Peinture acrylique plafond, 2 couches"), idx = (await line("Peinture acrylique plafond, 2 couches")).lineIndex;
  await p.click(`[data-act="move-dmg"][data-dir="-1"][data-id="${pid}"]`);
  assert.ok((await line("Peinture acrylique plafond, 2 couches")).lineIndex < idx);
  // Réaffecter au tiers non assuré
  await p.click(`[data-act="reassign-dmg"][data-id="${pid}"]`); await p.selectOption("#f-tp", "tp2"); await p.click('#dlg button[type="submit"]'); await closed();
  d = await line("Peinture acrylique plafond, 2 couches"); assert.strictEqual(d.thirdPartyId, "tp2"); assert.strictEqual(d.riskObjectId, null);
  // Barème : peinture 10 % par an → 3 ans = 30 %
  await p.click('[data-act="edit-dmg"]:not([data-id])'); await p.selectOption("#f-l1", "Embellissements"); await p.selectOption("#f-l2", "Peinture");
  assert.ok((await p.innerText("#bar")).includes("10 % par an"));
  await p.fill("#f-age", "3"); assert.strictEqual(await p.inputValue("#f-obsPct"), "30");
  await p.fill("#f-age", "12"); assert.strictEqual(await p.inputValue("#f-obsPct"), "80");
  await p.click('#dlg [data-act="dlg-close"]');
  // Mobilier : date d'achat 4 ans avant le sinistre, électroménager 10 % après 1 an → 30 %
  await p.click('[data-act="dm-tab"][data-v="mbv"]'); await p.click('.head [data-act="edit-mbv"]');
  await p.selectOption("#f-l2", "Électroménager"); await p.fill("#f-purchaseDate", "2022-06-01"); await p.dispatchEvent("#f-purchaseDate", "change");
  assert.strictEqual(await p.inputValue("#f-obsPct"), "30"); assert.ok((await p.innerText("#bar")).includes("4 an(s)"));
  await p.click('#dlg [data-act="dlg-close"]');

  // Synthèse : écarts, comparaison, export Excel
  await p.click('#steps [data-step="synthese"]'); await p.click('[data-act="synth-tab"][data-v="claimed"]');
  let txt = await main(); assert.ok(/montant réclamé/i.test(txt) && txt.includes("5 200,00 €"));
  await p.click('[data-act="synth-tab"][data-v="compare"]'); await p.click('#main [data-act="dup-est"]');
  await p.click('#steps [data-step="synthese"]'); txt = await main(); assert.ok(/estimation 2/i.test(txt) && txt.includes("TOTAL TTC"), "comparaison");
  if (out) await p.screenshot({ path: path.join(out, "10-comparaison.png"), fullPage: true });
  const wb = await p.evaluate(() => { const c = ECApp.db.cases[0]; const w = ECApp.workbookData(c, c.estimates[0]); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.length])); });
  assert.deepStrictEqual(Object.keys(wb), ["Synthèse", "Dommages", "Indemnisations", "Localisations"]); assert.ok(wb.Dommages > 8 && wb.Localisations === 3);
  if (xlsxDir) {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-act="export-xlsx"]')]);
    assert.ok(dl.suggestedFilename().endsWith(".xlsx"), dl.suggestedFilename());
    const f = await dl.path(), head = fs.readFileSync(f).subarray(0, 2).toString(); assert.strictEqual(head, "PK"); assert.ok(fs.statSync(f).size > 5000);
  }
  // Référentiels : barèmes
  await p.click(".logo"); await p.click('[data-act="refs"]'); assert.ok((await main()).includes("Barèmes de vétusté"));
  assert.deepStrictEqual(errs, []);
  await b.close(); console.log("Outils de chiffrage OK");
})().catch((e) => { console.error(e); process.exit(1); });
