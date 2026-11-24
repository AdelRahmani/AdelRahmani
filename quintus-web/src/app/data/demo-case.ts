/** Dossier fictif chiffré, pour découvrir l'outil (aucune donnée réelle). */
import {
  Case,
  MBV,
  Referentials,
  calculationActive,
  mbvAmounts,
  mbvIrsiAmount,
  nextLineIndex,
  roomMeasures,
} from '../domain';
import { uid } from '../shared/format';
import { benefitOf, getCalc, newEstimate, upsertDamage } from '../state/case-ops';
import { demoCaseSkeleton } from './reference-data';

export function buildDemoCase(refs: Referentials): Case {
  const c = demoCaseSkeleton();
  const e = newEstimate(c);
  e.id = 'demo-est';
  c.estimates.push(e);
  c.referenceEstimateId = e.id;
  const insuredScope = { thirdPartyId: 'tp1', riskObjectId: 'ro1' };
  getCalc(e, 'tp1', 'ro1').claimedAmount = 5200;
  const add = (
    scope: typeof insuredScope | { thirdPartyId: string; riskObjectId: null },
    name: string,
    q: number,
    roomId: string,
    obsPct: number,
    mode: 'REN' | 'IP',
  ) => {
    const p = refs.prices.find((x) => x.name === name);
    if (!p) return;
    upsertDamage(c, e, refs, scope, {
      l1: p.l1,
      l2: p.l2,
      name: p.name,
      repairer: p.repairer,
      mode,
      qty: q,
      um: p.unit,
      unit: p.prices[c.zone - 1],
      vat: 10,
      obsPct,
      obsAmountInput: null,
      beneficiaryName: '',
      roomId,
      co2: p.co2,
      csr: p.csr,
    });
  };
  const kitchen = roomMeasures(c.rooms[0]);
  const living = roomMeasures(c.rooms[1]);
  add(insuredScope, 'Lessivage et préparation des supports', kitchen.walls, 'rm1', 0, 'IP');
  add(insuredScope, 'Peinture acrylique murs, 2 couches', kitchen.walls, 'rm1', 20, 'IP');
  add(insuredScope, 'Peinture acrylique plafond, 2 couches', kitchen.ceiling, 'rm1', 20, 'IP');
  add(insuredScope, 'Dépose de parquet stratifié', living.floor, 'rm2', 0, 'REN');
  add(insuredScope, 'Parquet stratifié, fourniture et pose', living.floor, 'rm2', 25, 'REN');
  add(insuredScope, 'Plinthes médium à peindre', living.skirting, 'rm2', 25, 'REN');
  add(insuredScope, 'Déshumidificateur, pose et location 7 jours', 2, 'rm1', 0, 'IP');
  add(
    { thirdPartyId: 'tp2', riskObjectId: null },
    "Remplacement flexible et robinet d'arrêt",
    1,
    'rm1',
    0,
    'IP',
  );
  const calc = getCalc(e, 'tp1', 'ro1');
  const good = (
    l2: string,
    name: string,
    ht: number,
    obsPct: number,
    goodStatus: string,
    proof: string,
  ) => {
    const a = mbvAmounts({ ht, vat: 20, obsPct }, calc.taxRegime);
    e.damages.push({
      id: uid(),
      lineIdentifier: uid(),
      calculationId: calc.id,
      thirdPartyId: 'tp1',
      riskObjectId: 'ro1',
      l1: MBV,
      l2,
      name,
      goodStatus,
      proof,
      qty: 1,
      um: 'U',
      unit: ht,
      vat: 20,
      mode: 'IP',
      beneficiaryName: '',
      roomId: 'rm1',
      obsPct: a.obsPct,
      obsAmount: a.obsAmount,
      priceWithObs: a.priceWithObs,
      priceNoVAT: a.priceNoVAT,
      priceWithVAT: a.priceWithVAT,
      lineIndex: nextLineIndex(
        e.damages.filter((x) => x.l1 === MBV),
        MBV,
        l2,
      ),
      irsiAmount: mbvIrsiAmount(benefitOf(refs, MBV, l2), { ht, obsPct }),
    });
  };
  good(
    'Électroménager',
    'Lave-linge 8 kg',
    415.83,
    30,
    'Non réparable',
    'Justifiés en existence et valeur',
  );
  good('Mobilier', 'Meuble bas de cuisine', 190, 40, 'Non réparable', 'Justifiés en existence');
  e.calculations.forEach((k) => (k.active = calculationActive(k, e.damages)));
  e.status = 1;
  return c;
}
