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

  // Import d'un devis PDF, sans IA : six lignes, total identique au document, nature proposée
  await p.click('text=Importer un devis ou une facture');
  await p.click('text=Extraire les lignes');
  await p.waitForSelector('text=Choisissez un document ou collez son texte.');
  await p.setInputFiles('#qi-file', join(import.meta.dirname, 'fixtures/devis-exemple.pdf'));
  await p.click('text=Extraire les lignes');
  await p.waitForSelector('#qi-name-5');
  assert.equal(await p.locator('dialog[open] tbody tr').count(), 6);
  let banner = await p.innerText('dialog[open] .banner');
  assert.ok(banner.includes('3 172,68') && banner.includes('Identique'), banner);
  assert.ok((await p.innerText('dialog[open]')).includes('Devis n° D-2026-0142 RÉNO SERVICES SARL'));
  assert.equal(await p.inputValue('#qi-pu-4'), '1 250,00');
  assert.equal(await p.inputValue('#qi-unit-5'), 'FFT');
  assert.equal(await p.inputValue('#qi-vat-5'), '20');
  assert.equal(await p.inputValue('#qi-nat-1'), 'Embellissements›Peinture');
  assert.equal(await p.inputValue('#qi-nat-4'), 'Immobilier›Menuiserie');
  // une ligne écartée : l'écart avec le document est signalé ; sans nature, l'intégration est refusée
  await p.uncheck('#qi-keep-5');
  await p.waitForSelector('dialog[open] .banner:has-text("5 lignes")');
  banner = await p.innerText('dialog[open] .banner');
  assert.ok(banner.includes('5 lignes') && banner.includes('écart'), banner);
  await p.selectOption('#qi-nat-4', '');
  await p.click('dialog[open] >> text=Intégrer 5 lignes au chiffrage');
  await p.waitForSelector('text=Choisissez une nature par défaut');
  await p.selectOption('#qi-nat', 'Immobilier›Menuiserie');
  await p.fill('#qi-obs', '20'); await p.locator('#qi-obs').dispatchEvent('change');
  await p.check('#qi-claimed');
  await p.click('dialog[open] >> text=Intégrer 5 lignes au chiffrage');
  await p.waitForSelector('text=Remplacement du bloc-porte de la cuisine');
  // bloc-porte : 1 250 HT, 1 375 TTC, vétusté 20 % = 275, vétusté déduite 1 100
  txt = await main();
  for (const s of ['1 375,00 €', '275,00 €', '1 100,00 €', 'Devis n° D-2026-0142 RÉNO SERVICES SARL']) assert.ok(txt.includes(s), 'import ' + s);
  assert.equal(await p.inputValue('#dm-claimed'), '3 498,45');
  // texte collé, espaces simples
  await p.click('text=Importer un devis ou une facture');
  await p.fill('#qi-text', 'FACTURE N° F-88\nRecherche de fuite 1 320,00 320,00\nMain d\'oeuvre plomberie 3 h 45,00 135,00\nTotal HT 455,00');
  await p.click('text=Extraire les lignes');
  await p.waitForSelector('#qi-name-1');
  assert.ok((await p.innerText('dialog[open] .banner')).includes('Identique'));
  assert.equal(await p.inputValue('#qi-nat-0'), 'Mesures conservatoires›Recherche de fuite');
  await p.click('dialog[open] >> text=Annuler');

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

  // Ouverture depuis le bouton Eureka : même dossier à chaque clic, pas de doublon
  await p.goto('http://localhost:4321/ouvrir?assignmentNumber=27fp260071606a01&env=P');
  await p.waitForURL(/\/dossiers\/[^/]+\/dommages$/);
  const firstUrl = p.url();
  assert.equal(await p.title(), '27FP260071606A01 · Dommages · Eureka Chiffrage');
  assert.ok((await p.innerText('header')).includes('27FP260071606A01'));
  await p.goBack();
  assert.ok(!p.url().includes('/ouvrir'), 'la page d’ouverture ne reste pas dans l’historique');
  await p.goto('http://localhost:4321/ouvrir?assignmentNumber=27FP260071606A01');
  await p.waitForURL(/\/dommages$/);
  assert.equal(p.url(), firstUrl);
  await p.goto('http://localhost:4321/dossiers');
  await p.waitForSelector('.case-card');
  assert.equal(await p.locator('.case-card', { hasText: '27FP260071606A01' }).count(), 1);
  await p.goto('http://localhost:4321/ouvrir');
  await p.waitForSelector('text=Le numéro de mission est absent');
  await p.goto('http://localhost:4321/ouvrir?assignmentNumber=%3Cscript%3E');
  await p.waitForSelector("text=n'est pas un numéro de mission valide");

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
