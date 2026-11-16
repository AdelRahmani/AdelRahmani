/* Eureka Chiffrage — moteur de calcul.
   Règles reprises des formules Power Fx de l'app canvas (v2.7.4.0).
   Fonctions pures, sans accès au DOM : testables sous Node. */
(function (root) {
  "use strict";

  const MBV = "Dommages mobiliers et biens volés";
  const RSE = "Bonification RSE";
  const OPENING_TYPES = ["Porte", "Porte fenêtre", "Baie coulissante"];

  // Statuts d'une estimation (EstimateInformationStatuses)
  const STATUS = {
    1: { label: "Brouillon", cat: "Brouillon" },
    2: { label: "Chiffrages vérifiés", cat: "Vérifiée" },
    3: { label: "Garanties vérifiées", cat: "Vérifiée" },
    4: { label: "Chiffrages et garanties vérifiés", cat: "Vérifiée" },
    5: { label: "Indemnisations vérifiées", cat: "Vérifiée" },
    6: { label: "Chiffrages exportés vers Excel", cat: "Exportée" },
    7: { label: "Garanties exportées vers Excel", cat: "Exportée" },
    8: { label: "Chiffrages et garanties exportés vers Excel", cat: "Exportée" },
    9: { label: "Indemnisations exportées vers Excel", cat: "Exportée" },
    10: { label: "Chiffrages communiqués à l'assureur", cat: "Communiquée" },
    11: { label: "Garanties communiquées à l'assureur", cat: "Communiquée" },
    12: { label: "Chiffrages et garanties communiqués à l'assureur", cat: "Communiquée" },
    13: { label: "Indemnisations communiquées à l'assureur", cat: "Communiquée" },
    14: { label: "Chiffrages figés", cat: "Figée" },
    15: { label: "Garanties figées", cat: "Figée" },
    16: { label: "Chiffrages et garanties figés", cat: "Figée" },
    17: { label: "Indemnisations figées", cat: "Figée" },
  };
  const isReadOnly = (s) => s >= 6; // ReadOnlyEstimateInformationStatuses
  const STANCES = {
    1: { label: "Sans réserve", compensable: true },
    2: { label: "Avec réserve", compensable: true },
    3: { label: "Garantie non applicable", compensable: false },
  };

  const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);
  const blank = (x) => x === null || x === undefined || x === "";
  const round = (x, d) => {
    const f = Math.pow(10, d);
    const v = num(x) * f;
    return (Math.sign(v) * Math.round(Math.abs(v) + 1e-9)) / f;
  };
  const r2 = (x) => round(x, 2);
  const r1 = (x) => round(x, 1);
  const roundDown2 = (x) => Math.floor(num(x) * 100 + 1e-7) / 100;
  const sum = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);

  /* ---------- Lignes de dommages (prestations) ---------- */

  // Colonnes calculées Dataverse PriceNoVAT / PriceWithVAT
  function linePrices(d) {
    const ht = d.l1 === RSE ? num(d.unit) / 100 : num(d.unit) * num(d.qty);
    return { priceNoVAT: r2(ht), priceWithVAT: r2(ht * (1 + num(d.vat) / 100)) };
  }

  /* Montants d'une ligne selon le régime fiscal du calcul (ttc = true → TTC).
     obsAmountInput non vide = montant de vétusté saisi (il remplace le %). */
  function damageAmounts(d, ttc) {
    const p = linePrices(d);
    if (d.l1 === RSE) {
      // 1 % RSE : pas de vétusté, le montant retenu est le montant de la bonification
      const amount = ttc ? p.priceWithVAT : p.priceNoVAT;
      return { ...p, base: amount, obsPct: 0, obsAmount: amount, priceWithObs: amount };
    }
    const base = r2(num(d.unit) * num(d.qty) * (ttc ? 1 + num(d.vat) / 100 : 1));
    const entered = !blank(d.obsAmountInput);
    const obsPct = entered ? 0 : num(d.obsPct);
    const obsAmount = entered ? num(d.obsAmountInput) : r2((base * obsPct) / 100);
    return { ...p, base, obsPct, obsAmount, priceWithObs: r2(base - obsAmount) };
  }

  // Changement de régime fiscal HT/TTC : recalcul de la vétusté de chaque ligne
  function recalcOnTaxRegime(d, ttc) {
    if (d.l1 === RSE) {
      const a = damageAmounts(d, ttc);
      return { obsAmount: a.obsAmount, priceWithObs: a.priceWithObs };
    }
    const price = r2(ttc ? d.priceWithVAT : d.priceNoVAT);
    const amountEntered = num(d.obsPct) === 0 && num(d.obsAmount) > 0;
    const obsAmount = amountEntered ? d.obsAmount : r2((price * num(d.obsPct)) / 100);
    return { obsAmount, priceWithObs: r2(price - obsAmount) };
  }

  // Vétusté transverse appliquée à toute une nature (niveau 1)
  function transverseObsolescence(d, pct, ttc) {
    const base = num(d.qty) * num(d.unit) * (ttc ? 1 + num(d.vat) / 100 : 1);
    return {
      obsPct: r1(pct),
      obsAmount: r2((base * pct) / 100),
      priceWithObs: r2(base * (1 - pct / 100)),
    };
  }

  // Montant retenu pour l'assiette IRSI
  function irsiAmount(benefit, d) {
    if (!benefit || benefit.damageREC !== "Materiel") return null;
    const content = benefit.synth1 === "Contenu" || benefit.synth1 === "Contenu professionnel";
    if (d.l1 === RSE) return content ? num(d.priceWithObs) : num(d.unit);
    return content ? num(d.unit) * num(d.qty) * (1 - num(d.obsPct) / 100) : num(d.unit) * num(d.qty);
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  // Index de ligne AxxBxxCxx (nature / détail / prestation)
  function nextLineIndex(damages, l1, l2) {
    const sorted = damages.slice().sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
    if (l1 === MBV) {
      const same = sorted.filter((d) => d.l2 === l2);
      if (same.length) {
        const last = same[same.length - 1].lineIndex;
        return last.slice(0, 7) + pad2(+last.slice(-2) + 1);
      }
      const last = sorted.length ? +sorted[sorted.length - 1].lineIndex.slice(4, 6) : 0;
      return "A99B" + pad2(last + 1) + "C01";
    }
    const a = sorted.find((d) => d.l1 === l1);
    if (!a) {
      if (!sorted.length) return "A01B01C01";
      return "A" + pad2(+sorted[sorted.length - 1].lineIndex.slice(1, 3) + 1) + "B01C01";
    }
    const aIdx = a.lineIndex.slice(0, 3);
    const b = sorted.filter((d) => d.l1 === l1 && d.l2 === l2);
    if (!b.length) {
      const inA = sorted.filter((d) => d.lineIndex.slice(0, 3) === aIdx);
      return aIdx + "B" + pad2(+inA[inA.length - 1].lineIndex.slice(4, 6) + 1) + "C01";
    }
    const last = b[b.length - 1].lineIndex;
    return last.slice(0, 7) + pad2(+last.slice(-2) + 1);
  }

  /* ---------- Mobilier et biens volés ---------- */
  function mbvAmounts(m, ttc) {
    const ht = num(m.ht);
    const hasVat = !blank(m.vat);
    const ttcAmount = r2(ht * (1 + num(m.vat) / 100));
    const base = ttc ? ttcAmount : ht;
    const entered = !blank(m.obsAmountInput);
    const obsPct = entered ? 0 : num(m.obsPct);
    const obsAmount = entered ? num(m.obsAmountInput) : r2((base * obsPct) / 100);
    return {
      priceNoVAT: r2(ht), priceWithVAT: hasVat ? ttcAmount : r2(ht), base, obsPct, obsAmount,
      priceWithObs: r2(base - obsAmount),
    };
  }
  const htFromTtc = (ttcAmount, vat) => num(ttcAmount) / (1 + num(vat) / 100);
  function mbvIrsiAmount(benefit, m) {
    if (!benefit || benefit.damageREC !== "Materiel") return null;
    const content = benefit.synth1 === "Contenu" || benefit.synth1 === "Contenu professionnel";
    return content ? num(m.ht) * (1 - num(m.obsPct) / 100) : num(m.ht);
  }

  /* ---------- Indemnisation ---------- */

  /* Regroupe les dommages de l'assuré en lignes indemnisables.
     comps : { [groupKey]: {beneficiaryId, ceiling, level1Ceiling, cPct, cAmt, immediate, deferred} } */
  function buildGroups(damages, calcById, comps) {
    const map = new Map();
    const sorted = damages.filter((d) => !blank(d.name)).sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
    for (const d of sorted) {
      const isMbv = d.l1 === MBV;
      const key = isMbv
        ? [d.riskObjectId, d.l2, d.name].join("_").trim()
        : [d.riskObjectId, d.l1, d.l2, d.mode, d.beneficiaryName || ""].join("_").trim();
      let g = map.get(key);
      if (!g) {
        const calc = calcById[d.calculationId] || {};
        g = {
          key, riskObjectId: d.riskObjectId, isMbv,
          l1: isMbv ? d.l2 : d.l1, l2: isMbv ? d.name : d.l2,
          mode: d.mode, beneficiaryName: isMbv ? "" : d.beneficiaryName || "",
          isTaxed: !!calc.taxRegime,
          priceNoVATTotal: 0, priceWithTaxTotal: 0, obsTotal: 0, priceWithObsTotal: 0,
        };
        map.set(key, g);
      }
      g.priceNoVATTotal += num(d.priceNoVAT);
      g.priceWithTaxTotal += num(d.priceWithVAT);
      g.obsTotal += num(d.obsAmount);
      g.priceWithObsTotal += num(d.priceWithObs);
    }
    const out = [];
    for (const g of map.values()) {
      ["priceNoVATTotal", "priceWithTaxTotal", "obsTotal", "priceWithObsTotal"].forEach((k) => (g[k] = r2(g[k])));
      const c = (comps && comps[g.key]) || {};
      g.beneficiaryId = c.beneficiaryId || null;
      g.ceiling = blank(c.ceiling) ? null : c.ceiling;
      g.level1Ceiling = blank(c.level1Ceiling) ? null : c.level1Ceiling;
      g.cPct = blank(c.cPct) ? null : c.cPct;
      g.cAmt = blank(c.cAmt) ? null : c.cAmt;
      g.immediate = num(c.immediate);
      g.deferred = num(c.deferred);
      out.push(g);
    }
    return out;
  }

  const gBase = (g) => (g.isTaxed ? g.priceWithTaxTotal : g.priceNoVATTotal);
  // Assiette de la vétusté contractuelle : 1 = valeur à neuf, 2 = valeur vétusté déduite
  const cBase = (g, option) => (option === 1 ? gBase(g) : g.priceWithObsTotal);
  const isREN = (g) => String(g.mode) === "REN";

  function capToCeiling(g, ceiling) {
    if (!blank(ceiling) && g.immediate + g.deferred > ceiling) {
      if (g.immediate > ceiling) { g.immediate = ceiling; g.deferred = 0; }
      else g.deferred = r2(ceiling - g.immediate);
    }
  }
  const noCeiling = (c) => blank(c) || c === 0;

  // Ventilation d'une ligne vers un bénéficiaire (case cochée)
  function assignGroup(g, beneficiaryId, genericPct, option) {
    const cAmt = r2((cBase(g, option) * num(genericPct)) / 100);
    const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
    g.beneficiaryId = beneficiaryId;
    g.cPct = blank(genericPct) ? null : genericPct;
    g.cAmt = cAmt;
    g.deferred = isREN(g) ? 0 : recoverable;
    const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
    g.immediate = noCeiling(g.ceiling) ? imm : Math.min(g.ceiling, imm);
    g.immediate = r2(g.immediate); g.deferred = r2(g.deferred);
    capToCeiling(g, g.ceiling);
    return g;
  }
  function unassignGroup(g) {
    g.beneficiaryId = null; g.immediate = 0; g.deferred = 0;
    return g;
  }

  // Saisie du % de vétusté contractuelle (récupérable) sur une ligne
  function setContractPct(g, pct, option) {
    const p = r1(pct);
    const cAmt = r2((cBase(g, option) * p) / 100);
    const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
    g.cPct = p; g.cAmt = cAmt;
    g.deferred = r2(isREN(g) ? 0 : recoverable);
    g.immediate = r2(isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal);
    capToCeiling(g, g.ceiling);
    return g;
  }

  // Saisie du montant de vétusté contractuelle
  function setContractAmount(g, amount, option) {
    const base = cBase(g, option);
    g.cAmt = amount;
    if (g.priceWithTaxTotal > 0 && base > 0) g.cPct = r1((100 * amount) / base);
    g.deferred = r2(isREN(g) ? 0 : Math.min(g.obsTotal, amount));
    if (isREN(g)) g.immediate = r2(g.priceWithObsTotal + Math.min(g.obsTotal, amount));
    capToCeiling(g, g.ceiling);
    return g;
  }

  // Saisie du plafond d'une ligne (null = pas de plafond)
  function setCeiling(g, ceiling, genericPct, option) {
    const cAmt = r2((cBase(g, option) * num(genericPct)) / 100);
    const recoverable = Math.min(g.obsTotal, cAmt);
    g.ceiling = blank(ceiling) ? null : ceiling;
    g.deferred = r2(isREN(g) ? 0 : recoverable);
    const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
    g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling, imm));
    capToCeiling(g, g.ceiling);
    return g;
  }

  // Plafond d'une nature : réparti au prorata entre les lignes du bénéficiaire (arrondi inférieur)
  function setLevel1Ceiling(groups, l1, beneficiaryId, value, option) {
    const lines = groups.filter((g) => g.l1 === l1 && g.beneficiaryId === beneficiaryId);
    const lineMax = (g) => Math.min(
      gBase(g), blank(g.ceiling) ? gBase(g) : g.ceiling,
      g.priceWithObsTotal + r2((cBase(g, option) * num(g.cPct)) / 100));
    const total = sum(lines, lineMax);
    for (const g of lines) {
      g.level1Ceiling = blank(value) ? null : value;
      if (!(total > 0)) continue;
      const cAmt = r2((cBase(g, option) * num(g.cPct)) / 100);
      const recoverable = Math.min(g.obsTotal, cAmt);
      const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.priceWithObsTotal;
      g.deferred = r2(isREN(g) ? 0 : recoverable);
      if (blank(value)) {
        // plafond de nature retiré : retour aux montants de la ligne
        g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling, imm));
        capToCeiling(g, g.ceiling);
        continue;
      }
      const share = roundDown2(value * (lineMax(g) / total));
      g.immediate = r2(noCeiling(g.ceiling) ? Math.min(imm, share) : Math.min(g.ceiling, imm, share));
      capToCeiling(g, share);
    }
    return groups;
  }

  // Application d'un % de vétusté contractuelle à toutes les lignes du bénéficiaire
  function applyGenericPct(groups, beneficiaryId, genericPct, option) {
    for (const g of groups.filter((x) => x.beneficiaryId === beneficiaryId)) {
      const pct = blank(genericPct) ? g.cPct : genericPct;
      const cAmt = r2((cBase(g, option) * num(pct)) / 100);
      const recoverable = Math.min(gBase(g) - g.priceWithObsTotal, cAmt);
      g.cPct = pct; g.cAmt = cAmt;
      g.deferred = r2(isREN(g) ? 0 : recoverable);
      const imm = isREN(g) ? g.priceWithObsTotal + recoverable : g.immediate;
      g.immediate = r2(noCeiling(g.ceiling) ? imm : Math.min(g.ceiling, imm));
      capToCeiling(g, g.ceiling);
    }
    return groups;
  }

  const ceilingOverrun = (g) => (blank(g.ceiling) ? 0 : Math.max(0, r2(gBase(g) - g.ceiling)));
  const obsOverdraft = (g) => Math.max(0, r2(g.obsTotal - num(g.cAmt)));

  // Totaux d'un bénéficiaire : remise, pénalités, franchise
  function beneficiaryTotals(groups, ben) {
    const mine = groups.filter((g) => g.beneficiaryId === ben.id);
    const k = 1 - num(ben.discount) / 100;
    const subImmediate = sum(mine, (g) => g.immediate);
    const subDeferred = sum(mine, (g) => g.deferred);
    return {
      damages: r2(sum(mine, gBase)), obs: r2(sum(mine, (g) => g.obsTotal)),
      contractObs: r2(sum(mine, (g) => g.cAmt)), overdraft: r2(sum(mine, obsOverdraft)),
      ceilingOverrun: r2(sum(mine, ceilingOverrun)),
      subImmediate: r2(subImmediate), subDeferred: r2(subDeferred),
      discountedImmediate: r2(subImmediate * k), discountedDeferred: r2(subDeferred * k),
      totalImmediate: r2(Math.max(subImmediate * k - num(ben.penalization) - num(ben.deductible), 0)),
      totalDeferred: r2(Math.max(subDeferred * k - num(ben.deferredPenalization) - num(ben.deferredDeductible), 0)),
    };
  }

  // Contrôles de l'écran Indemnisations (premier message bloquant)
  function compensationError(groups, beneficiaries) {
    if (beneficiaries.some((b) => blank(b.deductible) || blank(b.deferredDeductible)))
      return "Les montants de franchise sont obligatoires, veuillez saisir 0 si non applicable";
    const assigned = groups.filter((g) => g.beneficiaryId);
    const overCeiling = assigned.some((g) =>
      (!blank(g.level1Ceiling) && r2(sum(assigned.filter((x) => x.l1 === g.l1 && x.beneficiaryId === g.beneficiaryId),
        (x) => x.immediate + x.deferred)) > r2(g.level1Ceiling)) ||
      (!blank(g.ceiling) && r2(g.immediate + g.deferred) > r2(g.ceiling)));
    if (overCeiling) return "Le montant de certaines indemnités dépasse le plafond associé";
    if (beneficiaries.length && assigned.some((g) => g.l1 !== RSE &&
      r2(g.immediate + g.deferred) > r2(gBase(g) - g.obsTotal + num(g.cAmt))))
      return "Les indemnités ne doivent pas dépasser les dommages. Veuillez ajuster les montants.";
    return "";
  }

  /* ---------- Vérification d'une estimation ---------- */
  /* hasCoverages : le dossier porte des contrats/garanties (équivalent d'un dossier initié par ProsPecT). */
  function verifyEstimate(ctx) {
    const { damages, stances, beneficiaries, groups, damageEstimate, position, hasCoverages,
      insuredId, coverages, riskObjectIds } = ctx;
    const hasDamages = damages.length > 0 || num(damageEstimate) > 0;
    const assigned = groups.filter((g) => g.beneficiaryId);
    const errors = [];
    let status = null;
    if (!beneficiaries.length || !assigned.length) {
      if ((hasDamages && !stances.length) || (hasDamages && !hasCoverages)) status = 2;
      else if (!hasDamages && stances.length && hasCoverages) status = 3;
      else if (hasDamages && stances.length && hasCoverages) status = 4;
    } else {
      // objets de risque couverts par une garantie applicable
      const applicable = new Set();
      for (const s of stances.filter((x) => x.stance === 1 || x.stance === 2)) {
        const cov = coverages.find((c) => c.id === s.coverageId);
        const covered = cov && cov.coveredRiskObjects && cov.coveredRiskObjects.length ? cov.coveredRiskObjects : riskObjectIds;
        covered.forEach((id) => applicable.add(id));
      }
      const toCover = groups.filter((g) => applicable.has(g.riskObjectId));
      const allCompensated = toCover.every((g) => g.beneficiaryId);
      if (!allCompensated)
        errors.push("Tous les dommages couverts par une garantie applicable doivent être ventilés dans l'indemnisation");
      if (blank(position)) errors.push("Une position de l'assuré sur l'indemnisation doit être sélectionnée");
      if (allCompensated && !blank(position)) status = 5;
    }
    return { status, errors, insuredId };
  }

  // Assiette IRSI : somme des montants IRSI des calculs actifs inclus dans l'assiette
  function irsiBase(damages, calcById) {
    return r2(sum(damages.filter((d) => {
      const c = calcById[d.calculationId];
      return c && c.includedInIRSI && c.active;
    }), (d) => d.irsiAmount));
  }
  // Un calcul est actif s'il porte un montant de dommages ou un montant réclamé
  const calculationActive = (calc, damages) =>
    sum(damages.filter((d) => d.calculationId === calc.id && num(d.priceWithVAT) > 0), (d) => d.priceWithVAT) > 0 ||
    num(calc.claimedAmount) > 0;

  /* ---------- Localisations ---------- */
  function roomMeasures(room) {
    let length = num(room.length), width = num(room.width);
    const height = num(room.height);
    let floor = r2(length * width);
    if (!(length > 0) && num(room.surface) > 0) {
      // surface seule connue : dimensions estimées au nombre d'or
      floor = num(room.surface);
      length = r2(Math.sqrt(floor * 1.618));
      width = width > 0 ? width : r2(floor / length);
    } else if (!(width > 0) && num(room.surface) > 0 && length > 0) {
      floor = num(room.surface); width = r2(floor / length);
    }
    const perimeter = r2((length + width) * 2);
    const openings = room.openings || [];
    const openingsArea = r2(sum(openings, (o) => num(o.width) * num(o.height)));
    const doorsWidth = r2(sum(openings.filter((o) => OPENING_TYPES.includes(o.type)), (o) => o.width));
    return {
      length, width, height, floor, ceiling: floor, perimeter,
      wallsGross: r2(perimeter * height),
      walls: Math.max(0, r2(perimeter * height - openingsArea)),
      skirting: Math.max(0, r2(perimeter - doorsWidth)),
      volume: r2(floor * height),
    };
  }

  /* ---------- Barème de vétusté ---------- */
  // taux annuel appliqué après une franchise en années, plafonné
  function scaleObsolescence(rule, ageYears) {
    if (!rule || blank(ageYears)) return null;
    const years = Math.max(0, num(ageYears) - num(rule.franchiseYears));
    return r1(Math.min(blank(rule.maxPct) ? 100 : rule.maxPct, years * num(rule.ratePerYear)));
  }
  // années entières écoulées entre deux dates AAAA-MM-JJ
  function yearsBetween(from, to) {
    if (!from || !to) return null;
    const a = new Date(from), b = new Date(to);
    if (isNaN(a) || isNaN(b) || b < a) return null;
    let y = b.getFullYear() - a.getFullYear();
    if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
    return y;
  }

  const api = { scaleObsolescence, yearsBetween,
    MBV, RSE, STATUS, STANCES, OPENING_TYPES, isReadOnly, num, blank, r1, r2, roundDown2, sum,
    linePrices, damageAmounts, recalcOnTaxRegime, transverseObsolescence, irsiAmount, nextLineIndex,
    mbvAmounts, htFromTtc, mbvIrsiAmount,
    buildGroups, gBase, assignGroup, unassignGroup, setContractPct, setContractAmount, setCeiling,
    setLevel1Ceiling, applyGenericPct, ceilingOverrun, obsOverdraft, beneficiaryTotals, compensationError,
    verifyEstimate, irsiBase, calculationActive, roomMeasures,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EC = api;
})(typeof window !== "undefined" ? window : globalThis);
