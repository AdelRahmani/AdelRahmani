/** Règles de calcul : mêmes cas que le prototype web, chiffres vérifiés à la main. */
import { describe, expect, it } from 'vitest';
import {
  Beneficiary,
  CompensationGroup,
  MBV,
  RSE,
  applyGenericPct,
  assignGroup,
  beneficiaryTotals,
  ceilingOverrun,
  compensationError,
  damageAmounts,
  htFromTtc,
  irsiAmount,
  mbvAmounts,
  nextLineIndex,
  obsOverdraft,
  recalcOnTaxRegime,
  roomMeasures,
  scaleObsolescence,
  setCeiling,
  setContractAmount,
  setContractPct,
  setLevel1Ceiling,
  transverseObsolescence,
  verifyEstimate,
  yearsBetween,
  Damage,
  VerifyContext,
  findRule,
} from './index';

const close = (actual: number | null, expected: number) => expect(actual).toBeCloseTo(expected, 2);

describe('Prestation', () => {
  // 12,5 m² × 18,40 € HT, TVA 10 %, vétusté 20 %
  const d = { l1: 'Embellissements', qty: 12.5, unit: 18.4, vat: 10, obsPct: 20 };

  it('calcule HT, TTC et vétusté sur le TTC', () => {
    const a = damageAmounts(d, true);
    close(a.priceNoVAT, 230);
    close(a.priceWithVAT, 253);
    close(a.obsAmount, 50.6);
    close(a.priceWithObs, 202.4);
  });
  it('calcule la vétusté sur le HT en régime HT', () => {
    const a = damageAmounts(d, false);
    close(a.obsAmount, 46);
    close(a.priceWithObs, 184);
  });
  it('un montant de vétusté saisi remplace le pourcentage', () => {
    const a = damageAmounts({ ...d, obsAmountInput: 33.33 }, true);
    expect(a.obsPct).toBe(0);
    close(a.obsAmount, 33.33);
    close(a.priceWithObs, 219.67);
  });
  it('recalcule à la bascule HT/TTC, en gardant un montant saisi', () => {
    const line = {
      l1: 'X',
      priceNoVAT: 230,
      priceWithVAT: 253,
      obsPct: 20,
      obsAmount: 50.6,
    } as Damage;
    close(recalcOnTaxRegime(line, false).priceWithObs, 184);
    close(recalcOnTaxRegime({ ...line, obsPct: 0, obsAmount: 30 }, false).priceWithObs, 200);
  });
  it('applique une vétusté transverse', () => {
    close(
      transverseObsolescence({ qty: 12.5, unit: 18.4, vat: 10 }, 15, true).priceWithObs,
      215.05,
    );
  });
  it('bonification RSE : 1 % du montant retenu, sans vétusté', () => {
    const a = damageAmounts({ l1: RSE, qty: 1, unit: 2000, vat: 10 }, true);
    close(a.priceNoVAT, 20);
    close(a.priceWithVAT, 22);
    close(a.priceWithObs, 22);
  });
  it('montant IRSI : vétusté déduite HT pour le contenu, HT sinon', () => {
    const base = { l1: 'X', priceWithObs: 0 };
    close(
      irsiAmount(
        { l1: '', l2: '', damageREC: 'Materiel', synth1: 'Contenu' },
        { ...base, qty: 1, unit: 500, obsPct: 30 },
      ),
      350,
    );
    close(
      irsiAmount(
        { l1: '', l2: '', damageREC: 'Materiel', synth1: 'Bâtiment' },
        { ...base, qty: 2, unit: 500, obsPct: 30 },
      ),
      1000,
    );
    expect(
      irsiAmount(
        { l1: '', l2: '', damageREC: 'Immateriel' },
        { ...base, qty: 1, unit: 5, obsPct: 0 },
      ),
    ).toBeNull();
  });
});

describe('Index de ligne', () => {
  const lines = [
    { l1: 'A', l2: 'x', lineIndex: 'A01B01C01' },
    { l1: 'A', l2: 'x', lineIndex: 'A01B01C02' },
    { l1: 'A', l2: 'y', lineIndex: 'A01B02C01' },
  ];
  it.each([
    [[], 'A', 'x', 'A01B01C01'],
    [lines, 'A', 'x', 'A01B01C03'],
    [lines, 'A', 'z', 'A01B03C01'],
    [lines, 'B', 'x', 'A02B01C01'],
    [[], MBV, 'Mobilier', 'A99B01C01'],
  ])('%#', (existing, l1, l2, expected) => expect(nextLineIndex(existing, l1, l2)).toBe(expected));
});

describe('Mobilier', () => {
  it('valeur à neuf 415,83 HT, TVA 20 %, vétusté 30 %', () => {
    const a = mbvAmounts({ ht: 415.83, vat: 20, obsPct: 30 }, true);
    close(a.priceWithVAT, 499);
    close(a.obsAmount, 149.7);
    close(a.priceWithObs, 349.3);
    close(htFromTtc(499, 20), 415.8333);
  });
});

describe('Indemnisation', () => {
  // Ligne IP : 1 000 TTC, vétusté 250, vétusté déduite 750
  const mk = (mode: 'IP' | 'REN', o: Partial<CompensationGroup> = {}): CompensationGroup => ({
    key: 'k',
    riskObjectId: 'r',
    isMbv: false,
    l1: 'N',
    l2: 'D',
    mode,
    beneficiaryName: '',
    isTaxed: true,
    priceNoVATTotal: 909.09,
    priceWithTaxTotal: 1000,
    obsTotal: 250,
    priceWithObsTotal: 750,
    beneficiaryId: null,
    ceiling: null,
    level1Ceiling: null,
    cPct: null,
    cAmt: null,
    immediate: 0,
    deferred: 0,
    ...o,
  });
  const ben: Beneficiary = {
    id: 'b',
    type: 'ASSURE',
    name: 'X',
    linkedPartyId: null,
    stanceId: null,
    guarantee: null,
    discount: 10,
    penalization: 20,
    deductible: 150,
    deferredPenalization: 0,
    deferredDeductible: 0,
  };

  it('IP : vétusté récupérable en différé, sur la valeur à neuf ou la vétusté déduite', () => {
    let g = assignGroup(mk('IP'), 'b', 25, 1);
    close(g.cAmt, 250);
    close(g.immediate, 750);
    close(g.deferred, 250);
    g = assignGroup(mk('IP'), 'b', 25, 2);
    close(g.cAmt, 187.5);
    close(g.deferred, 187.5);
  });
  it('REN : tout en immédiat', () => {
    const g = assignGroup(mk('REN'), 'b', 25, 1);
    close(g.immediate, 1000);
    close(g.deferred, 0);
  });
  it('sans vétusté récupérable', () => {
    const g = assignGroup(mk('IP'), 'b', null, 1);
    close(g.immediate, 750);
    close(g.deferred, 0);
  });
  it('plafond : immédiat d’abord, le différé prend le reste', () => {
    let g = assignGroup(mk('IP', { ceiling: 800 }), 'b', 25, 1);
    close(g.immediate, 750);
    close(g.deferred, 50);
    g = assignGroup(mk('IP', { ceiling: 600 }), 'b', 25, 1);
    close(g.immediate, 600);
    close(g.deferred, 0);
    close(ceilingOverrun(g), 400);
  });
  it('saisies sur la ligne : %, montant, plafond', () => {
    let g = setContractPct(assignGroup(mk('IP'), 'b', null, 1), 10, 1);
    close(g.cAmt, 100);
    close(g.deferred, 100);
    close(obsOverdraft(g), 150);
    g = setContractAmount(assignGroup(mk('IP'), 'b', null, 1), 300, 1);
    close(g.cPct, 30);
    close(g.deferred, 250);
    g = setCeiling(assignGroup(mk('REN'), 'b', 25, 1), 900, 25, 1);
    close(g.immediate, 900);
  });
  it('plafond de nature réparti au prorata, arrondi à l’inférieur', () => {
    const g1 = assignGroup(mk('IP', { key: '1' }), 'b', 25, 1);
    const g2 = assignGroup(
      mk('IP', { key: '2', priceWithTaxTotal: 500, obsTotal: 0, priceWithObsTotal: 500 }),
      'b',
      25,
      1,
    );
    setLevel1Ceiling([g1, g2], 'N', 'b', 1000, 1);
    close(g1.immediate, 666.66);
    close(g1.deferred, 0);
    close(g2.immediate, 333.33);
  });
  it('% générique appliqué aux lignes du bénéficiaire', () => {
    const [g] = applyGenericPct([assignGroup(mk('IP'), 'b', null, 1)], 'b', 20, 1);
    close(g.cAmt, 200);
    close(g.deferred, 200);
    close(g.immediate, 750);
  });
  it('totaux : remise, pénalités, franchise, plancher à zéro', () => {
    const t = beneficiaryTotals([assignGroup(mk('IP'), 'b', 25, 1)], ben);
    close(t.totalImmediate, 505);
    close(t.totalDeferred, 225);
    close(
      beneficiaryTotals([assignGroup(mk('IP'), 'b', 25, 1)], { ...ben, deductible: 5000 })
        .totalImmediate,
      0,
    );
  });
  it('contrôles bloquants', () => {
    const ok = assignGroup(mk('IP'), 'b', 25, 1);
    expect(compensationError([ok], [{ ...ben, deductible: null }])).toMatch(
      /^Les montants de franchise/,
    );
    const tooMuch = assignGroup(mk('IP'), 'b', null, 1);
    tooMuch.immediate = 900;
    expect(compensationError([tooMuch], [ben])).toMatch(/^Les indemnités ne doivent pas/);
    const overCeiling = assignGroup(mk('IP', { ceiling: 700 }), 'b', null, 1);
    overCeiling.immediate = 720;
    expect(compensationError([overCeiling], [ben])).toContain('plafond');
    expect(compensationError([ok], [ben])).toBe('');
  });
});

describe('Vérification d’une estimation', () => {
  const base: VerifyContext = {
    damages: [{} as Damage],
    stances: [],
    beneficiaries: [],
    groups: [],
    damageEstimate: null,
    position: null,
    hasCoverages: false,
    coverages: [],
    riskObjectIds: ['r'],
  };
  const stance = { id: 's', coverageId: 'c', stance: 1 as const, comment: '', notCovered: null };
  it('chiffrages, garanties, ou les deux', () => {
    expect(verifyEstimate(base).status).toBe(2);
    expect(
      verifyEstimate({ ...base, damages: [], hasCoverages: true, stances: [stance] }).status,
    ).toBe(3);
    expect(verifyEstimate({ ...base, hasCoverages: true, stances: [stance] }).status).toBe(4);
  });
  it('indemnisations : tout ventilé et position renseignée', () => {
    const g = (beneficiaryId: string | null) =>
      ({ riskObjectId: 'r', beneficiaryId }) as CompensationGroup;
    const full: VerifyContext = {
      ...base,
      hasCoverages: true,
      coverages: [{ id: 'c', policyNumber: '', coverageType: '', coveredRiskObjects: [] }],
      stances: [stance],
      beneficiaries: [{ id: 'b' } as Beneficiary],
      groups: [g('b'), g(null)],
      position: 'Refus',
    };
    expect(verifyEstimate(full).errors).toHaveLength(1);
    expect(verifyEstimate({ ...full, groups: [g('b'), g('b')] }).status).toBe(5);
    expect(
      verifyEstimate({ ...full, groups: [g('b'), g('b')], position: null }).errors,
    ).toHaveLength(1);
  });
});

describe('Pièce', () => {
  it('3,6 × 2,8 × 2,5 m avec une porte de 0,83 × 2,04', () => {
    const m = roomMeasures({
      length: 3.6,
      width: 2.8,
      height: 2.5,
      surface: null,
      openings: [{ type: 'Porte', width: 0.83, height: 2.04 }],
    });
    close(m.floor, 10.08);
    close(m.perimeter, 12.8);
    close(m.walls, 30.31);
    close(m.skirting, 11.97);
  });
  it('surface seule : dimensions au nombre d’or', () => {
    close(roomMeasures({ length: null, width: null, height: 2.5, surface: 20 }).length, 5.69);
  });
});

describe('Barème de vétusté', () => {
  const rule = { l1: 'N', ratePerYear: 10, franchiseYears: 1, maxPct: 80 };
  it('taux × (âge − franchise), plafonné', () => {
    expect(scaleObsolescence(rule, 4)).toBe(30);
    expect(scaleObsolescence(rule, 0.5)).toBe(0);
    expect(scaleObsolescence(rule, 20)).toBe(80);
    expect(scaleObsolescence(null, 3)).toBeNull();
  });
  it('règle du détail, sinon de la nature', () => {
    const rules = [rule, { ...rule, l2: 'D', ratePerYear: 5 }];
    expect(findRule(rules, 'N', 'D')?.ratePerYear).toBe(5);
    expect(findRule(rules, 'N', 'Autre')?.ratePerYear).toBe(10);
  });
  it('âge en années entières révolues', () => {
    expect(yearsBetween('2022-11-15', '2026-10-02')).toBe(3);
    expect(yearsBetween('2022-10-02', '2026-10-02')).toBe(4);
    expect(yearsBetween('', '2026-10-02')).toBeNull();
  });
});
