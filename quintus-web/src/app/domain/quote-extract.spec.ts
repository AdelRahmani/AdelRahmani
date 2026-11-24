/** Lecture de devis : mêmes cas que le prototype, plus la proposition de nature. */
import { describe, expect, it } from 'vitest';
import { SAMPLE_REFERENTIALS } from '../data/reference-data';
import { QuoteLine, guessNature, itemsToText, parseLine, parseQuoteText } from './quote-extract';

const line = (s: string) => parseLine(s) as QuoteLine;

describe('Ligne de devis', () => {
  it('colonnes séparées par des tabulations (PDF)', () => {
    expect(line('Peinture acrylique murs 2 couches\t28,81\tm²\t19,24\t10 %\t554,30')).toMatchObject(
      {
        name: 'Peinture acrylique murs 2 couches',
        qty: 28.81,
        unit: 'm²',
        unitPrice: 19.24,
        vat: 10,
        total: 554.3,
      },
    );
    expect(line('Dépose parquet\t21,32 m²\t7,80 €\t166,30 €')).toMatchObject({
      name: 'Dépose parquet',
      qty: 21.32,
      unit: 'm²',
      unitPrice: 7.8,
      total: 166.3,
    });
  });
  it('milliers avec espace dans une colonne', () => {
    expect(line('Remplacement chaudière\t1\tU\t2 450,00\t20,00\t2 450,00')).toMatchObject({
      qty: 1,
      unitPrice: 2450,
      vat: 20,
      total: 2450,
      unit: 'U',
    });
  });
  it('texte collé : 2 × 150 = 300, pas 2 150', () => {
    expect(line('Bloc-porte intérieur 2 150,00 300,00')).toMatchObject({
      name: 'Bloc-porte intérieur',
      qty: 2,
      unitPrice: 150,
      total: 300,
    });
    expect(line('Fourniture carrelage 1 234,56 1 234,56')).toMatchObject({
      qty: 1,
      unitPrice: 1234.56,
      total: 1234.56,
    });
  });
  it('forfaits', () => {
    expect(line('Déplacement et mise en sécurité 85,00 €')).toMatchObject({
      name: 'Déplacement et mise en sécurité',
      qty: 1,
      unitPrice: 85,
      total: 85,
    });
    expect(line('Recherche de fuite  forfait  320.00')).toMatchObject({
      qty: 1,
      unit: 'FFT',
      unitPrice: 320,
    });
  });
  it('unité collée, TVA sans signe, total TTC en plus', () => {
    expect(line('Plinthes médium 15,37ml 11,65 179,06 10 196,97')).toMatchObject({
      qty: 15.37,
      unit: 'ml',
      unitPrice: 11.65,
      total: 179.06,
      vat: 10,
    });
  });
  it('quantité et prix sans total : à vérifier', () => {
    expect(line("Main d'oeuvre 3 h 45,00")).toMatchObject({
      qty: 3,
      unit: 'H',
      unitPrice: 45,
      total: 135,
      check: true,
    });
  });
  it('lignes sans montant', () => {
    expect(parseLine('12 rue des Tilleuls 69003 Lyon')).toHaveProperty('text');
    expect(parseLine('Lyon 69003')).toHaveProperty('text');
  });
});

describe('Document complet', () => {
  const doc = parseQuoteText(`RÉNO SERVICES SARL
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
  it('en-tête, lignes et totaux', () => {
    expect(doc).toMatchObject({
      kind: 'devis',
      number: 'D-2026-0142',
      date: '14/10/2026',
      supplier: 'RÉNO SERVICES SARL',
    });
    expect(doc.lines.map((l) => l.name)).toHaveLength(4);
    expect(doc.lines[2].name).toBe('Fourniture et pose parquet stratifié'); // désignation sur la ligne précédente
    expect(doc.totals).toEqual({ ht: 2108.18, ttc: 2319, vat: 210.82 });
    expect(doc.linesTotal).toBe(2108.18);
  });
});

describe('Fragments PDF', () => {
  it('reconstitue lignes et colonnes', () => {
    const t = itemsToText([
      { str: 'Peinture murs', x: 40, y: 500, w: 70, h: 9 },
      { str: '12,5', x: 300, y: 500.4, w: 20, h: 9 },
      { str: 'm²', x: 322, y: 500, w: 10, h: 9 },
      { str: '18,40', x: 380, y: 500, w: 25, h: 9 },
      { str: '230,00', x: 470, y: 500, w: 30, h: 9 },
      { str: 'Total HT', x: 380, y: 480, w: 40, h: 9 },
      { str: '230,00', x: 470, y: 480, w: 30, h: 9 },
    ]);
    expect(t).toBe('Peinture murs\t12,5 m²\t18,40\t230,00\nTotal HT\t230,00');
    const d = parseQuoteText(t);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].qty).toBe(12.5);
    expect(d.totals.ht).toBe(230);
  });
});

describe('Nature proposée', () => {
  const { benefits, prices } = SAMPLE_REFERENTIALS;
  it.each([
    ['Peinture acrylique murs, 2 couches', 'Embellissements', 'Peinture'],
    ['Fourniture et pose parquet stratifié', 'Embellissements', 'Revêtements de sols'],
    ['Recherche de fuite', 'Mesures conservatoires', 'Recherche de fuite'],
    ['Remplacement du bloc-porte de la cuisine', 'Immobilier', 'Menuiserie'],
  ])('%s', (name, l1, l2) => expect(guessNature(name, benefits, prices)).toEqual({ l1, l2 }));
  it('rien de ressemblant', () => expect(guessNature('Déplacement', benefits, prices)).toBeNull());
});
