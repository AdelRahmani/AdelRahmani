import { describe, expect, it } from 'vitest';
import { Case, Damage, Estimate, Referentials } from './models';
import { MBV } from './constants';
import { isSinappsVat, sinappsIssues } from './sinapps';

const line = (o: Partial<Damage>): Damage => ({
  id: 'd',
  calculationId: 'k1',
  thirdPartyId: 'ins',
  riskObjectId: 'ro1',
  l1: 'Embellissements',
  l2: 'Peinture',
  name: 'Peinture murs',
  lineIndex: 'A01B01C01',
  mode: 'IP',
  qty: 10,
  unit: 20,
  vat: 10,
  obsPct: 20,
  obsAmount: 44,
  priceWithObs: 176,
  priceNoVAT: 200,
  priceWithVAT: 220,
  irsiAmount: null,
  ...o,
});
const kase = (
  damages: Damage[],
  taxRegimes: [boolean, boolean] = [true, true],
): [Case, Estimate] => {
  const e = {
    id: 'e',
    name: 'E1',
    status: 1,
    statusDate: '',
    active: true,
    damageEstimate: null,
    position: null,
    irsiBase: null,
    stances: [],
    beneficiaries: [],
    comps: {},
    calculations: [
      {
        id: 'k1',
        thirdPartyId: 'ins',
        riskObjectId: 'ro1',
        taxRegime: taxRegimes[0],
        claimedAmount: null,
        includedInIRSI: true,
        active: true,
      },
      {
        id: 'k2',
        thirdPartyId: 'ins',
        riskObjectId: 'ro2',
        taxRegime: taxRegimes[1],
        claimedAmount: null,
        includedInIRSI: true,
        active: true,
      },
    ],
    damages,
  } as Estimate;
  const c = {
    thirdParties: [{ id: 'ins', name: 'Camille Exemple', insured: true }],
    estimates: [e],
  } as unknown as Case;
  return [c, e];
};
const refs = (mapped: boolean): Referentials => ({
  benefits: [
    {
      l1: 'Embellissements',
      l2: 'Peinture',
      ...(mapped
        ? { sinappsNature: 'Embellissement', sinappsDetail: 'PeinturePapiersPeints' }
        : {}),
    },
    { l1: 'Embellissements', l2: 'Plafonds' },
  ],
  prices: [],
  repairers: [],
  obsolescence: [],
});
const rules = (c: Case, e: Estimate, r = refs(false)) => sinappsIssues(c, e, r).map((i) => i.rule);

describe('Contrôles Sinapps', () => {
  it('un chiffrage conforme ne lève rien', () => expect(rules(...kase([line({})]))).toEqual([]));
  it('taux de TVA acceptés', () => {
    expect([2, 2.1, 19.6, 20].every(isSinappsVat)).toBe(true);
    expect(isSinappsVat(8)).toBe(false);
    expect(rules(...kase([line({ vat: 8 })]))).toEqual(['RG_CHIFFRAGE_EXP_0068']);
  });
  it('nature et détail obligatoires', () =>
    expect(rules(...kase([line({ l2: '' })]))).toEqual(['DommageDetailParNature']));
  it('vétusté supérieure au montant', () =>
    expect(rules(...kase([line({ obsAmount: 230 })]))).toEqual(['RG_CHIFFRAGE_EXP_0004']));
  it('bien volé sans justificatif', () =>
    expect(
      rules(...kase([line({ l1: MBV, l2: 'Mobilier', goodStatus: 'Bien volé', proof: '' })])),
    ).toEqual(['RG_CHIFFRAGE_EXP_0058']));
  it("objet de risque obligatoire pour l'assuré", () =>
    expect(rules(...kase([line({ riskObjectId: null })]))).toEqual(['RG_CHIFFRAGE_EXP_0052']));
  it('même régime fiscal sur tous les objets de risque du bénéficiaire', () => {
    const lines = [line({}), line({ id: 'd2', calculationId: 'k2', riskObjectId: 'ro2' })];
    expect(rules(...kase(lines, [true, false]))).toEqual(['RG_CHIFFRAGE_EXP_0051']);
    expect(rules(...kase(lines, [true, true]))).toEqual([]);
  });
  it('correspondance Sinapps contrôlée seulement si le référentiel la porte', () => {
    const [c, e] = kase([line({}), line({ id: 'd2', l2: 'Plafonds' })]);
    expect(rules(c, e, refs(false))).toEqual([]);
    expect(sinappsIssues(c, e, refs(true)).map((i) => [i.rule, i.damageId])).toEqual([
      ['RG_CHIFFRAGE_EXP_0030', 'd2'],
    ]);
  });
});
