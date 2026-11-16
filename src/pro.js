/* Outils de chiffrage : saisie directe dans le tableau, actions par ligne et par nature,
   chiffrage depuis le bordereau, barèmes de vétusté, export Excel, écarts et comparaisons. */
(function () {
  "use strict";
  const A = ECApp.api, { h, eur, n2, qty, pct, parseNum, toast, tbl } = A, { MBV, RSE, num, blank, r2, r1 } = EC;
  const $ = (s, el) => (el || document).querySelector(s);
  const refs = () => ECApp.db.refs;
  const obsTable = () => { if (!refs().obsolescence) refs().obsolescence = JSON.parse(JSON.stringify(ECData.refs.obsolescence)); return refs().obsolescence; };
  const sortIdx = (a, b) => (a.lineIndex < b.lineIndex ? -1 : 1);
  const amountEntered = (d) => num(d.obsPct) === 0 && num(d.obsAmount) > 0 && d.l1 !== RSE;

  // Recalcule une ligne après modification, selon le régime fiscal de son calcul. Renvoie un message d'erreur ou rien.
  function recompute(d, calc, patch) {
    const n = Object.assign({ qty: d.qty, unit: d.unit, vat: d.vat, obsPct: d.obsPct }, patch);
    const keepAmount = !("obsPct" in patch) && amountEntered(d) ? d.obsAmount : null;
    const a = d.l1 === MBV ? EC.mbvAmounts({ ht: n.unit, vat: n.vat, obsPct: n.obsPct, obsAmountInput: keepAmount }, calc.taxRegime)
      : EC.damageAmounts({ l1: d.l1, qty: n.qty, unit: n.unit, vat: n.vat, obsPct: n.obsPct, obsAmountInput: keepAmount }, calc.taxRegime);
    if (d.l1 !== RSE && a.obsAmount > a.base + 0.001) return "La vétusté ne peut pas dépasser le montant de la ligne";
    Object.assign(d, { qty: d.l1 === MBV ? 1 : n.qty, unit: n.unit, vat: n.vat, obsPct: r1(a.obsPct), obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT });
    d.irsiAmount = d.l1 === MBV ? EC.mbvIrsiAmount(A.benefitOf(MBV, d.l2), { ht: d.unit, obsPct: d.obsPct }) : EC.irsiAmount(A.benefitOf(d.l1, d.l2), d);
  }

  /* ----- Saisie directe dans le tableau des dommages ----- */
  ECApp.chg.line = (el) => {
    const e = A.est(), d = e.damages.find((x) => x.id === el.dataset.id), k = el.dataset.k, v = parseNum(el.value);
    if (v === undefined || v < 0 || (v === null && k !== "obsPct") || (k === "obsPct" && v > 100)) { toast(`La valeur saisie '${el.value}' n'est pas valide`, "err"); return; }
    if (num(v) === num(d[k])) return false; // valeur inchangée
    if (k === "qty" && !(v > 0)) { toast("La quantité doit être supérieure à 0", "err"); return; }
    const calc = A.calcMap(e)[d.calculationId], err = recompute(d, calc, { [k]: num(v) });
    if (err) { toast(err, "err"); return; }
    A.touch(e, calc);
  };

  /* ----- Actions sur une ligne ----- */
  ECApp.acts["move-dmg"] = (el) => {
    const e = A.est(), d = e.damages.find((x) => x.id === el.dataset.id);
    const sib = e.damages.filter((x) => x.calculationId === d.calculationId && x.l1 === d.l1 && x.l2 === d.l2).sort(sortIdx);
    const o = sib[sib.indexOf(d) + +el.dataset.dir];
    if (!o) return false;
    [d.lineIndex, o.lineIndex] = [o.lineIndex, d.lineIndex];
    A.save();
  };
  ECApp.acts["reassign-dmg"] = (el) => {
    const c = A.cur(), e = A.est(), d = e.damages.find((x) => x.id === el.dataset.id);
    A.openForm({ title: "Réaffecter la ligne", intro: `« ${d.name} » est déplacée vers un autre tiers ou un autre objet de risque. Les montants sont recalculés selon le régime fiscal de la destination.`, submit: "Réaffecter", fields: [
      { key: "tp", label: "Tiers", type: "select", empty: false, options: c.thirdParties.map((t) => ({ value: t.id, label: t.name + (t.insured ? " (assuré)" : "") })), value: d.thirdPartyId },
      { key: "ro", label: "Objet de risque (assuré seulement)", type: "select", options: c.riskObjects.map((r) => ({ value: r.id, label: A.roLabel(c, r.id) })), value: d.riskObjectId }],
    onSubmit(v) {
      const tp = c.thirdParties.find((t) => t.id === v.tp), roId = tp.insured ? v.ro || null : null;
      if (tp.insured && !roId) return "Choisissez l'objet de risque de l'assuré.";
      if (tp.id === d.thirdPartyId && (roId || null) === (d.riskObjectId || null)) return "La ligne est déjà affectée à cette destination.";
      const from = A.calcMap(e)[d.calculationId], to = A.getCalc(e, tp.id, roId, true);
      const dest = A.scopeDamages(e, tp, roId).filter((x) => (x.l1 === MBV) === (d.l1 === MBV));
      Object.assign(d, { thirdPartyId: tp.id, riskObjectId: roId, calculationId: to.id, lineIndex: EC.nextLineIndex(dest, d.l1, d.l2) });
      recompute(d, to, {});
      if (from) from.active = EC.calculationActive(from, e.damages);
      A.touch(e, to);
    } });
    return false;
  };
  ECApp.acts["bulk-nature"] = (el) => {
    const c = A.cur(), e = A.est(), { tp, roId } = A.dmgScope(c, e), l1 = el.dataset.l1;
    const lines = () => A.scopeDamages(e, tp, roId).filter((d) => d.l1 === l1);
    A.openForm({ title: "Modifier la nature · " + l1, intro: `${lines().length} ligne(s). Les champs laissés vides ne changent rien.`, submit: "Appliquer", fields: [
      { key: "adjust", label: "Ajustement des prix %", type: "num", min: -100, max: 500, hint: "-10 baisse chaque prix unitaire de 10 %." },
      { key: "obsPct", label: "Vétusté %", type: "num", max: 100 },
      { key: "vat", label: "TVA %", type: "num", max: 99.99 },
      { key: "mode", label: "Mode d'indemnisation", type: "select", placeholder: "Inchangé", options: [{ value: "REN", label: "REN · réparation en nature" }, { value: "IP", label: "IP · indemnité pécuniaire" }] },
      { key: "roomId", label: "Pièce", type: "select", placeholder: "Inchangée", options: c.rooms.map((r) => ({ value: r.id, label: r.name })) }],
    onSubmit(v) {
      const calc = A.getCalc(e, tp.id, roId, true);
      for (const d of lines()) {
        const patch = {};
        if (!blank(v.adjust)) patch.unit = r2(d.unit * (1 + v.adjust / 100));
        if (!blank(v.obsPct)) patch.obsPct = v.obsPct;
        if (!blank(v.vat)) patch.vat = v.vat;
        const err = recompute(d, calc, patch); if (err) return `« ${d.name} » : ${err}`;
        if (v.mode) d.mode = v.mode;
        if (v.roomId) d.roomId = v.roomId;
      }
      A.touch(e, calc);
    } });
    return false;
  };

  /* ----- Chiffrage depuis le bordereau, quantités reprises des mesures d'une pièce ----- */
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const MEASURES = { "m²": [["walls", "Murs"], ["floor", "Sol"], ["ceiling", "Plafond"]], ml: [["skirting", "Plinthes"], ["perimeter", "Périmètre"]] };
  function guessMeasure(p) {
    const t = norm(p.name + " " + p.l2);
    if (p.unit === "m²") return /plafond/.test(t) ? "ceiling" : /sol|parquet|pvc|moquette|carrelage|stratifie/.test(t) ? "floor" : "walls";
    if (p.unit === "ml") return /plinthe/.test(t) ? "skirting" : "perimeter";
    return "";
  }
  ECApp.acts.catalog = () => {
    if (A.readOnly()) return false;
    const c = A.cur(), e = A.est(), { tp, roId } = A.dmgScope(c, e), d = A.dlg();
    const st = { sel: {}, q: "", nat: "", room: "" };
    const natures = [...new Set(refs().prices.map((p) => p.l1 + " › " + p.l2))];
    d.innerHTML = `<div class="dlg-body"><h3>Chiffrer depuis le bordereau</h3>
      <p class="muted">Saisissez les quantités des prestations à retenir. Avec une pièce choisie, la quantité se reprend de ses mesures. Prix de la zone ${c.zone || 1}.</p>
      <div class="grid">
        <div class="fld"><label for="cat-q">Rechercher</label><input id="cat-q" type="search" placeholder="peinture, parquet, plinthe…"></div>
        <div class="fld"><label for="cat-nat">Nature</label><select id="cat-nat"><option value="">Toutes</option>${natures.map((n) => `<option>${h(n)}</option>`).join("")}</select></div>
        <div class="fld"><label for="cat-room">Pièce</label><select id="cat-room"><option value="">—</option>${c.rooms.map((r) => `<option value="${r.id}">${h(r.name)}</option>`).join("")}</select></div>
        <div class="fld"><label for="cat-mode">Mode d'indemnisation</label><select id="cat-mode"><option value="IP">IP · indemnité pécuniaire</option><option value="REN">REN · réparation en nature</option></select></div>
        <div class="fld"><label for="cat-obs">Vétusté %</label><input id="cat-obs" class="num" inputmode="decimal" placeholder="Selon chaque ligne"></div>
      </div>
      <div class="tw imp-tw"><table><thead><tr><th>Prestation</th><th>Unité</th><th class="r">Prix unitaire HT €</th><th>Mesure de la pièce</th><th class="r">Quantité</th><th class="r">Montant HT €</th></tr></thead><tbody id="cat-body"></tbody></table></div>
      <p class="banner info" id="cat-sum"></p><p class="form-err" id="cat-err" hidden></p></div>
      <div class="dlg-foot"><button class="btn ghost" data-act="dlg-close">Annuler</button><button class="btn primary" id="cat-go"></button></div>`;
    const body = $("#cat-body", d), room = () => c.rooms.find((r) => r.id === st.room);
    const measureQty = (key) => { const r = room(); return r && key ? EC.roomMeasures(r)[key] : null; };
    const summary = () => {
      const picked = Object.entries(st.sel).filter(([, s]) => parseNum(s.qty) > 0);
      const total = r2(picked.reduce((a, [i, s]) => a + parseNum(s.qty) * A.zonePrice(refs().prices[i], c), 0));
      $("#cat-sum", d).textContent = picked.length ? `${picked.length} prestation(s) retenue(s) pour ${eur(total)} HT` : "Aucune prestation retenue pour l'instant.";
      const b = $("#cat-go", d); b.disabled = !picked.length; b.textContent = picked.length ? `Ajouter ${picked.length} ligne(s) au chiffrage` : "Ajouter au chiffrage";
    };
    const list = () => {
      const terms = norm(st.q).split(/\s+/).filter(Boolean);
      const items = refs().prices.map((p, i) => ({ p, i })).filter(({ p }) => (!st.nat || p.l1 + " › " + p.l2 === st.nat) && terms.every((t) => norm(p.name + " " + p.l1 + " " + p.l2 + " " + p.repairer).includes(t)));
      body.innerHTML = items.slice(0, 150).map(({ p, i }) => {
        const s = st.sel[i] || {}, ms = st.room ? MEASURES[p.unit] : null, q = parseNum(s.qty);
        return `<tr data-i="${i}" class="${q > 0 ? "picked" : ""}"><td>${h(p.name)}<br><small class="muted">${h(p.l1)} › ${h(p.l2)} · ${h(p.repairer)}${num(p.co2) ? " · " + qty(p.co2) + " kg CO2e" : ""}</small></td><td>${h(p.unit)}</td><td class="r">${eur(A.zonePrice(p, c))}</td>
          <td>${ms ? `<select class="cat-m" id="cat-m-${i}" aria-label="Mesure"><option value="">Saisie libre</option>${ms.map(([k, l]) => `<option value="${k}"${s.m === k ? " selected" : ""}>${l} · ${n2(measureQty(k))}${k === guessMeasure(p) ? " ←" : ""}</option>`).join("")}</select>` : ""}</td>
          <td class="r"><input class="num xs cat-qty" id="cat-qty-${i}" inputmode="decimal" value="${h(s.qty || "")}" aria-label="Quantité"></td><td class="r cat-tot">${q > 0 ? eur(r2(q * A.zonePrice(p, c))) : ""}</td></tr>`;
      }).join("") || `<tr><td colspan="6" class="muted">Aucune prestation ne correspond. Élargissez la recherche ou complétez le bordereau dans les Référentiels.</td></tr>`;
      summary();
    };
    const rowState = (tr) => (st.sel[tr.dataset.i] = st.sel[tr.dataset.i] || {});
    body.addEventListener("input", (ev) => {
      const tr = ev.target.closest("tr"); if (!tr || !ev.target.classList.contains("cat-qty")) return;
      const s = rowState(tr); s.qty = ev.target.value; s.m = ""; const sel = $(".cat-m", tr); if (sel) sel.value = "";
      const q = parseNum(s.qty); $(".cat-tot", tr).textContent = q > 0 ? eur(r2(q * A.zonePrice(refs().prices[tr.dataset.i], c))) : ""; tr.classList.toggle("picked", q > 0); summary();
    });
    body.addEventListener("change", (ev) => {
      const tr = ev.target.closest("tr"); if (!tr || !ev.target.classList.contains("cat-m")) return;
      const s = rowState(tr); s.m = ev.target.value; s.qty = s.m ? String(measureQty(s.m)).replace(".", ",") : ""; list();
    });
    $("#cat-q", d).addEventListener("input", (ev) => { st.q = ev.target.value; list(); });
    $("#cat-nat", d).addEventListener("change", (ev) => { st.nat = ev.target.value; list(); });
    $("#cat-room", d).addEventListener("change", (ev) => { st.room = ev.target.value; Object.values(st.sel).forEach((s) => { if (s.m) s.qty = st.room ? String(measureQty(s.m)).replace(".", ",") : ""; }); list(); });
    $("#cat-go", d).onclick = () => {
      const fail = (m) => { const p = $("#cat-err", d); p.hidden = false; p.textContent = m; };
      const obs = parseNum($("#cat-obs", d).value);
      if (obs === undefined || (obs !== null && (obs < 0 || obs > 100))) return fail("La vétusté doit être un pourcentage entre 0 et 100.");
      const picked = [];
      for (const [i, s] of Object.entries(st.sel)) { if (blank(s.qty) || !String(s.qty).trim()) continue; const q = parseNum(s.qty); if (!(q > 0)) return fail(`Quantité non valide pour « ${refs().prices[i].name} ».`); picked.push([refs().prices[i], q]); }
      const calc = A.getCalc(e, tp.id, roId, true), vat = blank(tp.vat) ? 20 : tp.vat;
      for (const [p, q] of picked) {
        const dm = { id: A.uid(), calculationId: calc.id, thirdPartyId: tp.id, riskObjectId: roId, l1: p.l1, l2: p.l2, name: p.name, repairer: p.repairer, mode: $("#cat-mode", d).value, um: p.unit, beneficiaryName: "", roomId: st.room || null, co2: p.co2, csr: p.csr, obsPct: 0, obsAmount: 0, l1x: 0 };
        delete dm.l1x; dm.unit = A.zonePrice(p, c); dm.qty = q; dm.vat = vat;
        recompute(dm, calc, { obsPct: num(obs) });
        dm.lineIndex = EC.nextLineIndex(A.scopeDamages(e, tp, roId).filter((y) => y.l1 !== MBV), p.l1, p.l2);
        e.damages.push(dm);
      }
      A.touch(e, calc); ECApp.ui.tab = "prest"; A.closeDlg(); ECApp.render();
      toast(`${picked.length} ligne(s) ajoutée(s) au chiffrage`);
    };
    list(); d.showModal(); $("#cat-q", d).focus();
    return false;
  };

  /* ----- Synthèse : réclamé / chiffré, comparaison des estimations ----- */
  const gap = (a, b) => (blank(a) || blank(b) ? "" : `<span class="${b - a > 0.005 ? "neg" : b - a < -0.005 ? "pos" : ""}">${b - a > 0 ? "+" : ""}${eur(r2(b - a))}</span>`);
  ECApp.synth = {
    claimed(c, e) {
      const rows = e.calculations.map((k) => {
        const tp = c.thirdParties.find((t) => t.id === k.thirdPartyId); if (!tp) return "";
        const ds = e.damages.filter((d) => d.calculationId === k.id), amount = r2(EC.sum(ds, (d) => (k.taxRegime ? d.priceWithVAT : d.priceNoVAT)));
        if (!ds.length && blank(k.claimedAmount)) return "";
        return `<tr><td>${h(tp.name)}${tp.insured ? ' <span class="pill s-ver">Assuré</span>' : ""}<br><small class="muted">${k.riskObjectId ? h(A.roLabel(c, k.riskObjectId)) : ""}</small></td><td>${k.taxRegime ? "TTC" : "HT"}</td><td class="r">${eur(k.claimedAmount)}</td><td class="r">${eur(amount)}</td><td class="r">${eur(r2(EC.sum(ds, (d) => d.priceWithObs)))}</td><td class="r">${gap(k.claimedAmount, amount)}</td><td class="r">${blank(k.claimedAmount) || !k.claimedAmount ? "" : pct((amount / k.claimedAmount) * 100) + " %"}</td></tr>`;
      }).join("");
      const goods = e.damages.filter((d) => d.l1 === MBV && !blank(d.claimedAmount));
      return `<section class="panel flush">${tbl(["Tiers", "Régime", "Montant réclamé €", "Montant chiffré €", "Montant vétusté déduite €", "Écart chiffré − réclamé €", "Chiffré / réclamé %"], rows, "Aucun dommage ni montant réclamé sur cette estimation.")}</section>` +
        (goods.length ? `<section class="panel flush"><div class="panel-h pad"><h2>Biens mobiliers avec montant réclamé</h2></div>${tbl(["Bien", "Catégorie", "Montant réclamé €", "Valeur à neuf TTC €", "Montant vétusté déduite €", "Écart valeur à neuf − réclamé €"], goods.map((d) => `<tr><td>${h(d.name)}</td><td>${h(d.l2)}</td><td class="r">${eur(d.claimedAmount)}</td><td class="r">${eur(d.priceWithVAT)}</td><td class="r">${eur(d.priceWithObs)}</td><td class="r">${gap(d.claimedAmount, d.priceWithVAT)}</td></tr>`).join(""), "")}</section>` : "");
    },
    compare(c, e) {
      if (c.estimates.length < 2) return `<div class="empty"><p>Une seule estimation sur ce dossier. Dupliquez-la pour chiffrer une variante et comparer.</p><button class="btn" data-act="dup-est" data-id="${e.id}">Dupliquer cette estimation</button></div>`;
      const ref = c.estimates.find((x) => x.id === c.referenceEstimateId) || c.estimates[0];
      const nat = [...new Set(c.estimates.flatMap((x) => x.damages.map((d) => d.l1)))];
      const indem = (x) => { const g = A.groupsOf(c, x); return r2(EC.sum(x.beneficiaries, (b) => { const t = EC.beneficiaryTotals(g, b); return t.totalImmediate + t.totalDeferred; })); };
      const line = (label, f, cls) => `<tr class="${cls || ""}"><td>${label}</td>${c.estimates.map((x) => `<td class="r">${eur(f(x))}</td>`).join("")}<td class="r">${e.id === ref.id ? "" : gap(f(ref), f(e))}</td></tr>`;
      return `<section class="panel flush">${tbl(["Montants TTC"].concat(c.estimates.map((x) => h(x.name) + (x.id === ref.id ? " (réf.) €" : " €")), [`Écart ${h(e.name)} − référence €`]),
        `<tr><td>Statut</td>${c.estimates.map((x) => `<td class="r"><span class="pill">${h(A.STATUS[x.status].label)}</span></td>`).join("")}<td></td></tr>` +
        nat.map((l1) => line(h(l1), (x) => r2(EC.sum(x.damages.filter((d) => d.l1 === l1), (d) => d.priceWithVAT)))).join("") +
        line("Total HT", (x) => r2(EC.sum(x.damages, (d) => d.priceNoVAT))) + line("TOTAL TTC", (x) => r2(EC.sum(x.damages, (d) => d.priceWithVAT)), "tot") +
        line("Vétusté déduite", (x) => r2(EC.sum(x.damages, (d) => d.priceWithObs))) + line("Indemnisation totale", indem), "")}</section>`;
    },
  };

  /* ----- Référentiels : barèmes de vétusté ----- */
  ECApp.refsExtra = () => A.sect("Barèmes de vétusté", "edit-obs", "Ajouter", tbl(["Nature", "Détail", "Taux par an %", "Franchise (années)", "Plafond %", ""],
    obsTable().map((r, i) => `<tr><td>${h(r.l1)}</td><td>${h(r.l2 || "Tous")}</td><td class="r">${pct(r.ratePerYear)}</td><td class="r">${qty(r.franchiseYears) || 0}</td><td class="r">${pct(r.maxPct)}</td><td class="acts"><button class="btn sm ghost danger-t" data-act="del-obs" data-i="${i}">Supprimer</button></td></tr>`).join(""), "Aucun barème."),
    "La vétusté proposée vaut : taux × (âge − franchise), dans la limite du plafond. L'âge se saisit sur la prestation ; pour un bien mobilier il se déduit de la date d'achat et de la date du sinistre. Valeurs d'exemple à remplacer par les barèmes contractuels.");
  ECApp.acts["edit-obs"] = () => {
    A.openForm({ title: "Ajouter un barème de vétusté", fields: [
      { key: "l1", label: "Nature", type: "select", required: true, options: [...new Set(refs().benefits.map((b) => b.l1))].filter((x) => x !== RSE) },
      { key: "l2", label: "Détail", hint: "Vide : s'applique à toute la nature." },
      { key: "ratePerYear", label: "Taux par an %", type: "num", required: true, max: 100 }, { key: "franchiseYears", label: "Franchise (années)", type: "num" }, { key: "maxPct", label: "Plafond %", type: "num", required: true, max: 100 }],
    onSubmit(v) { const t = obsTable(), i = t.findIndex((r) => r.l1 === v.l1 && (r.l2 || "") === (v.l2 || "")); v.franchiseYears = num(v.franchiseYears); if (i >= 0) t[i] = v; else t.push(v); } });
    return false;
  };
  ECApp.acts["del-obs"] = (el) => { obsTable().splice(+el.dataset.i, 1); A.save(); };

  /* ----- Export Excel (classeur à quatre feuilles) ----- */
  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const loadXlsx = () => (window.XLSX ? Promise.resolve(window.XLSX) : new Promise((ok, ko) => { const s = document.createElement("script"); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = ko; document.head.appendChild(s); }));
  function workbookData(c, e) {
    const tpName = (id) => (c.thirdParties.find((t) => t.id === id) || {}).name || "", roomName = (id) => (c.rooms.find((r) => r.id === id) || {}).name || "";
    const groups = A.groupsOf(c, e), ins = A.insured(c);
    const syn = [["Dossier", c.number || ""], ["Type de sinistre", c.type || ""], ["Date du sinistre", A.frDate(c.eventDate)], ["Assuré", ins ? ins.name : ""], ["Estimation", e.name], ["Statut", A.STATUS[e.status].label], ["Position de l'assuré", e.position || ""], ["IRSI, assiette du local", A.liveIrsi(c, e)], [],
      ["Tiers", "Nature", "Valeur à neuf HT", "Valeur à neuf TTC", "Vétusté", "Vétusté déduite"]];
    for (const tp of c.thirdParties) { const ds = e.damages.filter((d) => d.thirdPartyId === tp.id); if (!ds.length) continue;
      const row = (label, x) => [tp.name, label, r2(EC.sum(x, (d) => d.priceNoVAT)), r2(EC.sum(x, (d) => d.priceWithVAT)), r2(EC.sum(x, (d) => (d.l1 === RSE ? 0 : d.obsAmount))), r2(EC.sum(x, (d) => d.priceWithObs))];
      [...new Set(ds.map((d) => d.l1))].forEach((l1) => syn.push(row(l1, ds.filter((d) => d.l1 === l1)))); syn.push(row("TOTAL", ds)); }
    const dmg = [["Tiers", "Objet de risque", "Nature", "Détail", "Désignation", "Pièce", "Quantité", "Unité", "Prix unitaire HT", "Montant HT", "TVA %", "Montant TTC", "Âge (années)", "Vétusté %", "Vétusté", "Vétusté déduite", "Mode", "Bénéficiaire", "Bordereau", "Origine", "CO2e kg"]];
    e.damages.slice().sort((a, b) => (a.thirdPartyId + a.lineIndex < b.thirdPartyId + b.lineIndex ? -1 : 1)).forEach((d) => dmg.push([tpName(d.thirdPartyId), d.riskObjectId ? A.roLabel(c, d.riskObjectId) : "", d.l1, d.l2, d.name, roomName(d.roomId), d.qty, d.um || "", d.unit, d.priceNoVAT, d.vat, d.priceWithVAT, blank(d.age) ? "" : d.age, d.l1 === RSE ? "" : d.obsPct, d.l1 === RSE ? 0 : d.obsAmount, d.priceWithObs, d.mode, d.beneficiaryName || "", d.repairer || "", d.source || "", r2(num(d.co2) * num(d.qty))]));
    const ind = [["Bénéficiaire", "Garantie", "Nature", "Détail", "Mode", "Dommages", "Vétusté", "Vétusté récupérable %", "Vétusté récupérable", "Plafond", "Indemnité immédiate", "Indemnité différée"]];
    e.beneficiaries.forEach((b) => { const l = A.benLabel(c, e, b), t = EC.beneficiaryTotals(groups, b), nil = ["", "", "", "", "", "", ""];
      groups.filter((g) => g.beneficiaryId === b.id).forEach((g) => ind.push([l.who, l.what, g.l1, g.l2, g.mode, EC.gBase(g), g.obsTotal, blank(g.cPct) ? "" : g.cPct, num(g.cAmt), blank(g.ceiling) ? "" : g.ceiling, g.immediate, g.deferred]));
      ind.push([l.who, l.what, "Remise %", num(b.discount), ...nil.slice(0, 6), t.discountedImmediate, t.discountedDeferred], [l.who, l.what, "Pénalités", ...nil, num(b.penalization), num(b.deferredPenalization)], [l.who, l.what, "Franchise", ...nil, num(b.deductible), num(b.deferredDeductible)], [l.who, l.what, "TOTAL INDEMNISATION", ...nil, t.totalImmediate, t.totalDeferred]); });
    const loc = [["Pièce", "Type", "Longueur m", "Largeur m", "Hauteur m", "Sol m²", "Murs m²", "Plafond m²", "Périmètre ml", "Plinthes ml"]];
    c.rooms.forEach((r) => { const m = EC.roomMeasures(r); loc.push([r.name, r.roomType, m.length, m.width, m.height, m.floor, m.walls, m.ceiling, m.perimeter, m.skirting]); });
    return { "Synthèse": syn, "Dommages": dmg, "Indemnisations": ind, "Localisations": loc };
  }
  ECApp.workbookData = workbookData;
  ECApp.acts["export-xlsx"] = () => {
    const c = A.cur(), e = A.est(), base = `${(c.number || "dossier").replace(/[^\w-]+/g, "_")}-${e.name.replace(/\s+/g, "_")}`;
    loadXlsx().then((X) => {
      const wb = X.utils.book_new();
      for (const [name, rows] of Object.entries(workbookData(c, e))) {
        const ws = X.utils.aoa_to_sheet(rows);
        ws["!cols"] = rows.reduce((w, r) => { r.forEach((v, i) => (w[i] = Math.min(48, Math.max(w[i] || 8, String(v == null ? "" : v).length + 2)))); return w; }, []).map((wch) => ({ wch }));
        X.utils.book_append_sheet(wb, ws, name);
      }
      A.saveFile(base + ".xlsx", new Blob([X.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    }).catch(() => { toast("Excel indisponible hors connexion : export au format CSV."); A.saveFile(base + ".csv", A.csvExport(c, e), "text/csv;charset=utf-8"); });
    return false;
  };

  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey && !A.dlg().open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { ev.preventDefault(); $("#undo").click(); }
  });
})();
