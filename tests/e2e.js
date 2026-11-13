// Parcours complet dans un navigateur : node tests/e2e.js [dossier de captures]
const { chromium } = require("playwright");
const path = require("path"), assert = require("assert");
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("file://" + path.resolve(__dirname, "../index.html"));
  const shot = async (n) => out && p.screenshot({ path: path.join(out, n + ".png"), fullPage: true });
  const step = (s) => p.click(`#steps [data-step="${s}"]`);
  await shot("01-home");
  // Nouveau dossier
  await p.click('[data-act="new-case"]');
  await p.fill("#f-number", "TEST-001"); await p.fill("#f-insuredName", "Jean Test"); await p.fill("#f-address", "1 rue A"); await p.fill("#f-postalCode", "75011"); await p.fill("#f-city", "Paris");
  await p.click('#dlg button[type="submit"]');
  await step("parties");
  await p.click('[data-act="edit-cov"]'); await p.fill("#f-policyNumber", "C-1"); await p.selectOption("#f-coverageType", "Incendie"); await p.click('#dlg button[type="submit"]');
  await step("lieux");
  await p.click('[data-act="edit-room"]'); await p.fill("#f-name", "Salon"); await p.fill("#f-length", "5"); await p.fill("#f-width", "4"); await p.click('#dlg button[type="submit"]');
  await step("dommages");
  // Prestation du bordereau, quantité reprise des mesures : 20 m² x 18,50 = 370 HT, TVA 20 → 444 TTC, vétusté 25 % → 111 ; VD 333
  await p.click('[data-act="edit-dmg"]');
  await p.selectOption("#f-l1", "Embellissements"); await p.selectOption("#f-l2", "Peinture");
  await p.fill("#f-name", "Peinture acrylique plafond, 2 couches"); await p.dispatchEvent("#f-name", "change");
  await p.selectOption("#f-roomId", { label: "Salon" }); await p.selectOption("#f-measure", "ceiling|m²");
  assert.strictEqual(await p.inputValue("#f-qty"), "20"); assert.strictEqual(await p.inputValue("#f-unit"), "21");
  await p.fill("#f-unit", "18,5"); await p.fill("#f-obsPct", "25"); await p.selectOption("#f-mode", "IP");
  await p.click('#dlg button[type="submit"]');
  let txt = await p.innerText("#main");
  for (const s of ["370,00 €", "444,00 €", "111,00 €", "333,00 €"]) assert.ok(txt.includes(s), "dommages : " + s);
  // Bascule HT : vétusté 92,50, VD 277,50 ; puis retour TTC
  await p.click("#dm-tax-0"); txt = await p.innerText("#main"); assert.ok(txt.includes("277,50 €"), "bascule HT");
  await p.click("#dm-tax-1");
  // Mobilier : 500 TTC saisi → HT 416,67 ; vétusté 40 % → 200 ; VD 300
  await p.click('[data-act="dm-tab"][data-v="mbv"]'); await p.click('[data-act="edit-mbv"]');
  await p.selectOption("#f-l2", "Mobilier"); await p.fill("#f-name", "Canapé"); await p.selectOption("#f-goodStatus", "Non réparable"); await p.selectOption("#f-proof", "Justifiés en existence");
  await p.fill("#f-ttc", "500"); await p.dispatchEvent("#f-ttc", "change"); assert.strictEqual(await p.inputValue("#f-ht"), "416,67");
  await p.fill("#f-obsPct", "40"); await p.click('#dlg button[type="submit"]');
  txt = await p.innerText("#main"); assert.ok(txt.includes("300,00 €") && txt.includes("200,00 €"), "mobilier");
  await shot("02-dommages");
  // Garantie avec réserve : commentaire obligatoire
  await step("garanties"); await p.selectOption('select[data-k="stance"]', "2");
  assert.ok((await p.innerText("#main")).includes("commentaire est obligatoire"));
  await p.fill('input[data-k="comment"]', "Sous réserve du rapport"); await p.dispatchEvent('input[data-k="comment"]', "change");
  await step("beneficiaires"); await p.click('[data-act="add-ben"]'); await p.selectOption("#f-stanceId", { index: 1 }); await p.selectOption("#f-who", "insured"); await p.click('#dlg button[type="submit"]');
  // Indemnisation : vétusté récupérable 25 % de la valeur à neuf, tout ventilé
  await step("indemnisations");
  await p.fill("#gen-pct", "25"); await p.dispatchEvent("#gen-pct", "change");
  for (const sel of await p.$$eval('input[data-chg="comp-l1"]', (els) => els.map((e) => "#" + e.id))) await p.check(sel);
  txt = await p.innerText("#main"); assert.ok(txt.includes("franchise sont obligatoires"), "franchise requise");
  await p.fill("#bn-ded", "100"); await p.dispatchEvent("#bn-ded", "change"); await p.fill("#bn-dded", "0"); await p.dispatchEvent("#bn-dded", "change");
  // Peinture : immédiat 333, différé min(111, 111) = 111. Canapé : immédiat 300, différé min(200, 125) = 125
  const tot = await p.innerText(".totals"); assert.ok(tot.includes("633,00 €") && tot.includes("236,00 €") && tot.includes("533,00 €"), "totaux : " + tot);
  await shot("03-indemnisations");
  // Vérification : position manquante, puis OK
  await step("synthese"); await p.click('[data-act="verify"]');
  assert.ok((await p.innerText("#dlg")).includes("position de l'assuré")); await p.click('#dlg [data-act="dlg-close"]');
  await step("indemnisations"); await p.selectOption("#position", "Acceptation de l'indemnité");
  await step("synthese"); await p.click('[data-act="verify"]');
  assert.ok((await p.innerText(".estbar")).includes("Indemnisations vérifiées"));
  await p.click('[data-act="advance"]'); assert.ok((await p.innerText(".estbar")).includes("exportées"));
  await step("dommages"); assert.ok(await p.isDisabled('.head .btn.primary'), "verrouillé");
  await p.click('.estbar [data-act="dup-est"]'); assert.ok((await p.innerText("#main")).includes("Estimation 2"));
  await shot("04-synthese");
  // Persistance et dossier d'exemple
  await p.reload(); assert.ok((await p.innerText("#main")).includes("TEST-001"), "persistance");
  await p.click('[data-act="load-demo"]'); await shot("05-demo-dommages");
  for (const s of ["infos", "parties", "lieux", "estimations", "garanties", "beneficiaires", "indemnisations", "synthese"]) await step(s);
  await p.click(".logo"); await p.click('[data-act="refs"]'); await shot("06-refs");
  // Téléphone, thème sombre : pas de défilement horizontal
  const m = await b.newPage({ viewport: { width: 390, height: 800 }, colorScheme: "dark" });
  m.on("pageerror", (e) => errs.push(String(e)));
  await m.goto("file://" + path.resolve(__dirname, "../index.html")); await m.click('[data-act="load-demo"]');
  for (const s of ["dommages", "indemnisations", "synthese"]) { await m.click(`#steps [data-step="${s}"]`); const w = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(w <= 1, s + " déborde de " + w + "px"); }
  await m.click('#steps [data-step="dommages"]'); if (out) await m.screenshot({ path: path.join(out, "07-mobile-dark.png") });
  assert.deepStrictEqual(errs.filter((e) => !/fonts\.g|ERR_/.test(e)), []);
  await b.close(); console.log("Parcours complet OK");
})().catch((e) => { console.error(e); process.exit(1); });
