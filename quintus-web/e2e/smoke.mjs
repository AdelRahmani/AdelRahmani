// Parcours de bout en bout sur le build : npm run build && node e2e/smoke.mjs [dossier de captures]
import { createRequire } from 'node:module';
// Playwright préinstallé sur le poste ou la CI (npm i -D playwright sinon)
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const out = process.argv[2];
const server = await serve();
const browser = await chromium.launch();
const errors = [];
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on(
    'console',
    (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()),
  );
  const shot = (n) => out && p.screenshot({ path: join(out, n + '.png'), fullPage: true });
  const main = () => p.innerText('main');
  await p.goto('http://localhost:4321/');
  await p.waitForSelector('text=Aucun dossier');

  // Dossier d'exemple : mêmes montants que le prototype
  await p.click("text=Charger le dossier d'exemple");
  await p.waitForURL(/\/dommages$/);
  let txt = await main();
  for (const s of ['2 673,69 €', '2 941,06 €', '2 465,34 €'])
    assert.ok(txt.includes(s), 'total ' + s);
  await shot('ng-01-dommages');

  // Saisie directe : 10 m² × 7,80 = 78,00 HT ; 85,80 TTC
  const qty = p.getByRole('row', { name: /Dépose de parquet/ }).getByLabel('Quantité');
  await qty.fill('10');
  await qty.press('Tab');
  await p.waitForSelector('text=78,00 €');
  assert.ok((await main()).includes('85,80 €'));
  // Annuler (Ctrl+Z hors champ, puis bouton)
  await p.click('h1');
  await p.keyboard.press('Control+z');
  await p.waitForSelector('text=166,30 €');
  // Valeur invalide : refusée, message affiché
  await qty.fill('abc');
  await qty.press('Tab');
  await p.waitForSelector('.toast:has-text("n\'est pas valide")');
  assert.equal(await qty.inputValue(), '21,32');

  // Ajout d'une prestation du bordereau, quantité reprise du plafond de la cuisine (10,08 m²), barème 3 ans
  await p.click('text=Ajouter une prestation');
  await p.selectOption('#d-l1', 'Embellissements');
  await p.selectOption('#d-l2', 'Plafonds');
  await p.fill('#d-name', 'Faux plafond plaque de plâtre BA13');
  await p.locator('#d-name').dispatchEvent('change');
  assert.equal(await p.inputValue('#d-unit'), '54.08'.replace('.', ','));
  await p.selectOption('#d-room', { label: 'Cuisine' });
  await p.selectOption('#d-measure', 'ceiling');
  assert.equal(await p.inputValue('#d-qty'), '10,08');
  await p.fill('#d-age', '3');
  await p.locator('#d-age').dispatchEvent('change');
  assert.equal(await p.inputValue('#d-obs'), '15');
  // 10,08 × 54,08 = 545,13 HT ; TTC 10 % = 599,64 ; vétusté 15 % = 89,95 ; VD 509,69
  const preview = await p.innerText('dialog .preview');
  for (const s of ['545,13 €', '599,64 €', '89,95 €', '509,69 €'])
    assert.ok(preview.includes(s), 'aperçu ' + s + ' / ' + preview);
  await p.click('dialog button[type=submit]');
  await p.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
  assert.ok((await main()).includes('Faux plafond plaque de plâtre BA13'));

  // Bascule HT : la vétusté se recalcule sur le HT (89,95 → 81,77)
  await p.click('.seg >> text=HT');
  await p.waitForSelector('text=81,77 €');
  await p.click('.seg >> text=TTC');

  // Synthèse : vérification → statut, puis verrouillage
  await p.click('a.step:has-text("Synthèse")');
  await p.click("text=Vérifier l'estimation");
  await p.waitForSelector('.estbar >> text=Chiffrages vérifiés');
  await p.click('text=Exporter et verrouiller');
  await p.waitForSelector('.estbar >> text=exportés');
  await shot('ng-02-synthese');
  await p.click('a.step:has-text("Dommages")');
  assert.ok(await p.isDisabled('text=Ajouter une prestation'), 'estimation verrouillée');
  await p.click('.estbar >> text=Dupliquer');
  await p.waitForSelector('.estbar >> text=Brouillon');

  // Persistance après rechargement
  await p.reload();
  await p.waitForSelector('text=Faux plafond plaque de plâtre BA13');

  // Écran pas encore porté
  await p.click('a.step:has-text("Indemnisations")');
  await p.waitForSelector('text=Écran à porter');

  // Téléphone, thème sombre : pas de défilement horizontal de la page
  const m = await browser.newPage({ viewport: { width: 390, height: 800 }, colorScheme: 'dark' });
  m.on('pageerror', (e) => errors.push(String(e)));
  await m.goto('http://localhost:4321/');
  await m.click("text=Charger le dossier d'exemple");
  await m.waitForURL(/\/dommages$/);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, 'débordement ' + overflow);
  if (out) await m.screenshot({ path: join(out, 'ng-03-mobile.png') });

  assert.deepEqual(errors, []);
  console.log('Parcours Angular OK');
} finally {
  await browser.close();
  server.close();
}
