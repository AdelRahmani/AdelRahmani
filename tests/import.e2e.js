// Import d'un devis dans le chiffrage : node tests/import.e2e.js [dossier pdf.js] [dossier de captures]
// Sans dossier pdf.js local (pdf.min.js + pdf.worker.min.js), la bibliothèque est chargée depuis le CDN.
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), assert = require("assert");
(async () => {
  const [pdfjsDir, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  if (pdfjsDir) await p.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(pdfjsDir, path.basename(r.request().url()))) }));
  await p.goto("file://" + path.resolve(__dirname, "../index.html"));
  await p.click('[data-act="load-demo"]');
  const before = await p.locator("tr.l3").count();

  // 1. PDF : six lignes, total identique à celui du document
  await p.click('[data-act="import-doc"]');
  await p.click("#imp-run"); assert.ok((await p.innerText("#imp-status")).includes("Choisissez un document"));
  await p.setInputFiles("#imp-doc-file", path.resolve(__dirname, "fixtures/devis-exemple.pdf"));
  await p.click("#imp-run"); await p.waitForSelector("#ir-body tr");
  assert.strictEqual(await p.locator("#ir-body tr").count(), 6);
  let chk = await p.innerText("#ir-check"); assert.ok(chk.includes("3 172,68 €") && chk.includes("Identique"), chk);
  assert.ok((await p.innerText("#dlg")).includes("Devis n° D-2026-0142 RÉNO SERVICES SARL"));
  assert.strictEqual(await p.inputValue("#ir-pu-4"), "1 250,00"); assert.strictEqual(await p.inputValue("#ir-um-5"), "FFT"); assert.strictEqual(await p.inputValue("#ir-vat-5"), "20");
  assert.strictEqual(await p.inputValue("#ir-nat-1"), "Embellissements›Peinture"); assert.strictEqual(await p.inputValue("#ir-nat-3"), "Embellissements›Revêtements de sols");
  if (out) await p.screenshot({ path: path.join(out, "08-import-controle.png") });
  // une ligne écartée : l'écart avec le document est signalé
  await p.uncheck("#ir-on-5"); chk = await p.innerText("#ir-check"); assert.ok(chk.includes("5 lignes") && chk.includes("écart"), chk);
  // nature manquante → message, puis intégration avec vétusté 20 %
  await p.selectOption("#ir-nat-4", ""); await p.click("#imp-go"); assert.ok((await p.innerText("#imp-status")).includes("nature par défaut"));
  await p.selectOption("#ig-nat", "Immobilier›Menuiserie"); await p.fill("#ig-obs", "20"); await p.check("#ig-claimed");
  await p.click("#imp-go"); await p.waitForSelector("#dlg:not([open])", { state: "attached" });
  assert.strictEqual(await p.locator("tr.l3").count(), before + 5);
  let txt = await p.innerText("#main");
  // bloc-porte : 1 250 HT, 1 375 TTC, vétusté 20 % = 275, vétusté déduite 1 100
  for (const s of ["Remplacement du bloc-porte de la cuisine", "1 375,00 €", "275,00 €", "1 100,00 €", "Menuiserie", "Devis n° D-2026-0142"]) assert.ok(txt.includes(s), s);
  assert.strictEqual(await p.inputValue("#dm-claimed"), "3 498,45");

  // 2. Texte collé, espaces simples
  await p.click('[data-act="import-doc"]');
  await p.fill("#imp-doc-text", "FACTURE N° F-88\nRecherche de fuite 1 320,00 320,00\nMain d'oeuvre plomberie 3 h 45,00 135,00\nTotal HT 455,00");
  await p.click("#imp-run"); await p.waitForSelector("#ir-body tr");
  assert.strictEqual(await p.locator("#ir-body tr").count(), 2); assert.ok((await p.innerText("#ir-check")).includes("Identique"));
  assert.strictEqual(await p.inputValue("#ir-nat-0"), "Mesures conservatoires›Recherche de fuite");
  await p.selectOption("#ig-nat", "Immobilier›Plomberie - Sanitaire"); await p.click("#imp-go"); await p.waitForSelector("#dlg:not([open])", { state: "attached" });
  txt = await p.innerText("#main"); assert.ok(txt.includes("Facture n° F-88") && txt.includes("Main d'oeuvre plomberie"));
  // 3. Document sans ligne chiffrée
  await p.click('[data-act="import-doc"]'); await p.fill("#imp-doc-text", "Bonjour, veuillez trouver notre proposition."); await p.click("#imp-run");
  assert.ok((await p.innerText("#imp-status")).includes("Aucune ligne chiffrée"));
  assert.deepStrictEqual(errs, []);
  await b.close(); console.log("Import devis / facture OK");
})().catch((e) => { console.error(e); process.exit(1); });
