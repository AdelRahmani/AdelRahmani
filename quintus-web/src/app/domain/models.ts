/**
 * Modèle de données du chiffrage.
 * Même forme que l'export JSON du prototype web : un dossier exporté depuis le prototype
 * s'importe tel quel. Les noms des tables Dataverse d'origine sont indiqués en commentaire.
 */

export type Id = string;
/** REN : réparation en nature · IP : indemnité pécuniaire */
export type CompensationMode = 'REN' | 'IP';
/** 1 = sans réserve, 2 = avec réserve, 3 = garantie non applicable (ava_coverageapplicationstances) */
export type StanceValue = 1 | 2 | 3;
/** 1 valeur à neuf, 2 valeur vétusté déduite : assiette de la vétusté contractuelle */
export type ContractBase = 1 | 2;
export type BeneficiaryType = 'ASSURE' | 'RENEUR' | 'EDP' | 'CDG' | 'AUTRE';
/** 1 Réparateur agréé, 2 Artisan, 3 Entreprise en délégation de paiement, 4 Centre de gestion, 5 Autre */
export type LinkedPartyType = 1 | 2 | 3 | 4 | 5;

/** crbbf_Cases */
export interface Case {
  id: Id;
  number: string;
  demo?: boolean;
  type: string;
  eventDate: string;
  address: string;
  department: string;
  zone: number;
  irsiEnabled: boolean;
  comments: string;
  expert: string;
  referenceEstimateId?: Id;
  thirdParties: ThirdParty[];
  riskObjects: RiskObject[];
  coverages: Coverage[];
  linkedParties: LinkedParty[];
  rooms: Room[];
  estimates: Estimate[];
}

/** crbbf_ThirdParties */
export interface ThirdParty {
  id: Id;
  name: string;
  insured: boolean;
  role: string;
  type: string;
  insurance: string;
  contract: string;
  vat: number | null;
  ceiling: number | null;
}

/** ava_RiskObjects */
export interface RiskObject {
  id: Id;
  riskType: string;
  address1: string;
  postalCode?: string;
  city?: string;
}

/** ava_Coverages */
export interface Coverage {
  id: Id;
  policyNumber: string;
  coverageType: string;
  complementary?: string;
  precision?: string;
  insurerLabel?: string;
  /** vide = tous les objets de risque */
  coveredRiskObjects: Id[];
}

/** ava_LinkedParties */
export interface LinkedParty {
  id: Id;
  type: LinkedPartyType;
  lastName: string;
  firstName?: string;
}

export interface Opening {
  type: string;
  width: number;
  height: number;
}

/** crbbf_Rooms (+ crbbf_Surfaces simplifiées en ouvertures) */
export interface Room {
  id: Id;
  name: string;
  roomType: string;
  length: number | null;
  width: number | null;
  height: number | null;
  surface: number | null;
  openings?: Opening[];
}

/** crbbf_Estimates */
export interface Estimate {
  id: Id;
  name: string;
  /** ava_estimateinformationstatuses, 1 à 17 */
  status: number;
  statusDate: string;
  active: boolean;
  damageEstimate: number | null;
  position: string | null;
  irsiBase: number | null;
  calculations: Calculation[];
  damages: Damage[];
  stances: Stance[];
  beneficiaries: Beneficiary[];
  /** ventilations, par clé de regroupement (crbbf_Compensations) */
  comps: Record<string, CompensationEntry>;
}

/** ava_Calculations : un tiers (et pour l'assuré un objet de risque) dans une estimation */
export interface Calculation {
  id: Id;
  thirdPartyId: Id;
  riskObjectId: Id | null;
  /** true = règlement TTC */
  taxRegime: boolean;
  claimedAmount: number | null;
  includedInIRSI: boolean;
  active: boolean;
}

/** crbbf_Dammages */
export interface Damage {
  id: Id;
  calculationId: Id;
  thirdPartyId: Id;
  riskObjectId: Id | null;
  l1: string;
  l2: string;
  name: string;
  lineIndex: string;
  mode: CompensationMode;
  qty: number;
  um?: string;
  /** prix unitaire HT (valeur à neuf HT pour un bien mobilier) */
  unit: number;
  vat: number;
  obsPct: number;
  obsAmount: number;
  priceWithObs: number;
  priceNoVAT: number;
  priceWithVAT: number;
  irsiAmount: number | null;
  repairer?: string;
  beneficiaryName?: string;
  roomId?: Id | null;
  co2?: number | null;
  csr?: string | null;
  age?: number | null;
  source?: string;
  // mobilier et biens volés
  lineIdentifier?: Id;
  goodStatus?: string;
  proof?: string;
  brand?: string;
  reference?: string;
  purchaseDate?: string;
  claimedAmount?: number | null;
  eqBrand?: string;
  eqReference?: string;
}

/** ava_CoveragesStances */
export interface Stance {
  id: Id;
  coverageId: Id;
  stance: StanceValue | null;
  comment: string;
  notCovered: number | null;
}

/** crbbf_Beneficiaries */
export interface Beneficiary {
  id: Id;
  type: BeneficiaryType;
  name: string;
  linkedPartyId: Id | null;
  stanceId: Id | null;
  guarantee: string | null;
  deductible: number | null;
  deferredDeductible: number | null;
  penalization: number | null;
  deferredPenalization: number | null;
  discount: number | null;
}

export interface CompensationEntry {
  beneficiaryId: Id | null;
  ceiling: number | null;
  level1Ceiling: number | null;
  cPct: number | null;
  cAmt: number | null;
  immediate: number;
  deferred: number;
}

/** Ligne indemnisable : regroupement des dommages de l'assuré */
export interface CompensationGroup extends CompensationEntry {
  key: string;
  riskObjectId: Id | null;
  isMbv: boolean;
  l1: string;
  l2: string;
  mode: CompensationMode;
  beneficiaryName: string;
  isTaxed: boolean;
  priceNoVATTotal: number;
  priceWithTaxTotal: number;
  obsTotal: number;
  priceWithObsTotal: number;
}

/* ---------- Référentiels ---------- */

/** crbbf_Benefits */
export interface Benefit {
  l1: string;
  l2: string;
  synth1?: string;
  damageREC?: 'Materiel' | 'Immateriel' | string;
  /** RECFeature : "true" si réservé aux dossiers IRSI, "false" si exclu, vide sinon */
  rec?: string;
}

/** crbbf_Prices : prix HT par zone 1 à 5 */
export interface Price {
  repairer: string;
  l1: string;
  l2: string;
  name: string;
  unit: string;
  prices: number[];
  co2?: number | null;
  csr?: string | null;
}

/** crbbf_Repairers */
export interface Repairer {
  name: string;
  description?: string;
}

/** Barème de vétusté : taux × (âge − franchise), plafonné */
export interface ObsolescenceRule {
  l1: string;
  l2?: string;
  ratePerYear: number;
  franchiseYears: number;
  maxPct: number;
}

export interface Referentials {
  benefits: Benefit[];
  prices: Price[];
  repairers: Repairer[];
  obsolescence: ObsolescenceRule[];
}
