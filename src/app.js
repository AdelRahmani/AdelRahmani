/* Eureka Chiffrage — interface web. État conservé dans le navigateur (localStorage). */
(function () {
  "use strict";
  const { MBV, RSE, STATUS, STANCES, num, blank, r2 } = EC;
  const L = ECData.LISTS;
  const KEY = "eureka-chiffrage-v1";
  const $ = (s, el) => (el || document).querySelector(s);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (x) => (blank(x) ? "–" : nf2.format(x).replace(/ /g, " ") + " €");
  const n2 = (x) => (blank(x) ? "" : nf2.format(x).replace(/ /g, " "));
  const pct = (x) => (blank(x) ? "" : String(Math.round(x * 10) / 10).replace(".", ","));
  const qty = (x) => (blank(x) ? "" : String(Math.round(x * 1000) / 1000).replace(".", ","));
  // Saisie numérique : virgule ou point, espaces ignorés. undefined = saisie invalide, null = vide
  function parseNum(s) {
    const t = String(s == null ? "" : s).replace(/[\s  €%]/g, "").replace(",", ".");
    if (t === "") return null;
    return /^[-+]?\d*\.?\d+$/.test(t) ? parseFloat(t) : undefined;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const frDate = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

  /* ---------- État ---------- */
  let storageOk = true;
  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { storageOk = false; return null; }
  }
  let db = load() || { cases: [], refs: clone(ECData.refs) };
  const ui = { view: "home", step: "infos", caseId: null, estId: null, tpId: null, roId: null, benId: null,
    tab: "prest", synthTab: "main", option: 1, genericPct: null, collapsed: {}, onlyMine: false };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); storageOk = true; } catch (e) { storageOk = false; }
  }
  const cur = () => db.cases.find((c) => c.id === ui.caseId);
  const est = () => { const c = cur(); return c && (c.estimates.find((e) => e.id === ui.estId) || c.estimates[0]); };
  const insured = (c) => c.thirdParties.find((t) => t.insured);
  const readOnly = () => { const e = est(); return !!e && EC.isReadOnly(e.status); };
  const hasCoverages = (c) => c.coverages.length > 0;
  const roLabel = (c, id) => { const r = c.riskObjects.find((x) => x.id === id); return r ? `${r.riskType} - ${r.address1}${r.city ? ", " + (r.postalCode || "") + " " + r.city : ""}` : "Sans objet de risque"; };
  const covLabel = (cv) => `Contrat ${cv.policyNumber || "?"} · ${[cv.coverageType, cv.complementary, cv.precision].filter(Boolean).join(" · ")}`;

  function newEstimate(c) {
    const last = c.estimates.reduce((m, e) => Math.max(m, +(String(e.name).match(/\d+/) || [0])[0]), 0);
    return { id: uid(), name: "Estimation " + (last + 1), status: 1, statusDate: new Date().toISOString(), active: true,
      damageEstimate: null, position: null, irsiBase: null, calculations: [], damages: [], stances: [], beneficiaries: [], comps: {} };
  }
  function getCalc(e, tpId, roId, create) {
    let k = e.calculations.find((x) => x.thirdPartyId === tpId && (x.riskObjectId || null) === (roId || null));
    if (!k && create) {
      k = { id: uid(), thirdPartyId: tpId, riskObjectId: roId || null, taxRegime: true, claimedAmount: null, includedInIRSI: true, active: false };
      e.calculations.push(k);
    }
    return k;
  }
  const calcMap = (e) => Object.fromEntries(e.calculations.map((k) => [k.id, k]));
  // Toute modification repasse l'estimation en brouillon
  function touch(e, calc) {
    e.status = 1; e.statusDate = new Date().toISOString(); e.active = true;
    if (calc) calc.active = EC.calculationActive(calc, e.damages);
    save();
  }
  function groupsOf(c, e) {
    const ins = insured(c);
    const dmg = ins ? e.damages.filter((d) => d.thirdPartyId === ins.id) : [];
    const groups = EC.buildGroups(dmg, calcMap(e), e.comps);
    const benIds = new Set(e.beneficiaries.map((b) => b.id));
    groups.forEach((g) => { if (g.beneficiaryId && !benIds.has(g.beneficiaryId)) EC.unassignGroup(g); });
    return groups;
  }
  function storeGroups(e, groups) {
    e.comps = {};
    for (const g of groups) {
      if (g.beneficiaryId || !blank(g.ceiling) || !blank(g.level1Ceiling))
        e.comps[g.key] = { beneficiaryId: g.beneficiaryId, ceiling: g.ceiling, level1Ceiling: g.level1Ceiling, cPct: g.cPct, cAmt: g.cAmt, immediate: g.immediate, deferred: g.deferred };
    }
  }
  const benefitOf = (l1, l2) => db.refs.benefits.find((b) => b.l1 === l1 && b.l2 === l2);
  function possibleBeneficiaries(c) {
    const ins = insured(c);
    const out = ins ? [{ id: "insured", display: "Ass. - " + ins.name, name: ins.name, type: "ASSURE" }] : [];
    for (const l of c.linkedParties) if (l.type !== 2)
      out.push({ id: l.id, display: L.linkedPrefix[l.type] + l.lastName, name: l.lastName, type: { 1: "RENEUR", 3: "EDP", 4: "CDG", 5: "AUTRE" }[l.type] });
    return out;
  }
  const benPrefix = { ASSURE: "Ass. - ", RENEUR: "Ren. - ", EDP: "Ent. DP - ", CDG: "CdG. - ", AUTRE: "Autre - " };
  function benLabel(c, e, b) {
    const st = e.stances.find((s) => s.id === b.stanceId);
    const cv = st && c.coverages.find((x) => x.id === st.coverageId);
    return { who: (benPrefix[b.type] || "") + b.name, what: cv ? `Contrat ${cv.policyNumber} ${cv.coverageType}` : b.guarantee || "" };
  }

  /* ---------- Messages, dialogues ---------- */
  let toastTimer;
  function toast(msg, kind) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), kind === "err" ? 6000 : 3200);
  }
  const dlg = () => $("#dlg");
  function closeDlg() { const d = dlg(); if (d.open) d.close(); d.innerHTML = ""; }
  function confirmBox(text, label, cb) {
    const d = dlg();
    d.innerHTML = `<div class="dlg-body"><h3>Confirmer</h3><p>${h(text)}</p></div>
      <div class="dlg-foot"><button class="btn ghost" data-act="dlg-close">Annuler</button><button class="btn danger" id="dlg-ok">${h(label)}</button></div>`;
    $("#dlg-ok", d).onclick = () => { closeDlg(); cb(); };
    d.showModal();
  }
  function field(f) {
    const id = "f-" + f.key, v = f.value == null ? "" : f.value;
    const req = f.required ? " required" : "";
    let ctl;
    if (f.type === "select")
      ctl = `<select id="${id}" name="${f.key}"${req}>${f.empty === false ? "" : `<option value="">${h(f.placeholder || "—")}</option>`}${f.options.map((o) => { const ov = typeof o === "object" ? o.value : o, ol = typeof o === "object" ? o.label : o; return `<option value="${h(ov)}"${String(ov) === String(v) ? " selected" : ""}>${h(ol)}</option>`; }).join("")}</select>`;
    else if (f.type === "textarea") ctl = `<textarea id="${id}" name="${f.key}" rows="3"${req}>${h(v)}</textarea>`;
    else if (f.type === "checks")
      ctl = `<div class="checks">${f.options.map((o) => `<label><input type="checkbox" name="${f.key}" value="${h(o.value)}"${(f.value || []).includes(o.value) ? " checked" : ""}> ${h(o.label)}</label>`).join("") || '<span class="muted">Aucun élément</span>'}</div>`;
    else if (f.type === "check") ctl = `<label class="inline"><input type="checkbox" id="${id}" name="${f.key}"${v ? " checked" : ""}> ${h(f.checkLabel || "Oui")}</label>`;
    else ctl = `<input id="${id}" name="${f.key}" type="${f.type === "date" ? "date" : "text"}"${f.type === "num" ? ' inputmode="decimal" class="num"' : ""} value="${h(f.type === "num" ? (blank(v) ? "" : String(v).replace(".", ",")) : v)}"${req}${f.list ? ` list="${f.list}"` : ""}${f.readonly ? " readonly" : ""}>`;
    return `<div class="fld${f.wide ? " wide" : ""}" data-key="${f.key}"><label for="${id}">${h(f.label)}${f.required ? ' <span class="req">*</span>' : ""}</label>${ctl}${f.hint ? `<small>${h(f.hint)}</small>` : ""}</div>`;
  }
  // Formulaire générique en fenêtre modale. onSubmit renvoie un message d'erreur ou rien.
  function openForm(o) {
    const d = dlg();
    d.innerHTML = `<form method="dialog" id="dlg-form" novalidate><div class="dlg-body"><h3>${h(o.title)}</h3>${o.intro ? `<p class="muted">${h(o.intro)}</p>` : ""}
      <div class="grid">${o.fields.map(field).join("")}</div><div id="dlg-extra">${o.extra || ""}</div><p class="form-err" id="dlg-err" hidden></p></div>
      <div class="dlg-foot"><button type="button" class="btn ghost" data-act="dlg-close">Annuler</button><button class="btn primary" type="submit">${h(o.submit || "Enregistrer")}</button></div></form>`;
    const form = $("#dlg-form", d);
    const read = () => {
      const v = {}; let err = "";
      for (const f of o.fields) {
        if (f.type === "checks") { v[f.key] = [...form.querySelectorAll(`[name="${f.key}"]:checked`)].map((x) => x.value); continue; }
        const el = form.querySelector(`[name="${f.key}"]`);
        if (f.type === "check") { v[f.key] = el.checked; continue; }
        let val = el.value.trim();
        if (f.type === "num") {
          const p = parseNum(val);
          if (p === undefined) err = err || `La valeur saisie '${val}' n'est pas valide (${f.label})`;
          else if (p !== null && p < (f.min == null ? 0 : f.min)) err = err || `${f.label} : la valeur doit être supérieure ou égale à ${f.min == null ? 0 : f.min}`;
          else if (p !== null && f.max != null && p > f.max) err = err || `${f.label} : la valeur doit être inférieure ou égale à ${f.max}`;
          val = p === undefined ? null : p;
        }
        if (f.required && blank(val)) err = err || `${f.label} est obligatoire`;
        v[f.key] = val;
      }
      return { v, err };
    };
    if (o.onInput) { form.addEventListener("input", (ev) => o.onInput(read().v, form, ev)); form.addEventListener("change", (ev) => o.onInput(read().v, form, ev)); o.onInput(read().v, form, null); }
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const { v, err } = read();
      const e2 = err || o.onSubmit(v, form);
      if (e2) { const p = $("#dlg-err", d); p.textContent = e2; p.hidden = false; return; }
      closeDlg(); save(); render();
    });
    d.showModal();
    const first = form.querySelector("input:not([readonly]),select,textarea"); if (first) first.focus();
  }

  /* ---------- Rendu ---------- */
  const STEPS = [["infos", "Infos générales"], ["parties", "Parties prenantes"], ["lieux", "Localisations"], ["estimations", "Estimations"],
    ["dommages", "Dommages"], ["garanties", "Garanties"], ["beneficiaires", "Bénéficiaires"], ["indemnisations", "Indemnisations"], ["synthese", "Synthèse"]];
  const statusPill = (s) => `<span class="pill s-${STATUS[s].cat.slice(0, 3).toLowerCase()}">${h(STATUS[s].label)}</span>`;

  function render() {
    const keep = document.activeElement && document.activeElement.id;
    const c = cur();
    if (ui.view === "case" && !c) ui.view = "home";
    $("#crumb").innerHTML = ui.view === "case" ? `<button class="link" data-act="home">Dossiers</button><span>/</span><strong>${h(c.number || "Sans numéro")}</strong>${c.demo ? '<span class="pill s-bro">Exemple</span>' : ""}` : ui.view === "refs" ? `<button class="link" data-act="home">Dossiers</button><span>/</span><strong>Référentiels</strong>` : "";
    $("#steps").hidden = ui.view !== "case";
    if (ui.view === "case") {
      $("#steps").innerHTML = STEPS.map(([k, label], i) => `<button class="step${ui.step === k ? " on" : ""}" data-act="step" data-step="${k}"><i>${i + 1}</i>${label}</button>`).join("");
    }
    const m = $("#main");
    m.innerHTML = (!storageOk ? `<p class="banner warn">Le stockage du navigateur est indisponible : vos saisies seront perdues à la fermeture de la page. Exportez le dossier en JSON pour le conserver.</p>` : "") +
      (ui.view === "home" ? vHome() : ui.view === "refs" ? vRefs() : vCase(c));
    if (keep) { const el = document.getElementById(keep); if (el) { el.focus(); if (el.select && el.tagName === "INPUT" && el.type === "text") el.select(); } }
    const on = $("#steps .on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function caseTotals(c) {
    const e = c.estimates.find((x) => x.id === c.referenceEstimateId) || c.estimates[0];
    return e ? { e, ttc: r2(EC.sum(e.damages, (d) => d.priceWithVAT)) } : { e: null, ttc: 0 };
  }
  function vHome() {
    const cards = db.cases.map((c) => {
      const t = caseTotals(c), ins = insured(c);
      return `<article class="case-card"><button class="case-open" data-act="open-case" data-id="${c.id}">
        <span class="case-num">${h(c.number || "Sans numéro")}${c.demo ? ' <span class="pill s-bro">Exemple</span>' : ""}</span>
        <span class="muted">${h(c.type || "")} · sinistre du ${h(frDate(c.eventDate)) || "?"}</span>
        <span>${h(ins ? ins.name : "Assuré non renseigné")}</span>
        <span class="case-amt">${t.e ? eur(t.ttc) + " TTC" : "Aucune estimation"} ${t.e ? statusPill(t.e.status) : ""}</span></button>
        <div class="row-actions"><button class="btn sm ghost" data-act="export-case" data-id="${c.id}">Exporter JSON</button><button class="btn sm ghost danger-t" data-act="del-case" data-id="${c.id}">Supprimer</button></div></article>`;
    }).join("");
    return `<section class="head"><div><h1>Dossiers</h1><p class="muted">Chiffrage des dommages et calcul de l'indemnisation. Les données restent dans ce navigateur.</p></div>
      <div class="actions"><button class="btn primary" data-act="new-case">Nouveau dossier</button><label class="btn ghost" for="imp-case">Importer un dossier<input type="file" id="imp-case" accept=".json,application/json" hidden></label>
      <button class="btn ghost" data-act="refs">Référentiels</button></div></section>
      ${cards ? `<div class="cases">${cards}</div>` : `<div class="empty"><p>Aucun dossier. Créez-en un, ou chargez le dossier d'exemple pour parcourir toutes les étapes.</p><button class="btn" data-act="load-demo">Charger le dossier d'exemple</button></div>`}
      ${cards && !db.cases.some((c) => c.demo) ? `<p><button class="link" data-act="load-demo">Charger le dossier d'exemple</button></p>` : ""}`;
  }

  function vCase(c) {
    if (!c.estimates.length) { c.estimates.push(newEstimate(c)); c.referenceEstimateId = c.estimates[0].id; save(); }
    if (!est() || est().id !== ui.estId) ui.estId = (c.estimates.find((e) => e.id === c.referenceEstimateId) || c.estimates[0]).id;
    const needsEst = ["dommages", "garanties", "beneficiaires", "indemnisations", "synthese"].includes(ui.step);
    const e = est();
    const bar = needsEst ? `<div class="estbar"><label for="est-sel">Estimation</label><select id="est-sel" data-chg="est-sel">${c.estimates.map((x) => `<option value="${x.id}"${x.id === e.id ? " selected" : ""}>${h(x.name)}${x.id === c.referenceEstimateId ? " (référence)" : ""}</option>`).join("")}</select>${statusPill(e.status)}
      ${readOnly() ? `<span class="lock">Estimation verrouillée : dupliquez-la pour la modifier. <button class="link" data-act="dup-est" data-id="${e.id}">Dupliquer</button></span>` : ""}</div>` : "";
    const v = { infos: vInfos, parties: vParties, lieux: vLieux, estimations: vEstimations, dommages: vDommages, garanties: vGaranties, beneficiaires: vBeneficiaires, indemnisations: vIndemn, synthese: vSynthese }[ui.step](c, e);
    const i = STEPS.findIndex((s) => s[0] === ui.step);
    return bar + v + `<nav class="pager">${i > 0 ? `<button class="btn ghost" data-act="step" data-step="${STEPS[i - 1][0]}">← ${STEPS[i - 1][1]}</button>` : "<span></span>"}${i < STEPS.length - 1 ? `<button class="btn primary" data-act="step" data-step="${STEPS[i + 1][0]}">Étape suivante : ${STEPS[i + 1][1]} →</button>` : ""}</nav>`;
  }

  const inp = (id, chg, val, attrs) => `<input id="${id}" data-chg="${chg}" value="${h(val)}" ${attrs || ""}>`;
  const sel = (id, chg, opts, val, attrs) => `<select id="${id}" data-chg="${chg}" ${attrs || ""}>${opts.map((o) => { const ov = typeof o === "object" ? o.value : o, ol = typeof o === "object" ? o.label : o; return `<option value="${h(ov)}"${String(ov) === String(val == null ? "" : val) ? " selected" : ""}>${h(ol)}</option>`; }).join("")}</select>`;
  const toggle = (id, chg, on, a, b, dis) => `<span class="seg" role="group"><button id="${id}-0" class="${!on ? "on" : ""}" data-act="${chg}" data-v="0"${dis ? " disabled" : ""}>${a}</button><button id="${id}-1" class="${on ? "on" : ""}" data-act="${chg}" data-v="1"${dis ? " disabled" : ""}>${b}</button></span>`;

  function vInfos(c) {
    const f = (k, label, ctl, wide) => `<div class="fld${wide ? " wide" : ""}"><label for="ci-${k}">${label}</label>${ctl}</div>`;
    return `<section class="head"><div><h1>Informations générales</h1></div></section><div class="panel"><div class="grid">
      ${f("number", "N° de mission", inp("ci-number", "case", c.number || "", 'data-k="number" placeholder="27FP…"'))}
      ${f("type", "Type de sinistre", sel("ci-type", "case", [""].concat(L.caseTypes), c.type, 'data-k="type"'))}
      ${f("eventDate", "Date du sinistre", inp("ci-eventDate", "case", c.eventDate || "", 'data-k="eventDate" type="date"'))}
      ${f("expert", "Expert", inp("ci-expert", "case", c.expert || "", 'data-k="expert"'))}
      ${f("address", "Adresse du sinistre", inp("ci-address", "case", c.address || "", 'data-k="address"'), true)}
      ${f("department", "Département", inp("ci-department", "case", c.department || "", 'data-k="department" maxlength="3"'))}
      ${f("zone", "Zone tarifaire du bordereau", sel("ci-zone", "case", [1, 2, 3, 4, 5], c.zone || 1, 'data-k="zone" data-num="1"'))}
      ${f("irsi", "Convention IRSI", toggle("ci-irsi", "case-irsi", c.irsiEnabled, "non", "oui"))}
      ${f("comments", "Commentaires", `<textarea id="ci-comments" data-chg="case" data-k="comments" rows="3">${h(c.comments || "")}</textarea>`, true)}
    </div></div>`;
  }

  const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((x) => `<th${/€|%|Montant|Qté|Prix|Plafond|TVA/.test(x) ? ' class="r"' : ""}>${x}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="muted">${empty}</td></tr>`}</tbody></table></div>`;
  const rowBtns = (kind, id) => `<td class="acts"><button class="btn sm ghost" data-act="edit-${kind}" data-id="${id}">Modifier</button><button class="btn sm ghost danger-t" data-act="del-${kind}" data-id="${id}">Supprimer</button></td>`;
  const sect = (title, addAct, addLabel, body, note) => `<section class="panel"><div class="panel-h"><h2>${title}</h2>${addAct ? `<button class="btn sm" data-act="${addAct}">${addLabel}</button>` : ""}</div>${note ? `<p class="muted">${note}</p>` : ""}${body}</section>`;

  function vParties(c) {
    return `<section class="head"><div><h1>Parties prenantes</h1></div></section>` +
      sect("Assuré et tiers", "edit-tp", "Ajouter un tiers", tbl(["Nom", "Rôle", "Qualité", "Assureur", "Contrat", "TVA %", ""],
        c.thirdParties.map((t) => `<tr><td>${h(t.name)} ${t.insured ? '<span class="pill s-ver">Assuré</span>' : ""}</td><td>${h(t.role)}</td><td>${h(t.type)}</td><td>${h(t.insurance)}</td><td>${h(t.contract)}</td><td class="r">${pct(t.vat)}</td>${rowBtns("tp", t.id)}</tr>`).join(""), "Aucun tiers. Ajoutez l'assuré pour commencer le chiffrage.")) +
      sect("Objets de risque", "edit-ro", "Ajouter un objet de risque", tbl(["Type", "Adresse", ""],
        c.riskObjects.map((r) => `<tr><td>${h(r.riskType)}</td><td>${h([r.address1, r.postalCode, r.city].filter(Boolean).join(" "))}</td>${rowBtns("ro", r.id)}</tr>`).join(""), "Aucun objet de risque.")) +
      sect("Contrats et garanties", "edit-cov", "Ajouter une garantie", tbl(["Contrat", "Garantie", "Précision", "Assureur", "Objets couverts", ""],
        c.coverages.map((v) => `<tr><td>${h(v.policyNumber)}</td><td>${h([v.coverageType, v.complementary].filter(Boolean).join(" · "))}</td><td>${h(v.precision)}</td><td>${h(v.insurerLabel)}</td><td>${v.coveredRiskObjects.length ? v.coveredRiskObjects.map((id) => h(roLabel(c, id))).join("<br>") : "Tous"}</td>${rowBtns("cov", v.id)}</tr>`).join(""), "Aucune garantie saisie."),
        "Si des garanties sont saisies, une prise de position est demandée avant l'indemnisation. Sans garantie, le bénéficiaire est rattaché à une garantie choisie dans une liste.") +
      sect("Parties liées à l'assuré", "edit-lp", "Ajouter une partie liée", tbl(["Type", "Nom", ""],
        c.linkedParties.map((l) => `<tr><td>${h(L.linkedTypes[l.type])}</td><td>${h([l.lastName, l.firstName].filter(Boolean).join(" "))}</td>${rowBtns("lp", l.id)}</tr>`).join(""), "Aucune partie liée."),
        "Réparateurs agréés, entreprises en délégation de paiement et centres de gestion peuvent être bénéficiaires d'une indemnité.");
  }

  function vLieux(c) {
    const cards = c.rooms.map((r) => {
      const m = EC.roomMeasures(r);
      return `<article class="room"><div class="panel-h"><h3>${h(r.name)} <span class="muted">${h(r.roomType)}</span></h3><div><button class="btn sm ghost" data-act="edit-room" data-id="${r.id}">Modifier</button><button class="btn sm ghost danger-t" data-act="del-room" data-id="${r.id}">Supprimer</button></div></div>
        <p class="dims">${qty(m.length)} × ${qty(m.width)} m, hauteur ${qty(m.height)} m</p>
        <dl class="kv"><div><dt>Sol</dt><dd>${n2(m.floor)} m²</dd></div><div><dt>Plafond</dt><dd>${n2(m.ceiling)} m²</dd></div><div><dt>Murs, ouvertures déduites</dt><dd>${n2(m.walls)} m²</dd></div><div><dt>Périmètre</dt><dd>${n2(m.perimeter)} ml</dd></div><div><dt>Plinthes</dt><dd>${n2(m.skirting)} ml</dd></div><div><dt>Volume</dt><dd>${n2(m.volume)} m3</dd></div></dl>
        <div class="openings">${(r.openings || []).map((o, i) => `<span class="chip">${h(o.type)} ${qty(o.width)} × ${qty(o.height)} m <button data-act="del-opening" data-id="${r.id}" data-i="${i}" aria-label="Retirer">×</button></span>`).join("")}<button class="btn sm ghost" data-act="add-opening" data-id="${r.id}">+ Ouverture</button></div></article>`;
    }).join("");
    return `<section class="head"><div><h1>Localisations</h1><p class="muted">Les mesures calculées se reprennent en quantité dans les lignes de dommages.</p></div><div class="actions"><button class="btn primary" data-act="edit-room">Ajouter une pièce</button></div></section>
      ${cards ? `<div class="rooms">${cards}</div>` : `<div class="empty"><p>Aucune pièce. Cette étape est facultative.</p></div>`}`;
  }

  function vEstimations(c) {
    const rows = c.estimates.map((e) => {
      const ht = r2(EC.sum(e.damages, (d) => d.priceNoVAT)), ttc = r2(EC.sum(e.damages, (d) => d.priceWithVAT));
      const ro = EC.isReadOnly(e.status);
      return `<tr><td><strong>${h(e.name)}</strong> ${e.id === c.referenceEstimateId ? '<span class="pill s-ver">Référence</span>' : ""}</td><td>${statusPill(e.status)}<br><small class="muted">${h(frDate(e.statusDate))}</small></td><td class="r">${e.damages.length}</td><td class="r">${eur(ht)}</td><td class="r">${eur(ttc)}</td>
        <td class="r"><input id="de-${e.id}" class="num" inputmode="decimal" data-chg="damage-estimate" data-id="${e.id}" value="${n2(e.damageEstimate)}"${ro ? " disabled" : ""} aria-label="Évaluation des dommages"></td>
        <td class="acts"><button class="btn sm" data-act="open-est" data-id="${e.id}">Ouvrir</button><button class="btn sm ghost" data-act="dup-est" data-id="${e.id}">Dupliquer</button>${e.id !== c.referenceEstimateId ? `<button class="btn sm ghost" data-act="ref-est" data-id="${e.id}">Définir en référence</button>` : ""}${c.estimates.length > 1 ? `<button class="btn sm ghost danger-t" data-act="del-est" data-id="${e.id}">Supprimer</button>` : ""}</td></tr>`;
    }).join("");
    return `<section class="head"><div><h1>Estimations</h1><p class="muted">L'évaluation des dommages sert quand aucun chiffrage détaillé n'est saisi.</p></div><div class="actions"><button class="btn primary" data-act="add-est">Nouvelle estimation</button></div></section>
      <section class="panel">${tbl(["Estimation", "Statut", "Lignes", "Total HT €", "Total TTC €", "Évaluation des dommages €", ""], rows, "")}</section>`;
  }

  /* ----- Dommages ----- */
  function dmgScope(c, e) {
    if (!c.thirdParties.some((t) => t.id === ui.tpId)) ui.tpId = (insured(c) || c.thirdParties[0] || {}).id || null;
    const tp = c.thirdParties.find((t) => t.id === ui.tpId);
    if (tp && tp.insured) { if (!c.riskObjects.some((r) => r.id === ui.roId)) ui.roId = (c.riskObjects[0] || {}).id || null; }
    const roId = tp && tp.insured ? ui.roId : null;
    return { tp, roId, calc: tp ? getCalc(e, tp.id, roId, false) : null };
  }
  const scopeDamages = (e, tp, roId) => e.damages.filter((d) => d.thirdPartyId === tp.id && (!tp.insured || (d.riskObjectId || null) === (roId || null)));

  function vDommages(c, e) {
    const { tp, roId, calc } = dmgScope(c, e);
    if (!tp) return `<section class="head"><div><h1>Dommages</h1></div></section><div class="empty"><p>Ajoutez d'abord l'assuré dans les parties prenantes.</p><button class="btn" data-act="step" data-step="parties">Parties prenantes</button></div>`;
    if (tp.insured && !c.riskObjects.length) return `<section class="head"><div><h1>Dommages</h1></div></section><div class="empty"><p>Ajoutez un objet de risque : les dommages de l'assuré y sont rattachés.</p><button class="btn" data-act="step" data-step="parties">Parties prenantes</button></div>`;
    const ro = readOnly(), k = calc || { taxRegime: true, includedInIRSI: true, claimedAmount: null };
    const all = scopeDamages(e, tp, roId);
    const list = all.filter((d) => (ui.tab === "mbv") === (d.l1 === MBV)).sort((a, b) => (a.lineIndex < b.lineIndex ? -1 : 1));
    const dis = ro ? " disabled" : "";
    const top = `<section class="head"><div><h1>Dommages</h1></div><div class="actions">${ui.tab === "prest" ? `<button class="btn" data-act="import-doc"${dis}>Importer un devis ou une facture</button>` : ""}<button class="btn primary" data-act="${ui.tab === "mbv" ? "edit-mbv" : "edit-dmg"}"${dis}>${ui.tab === "mbv" ? "Ajouter un bien" : "Ajouter une prestation"}</button></div></section>
      <div class="filters"><div class="fld"><label for="dm-tp">Tiers</label>${sel("dm-tp", "dm-tp", c.thirdParties.map((t) => ({ value: t.id, label: t.name + (t.insured ? " (assuré)" : "") })), tp.id)}</div>
      ${tp.insured ? `<div class="fld"><label for="dm-ro">Objet de risque</label>${sel("dm-ro", "dm-ro", c.riskObjects.map((r) => ({ value: r.id, label: roLabel(c, r.id) })), roId)}</div>` : ""}
      <div class="fld"><label for="dm-claimed">Montant réclamé €</label><input id="dm-claimed" class="num" inputmode="decimal" data-chg="claimed" value="${n2(k.claimedAmount)}"${dis}></div>
      <div class="fld"><label>Régime fiscal du règlement</label>${toggle("dm-tax", "tax-regime", k.taxRegime, "HT", "TTC", ro)}</div>
      <div class="fld"><label>IRSI</label>${toggle("dm-irsi", "case-irsi", c.irsiEnabled, "non", "oui", ro)}</div>
      <div class="fld"><label>Inclus dans l'assiette IRSI</label>${toggle("dm-inc", "irsi-included", k.includedInIRSI, "non", "oui", ro || !c.irsiEnabled)}</div></div>
      <div class="tabs"><button class="${ui.tab === "prest" ? "on" : ""}" data-act="dm-tab" data-v="prest">Prestations <span class="count">${all.filter((d) => d.l1 !== MBV).length}</span></button><button class="${ui.tab === "mbv" ? "on" : ""}" data-act="dm-tab" data-v="mbv">Mobilier et biens volés <span class="count">${all.filter((d) => d.l1 === MBV).length}</span></button></div>`;
    if (!list.length) return top + `<div class="empty"><p>${ui.tab === "mbv" ? "Aucun bien mobilier saisi pour ce tiers." : "Aucune prestation saisie pour ce tiers."}</p></div>`;
    const room = (id) => (c.rooms.find((r) => r.id === id) || {}).name || "";
    const totals = (ds) => `<td class="r">${eur(EC.sum(ds, (d) => d.priceNoVAT))}</td><td></td><td class="r">${eur(EC.sum(ds, (d) => d.priceWithVAT))}</td><td></td><td class="r">${eur(EC.sum(ds, (d) => d.l1 === RSE ? 0 : d.obsAmount))}</td><td class="r">${eur(EC.sum(ds, (d) => d.priceWithObs))}</td>`;
    let rows = "";
    const l1s = [...new Set(list.map((d) => (ui.tab === "mbv" ? d.l2 : d.l1)))];
    for (const l1 of l1s) {
      const g1 = list.filter((d) => (ui.tab === "mbv" ? d.l2 : d.l1) === l1), ck = "c:" + l1, closed = ui.collapsed[ck];
      const pcts = [...new Set(g1.map((d) => num(d.obsPct)))];
      rows += `<tr class="l1"><td colspan="4"><button class="tw-btn" data-act="collapse" data-k="${h(ck)}" aria-expanded="${!closed}">${closed ? "▸" : "▾"}</button> ${h(l1)}</td>${totals(g1)}
        <td class="r">${ui.tab === "prest" && l1 !== RSE ? `<input id="tv-${h(l1)}" class="num xs" inputmode="decimal" data-chg="transverse" data-l1="${h(l1)}" value="${pcts.length === 1 && pcts[0] ? pct(pcts[0]) : ""}" placeholder="Vét. %" aria-label="Vétusté appliquée à toute la nature"${dis}>` : ""}</td><td></td></tr>`;
      if (closed) continue;
      const l2s = ui.tab === "mbv" ? [null] : [...new Set(g1.map((d) => d.l2))];
      for (const l2 of l2s) {
        const g2 = l2 === null ? g1 : g1.filter((d) => d.l2 === l2);
        if (l2 !== null && l2 !== "N/A") rows += `<tr class="l2"><td colspan="4">${h(l2)}</td>${totals(g2)}<td></td><td></td></tr>`;
        for (const d of g2) {
          const better = d.csr && db.refs.prices.some((p) => p.csr === d.csr && num(p.co2) < num(d.co2));
          rows += `<tr class="l3"><td><button class="link ln" data-act="${d.l1 === MBV ? "edit-mbv" : "edit-dmg"}" data-id="${d.id}">${h(d.name)}</button>${d.csr && !better ? ' <span class="leaf" title="Prestation la moins carbonée de sa catégorie">éco</span>' : ""}${d.l1 === MBV ? `<br><small class="muted">${h([d.goodStatus, d.proof].filter(Boolean).join(" · "))}</small>` : ""}${d.source ? `<br><small class="muted">${h(d.source)}</small>` : ""}</td>
            <td>${h(room(d.roomId))}</td><td class="r">${d.l1 === RSE ? "1 %" : qty(d.qty) + " " + h(d.um || "")}</td><td class="r">${eur(d.unit)}</td><td class="r">${eur(d.priceNoVAT)}</td><td class="r">${pct(d.vat)} %</td><td class="r">${eur(d.priceWithVAT)}</td>
            <td class="r">${d.l1 === RSE ? "" : pct(d.obsPct) + " %"}</td><td class="r">${d.l1 === RSE ? "" : eur(d.obsAmount)}</td><td class="r">${eur(d.priceWithObs)}</td><td>${h(d.mode)}</td>
            <td class="acts">${ro ? "" : `<button class="btn sm ghost" data-act="dup-dmg" data-id="${d.id}" title="Dupliquer">Dupliquer</button><button class="btn sm ghost danger-t" data-act="del-dmg" data-id="${d.id}">Supprimer</button>`}</td></tr>`;
        }
      }
    }
    rows += `<tr class="tot"><td colspan="4">TOTAL</td>${totals(list)}<td></td><td></td></tr>`;
    const co2 = EC.sum(list, (d) => num(d.co2) * num(d.qty));
    return top + `<section class="panel flush">${tbl([ui.tab === "mbv" ? "Bien" : "Prestation", "Pièce", "Qté", "Prix unitaire HT €", "Montant HT €", "TVA", "Montant TTC €", "Vétusté %", "Vétusté €", `Vétusté déduite ${k.taxRegime ? "TTC" : "HT"} €`, "Mode", ""], rows, "")}</section>
      ${co2 > 0 ? `<p class="muted co2">Empreinte estimée des prestations : ${n2(co2)} kg CO2e</p>` : ""}`;
  }

  function zonePrice(p, c) { return p.prices[(c.zone || 1) - 1]; }
  function openDamageForm(id) {
    const c = cur(), e = est(), { tp, roId } = dmgScope(c, e);
    const calc = getCalc(e, tp.id, roId, true);
    const ed = id ? e.damages.find((d) => d.id === id) : null;
    const scope = scopeDamages(e, tp, roId).filter((d) => d.l1 !== MBV);
    const irsi = c.irsiEnabled ? "true" : "false";
    const bens = db.refs.benefits.filter((b) => b.l1 !== MBV && (blank(b.rec) || b.rec === irsi));
    const hasRse = scope.some((d) => d.l1 === RSE && (!ed || d.id !== ed.id));
    const l1s = [...new Set(bens.map((b) => b.l1))].filter((x) => x !== RSE || !hasRse);
    const renLines = scope.filter((d) => d.mode === "REN" && d.l1 !== RSE);
    const st = ed ? clone(ed) : { l1: "", l2: "", repairer: "EUREXO", name: "", qty: null, um: "", unit: null, vat: blank(tp.vat) ? 20 : tp.vat, obsPct: null, mode: "REN", beneficiaryName: "", roomId: "", co2: null, csr: null };
    const amountEntered = ed && num(ed.obsPct) === 0 && num(ed.obsAmount) > 0 && ed.l1 !== RSE;
    const bn = [{ value: "", label: "—" }].concat(possibleBeneficiaries(c).concat(c.linkedParties.filter((l) => l.type === 2).map((l) => ({ display: "Art. - " + l.lastName }))).map((b) => ({ value: b.display, label: b.display })));
    openForm({
      title: ed ? "Modifier la prestation" : "Ajouter une prestation",
      intro: `${tp.name}${tp.insured ? " · " + roLabel(c, roId) : ""} · règlement ${calc.taxRegime ? "TTC" : "HT"}`,
      fields: [
        { key: "l1", label: "Nature", type: "select", options: l1s, value: st.l1, required: true },
        { key: "l2", label: "Détail", type: "select", options: bens.filter((b) => b.l1 === st.l1).map((b) => b.l2), value: st.l2, required: true },
        { key: "repairer", label: "Bordereau", type: "select", empty: false, options: db.refs.repairers.map((r) => r.name).concat(["Hors bordereau"]), value: st.repairer },
        { key: "mode", label: "Mode d'indemnisation", type: "select", empty: false, options: [{ value: "REN", label: "REN · réparation en nature" }, { value: "IP", label: "IP · indemnité pécuniaire" }], value: st.mode },
        { key: "name", label: "Prestation", value: st.name, required: true, wide: true, list: "dl-prest" },
        { key: "roomId", label: "Pièce", type: "select", options: c.rooms.map((r) => ({ value: r.id, label: r.name })), value: st.roomId },
        { key: "measure", label: "Reprendre une mesure", type: "select", options: [{ value: "floor|m²", label: "Sol (m²)" }, { value: "ceiling|m²", label: "Plafond (m²)" }, { value: "walls|m²", label: "Murs (m²)" }, { value: "perimeter|ml", label: "Périmètre (ml)" }, { value: "skirting|ml", label: "Plinthes (ml)" }], value: "" },
        { key: "qty", label: "Quantité", type: "num", value: st.qty },
        { key: "um", label: "Unité", type: "select", options: L.units.concat(["%"]), value: st.um },
        { key: "unit", label: "Prix unitaire HT €", type: "num", value: st.unit },
        { key: "vat", label: "TVA %", type: "num", value: st.vat, max: 99.99 },
        { key: "obsPct", label: "Vétusté %", type: "num", value: amountEntered ? null : st.obsPct, max: 100 },
        { key: "obsAmt", label: "Vétusté €", type: "num", value: amountEntered ? ed.obsAmount : null, hint: "Un montant saisi remplace le pourcentage." },
        { key: "beneficiaryName", label: "Bénéficiaire", type: "select", empty: false, options: bn, value: st.beneficiaryName, wide: true },
      ],
      extra: `<datalist id="dl-prest"></datalist><div id="rse-box" hidden><p class="muted">La bonification vaut 1 % des prestations en réparation en nature cochées.</p><div class="checks">${renLines.map((d) => `<label><input type="checkbox" class="rse-line" value="${d.id}" checked> ${h(d.name)} · ${eur(d.priceNoVAT)}</label>`).join("") || '<span class="muted">Aucune prestation en réparation en nature.</span>'}</div></div>
        <div id="eco" hidden></div><dl class="kv preview" id="pv"></dl>`,
      onInput(v, form, ev) {
        const t = ev && ev.target, name = t && t.name;
        const isRse = v.l1 === RSE;
        if (name === "l1" || !ev) {
          const s = form.querySelector('[name="l2"]'), keepV = name === "l1" ? "" : st.l2;
          s.innerHTML = '<option value="">—</option>' + bens.filter((b) => b.l1 === v.l1).map((b) => `<option${b.l2 === keepV ? " selected" : ""}>${h(b.l2)}</option>`).join("");
          if (isRse) { s.value = "N/A"; form.querySelector('[name="name"]').value = "1% RSE"; form.querySelector('[name="mode"]').value = "REN"; form.querySelector('[name="um"]').value = "%"; }
          v.l2 = s.value;
        }
        $("#rse-box", form).hidden = !isRse;
        ["qty", "um", "unit", "obsPct", "obsAmt", "roomId", "measure", "repairer", "mode", "name"].forEach((k2) => { const el = form.querySelector(`[data-key="${k2}"]`); if (el) el.hidden = isRse; });
        const offers = db.refs.prices.filter((p) => p.repairer === v.repairer && p.l1 === v.l1 && p.l2 === v.l2);
        $("#dl-prest", form).innerHTML = offers.map((p) => `<option value="${h(p.name)}">`).join("");
        if (name === "name" || name === "repairer") {
          const p = offers.find((x) => x.name === v.name);
          if (p) { form.querySelector('[name="unit"]').value = String(zonePrice(p, c)).replace(".", ","); form.querySelector('[name="um"]').value = p.unit; st.co2 = p.co2; st.csr = p.csr; v.unit = zonePrice(p, c); }
          else if (name === "name") { st.co2 = null; st.csr = null; }
        }
        if (name === "measure" && v.measure && v.roomId) {
          const [mk, mu] = v.measure.split("|"), r = c.rooms.find((x) => x.id === v.roomId);
          if (r) { const q = EC.roomMeasures(r)[mk]; form.querySelector('[name="qty"]').value = String(q).replace(".", ","); form.querySelector('[name="um"]').value = mu; v.qty = q; }
        }
        if (name === "obsAmt" && !blank(v.obsAmt)) { form.querySelector('[name="obsPct"]').value = ""; v.obsPct = null; }
        if (name === "obsPct") { form.querySelector('[name="obsAmt"]').value = ""; v.obsAmt = null; }
        if (isRse) { const ids = [...form.querySelectorAll(".rse-line:checked")].map((x) => x.value); v.unit = r2(EC.sum(renLines.filter((d) => ids.includes(d.id)), (d) => num(d.unit) * num(d.qty))); v.qty = 1; }
        // alternative moins carbonée du même code RSE
        const eco = $("#eco", form), alt = st.csr && db.refs.prices.filter((p) => p.csr === st.csr && num(p.co2) < num(st.co2)).sort((a, b2) => a.co2 - b2.co2)[0];
        eco.hidden = !alt || isRse;
        if (alt && !isRse) { eco.innerHTML = `<p class="eco">Alternative moins carbonée : <strong>${h(alt.name)}</strong>, ${qty(alt.co2)} kg CO2e/${h(alt.unit)} au lieu de ${qty(st.co2)}, ${eur(zonePrice(alt, c))}. <button type="button" class="btn sm" id="eco-apply">Remplacer</button></p>`;
          $("#eco-apply", form).onclick = () => { form.querySelector('[name="name"]').value = alt.name; form.querySelector('[name="repairer"]').value = alt.repairer; form.querySelector('[name="unit"]').value = String(zonePrice(alt, c)).replace(".", ","); form.querySelector('[name="um"]').value = alt.unit; st.co2 = alt.co2; st.csr = alt.csr; form.dispatchEvent(new Event("input")); }; }
        const a = EC.damageAmounts({ l1: v.l1, qty: v.qty, unit: v.unit, vat: v.vat, obsPct: v.obsPct, obsAmountInput: v.obsAmt }, calc.taxRegime);
        $("#pv", form).innerHTML = `<div><dt>Montant HT</dt><dd>${eur(a.priceNoVAT)}</dd></div><div><dt>TVA</dt><dd>${eur(r2(a.priceWithVAT - a.priceNoVAT))}</dd></div><div><dt>Montant TTC</dt><dd>${eur(a.priceWithVAT)}</dd></div>${isRse ? "" : `<div><dt>Vétusté</dt><dd>${eur(a.obsAmount)}</dd></div>`}<div><dt>Vétusté déduite ${calc.taxRegime ? "TTC" : "HT"}</dt><dd>${eur(a.priceWithObs)}</dd></div>`;
      },
      onSubmit(v, form) {
        const isRse = v.l1 === RSE;
        if (isRse) { const ids = [...form.querySelectorAll(".rse-line:checked")].map((x) => x.value); v.unit = r2(EC.sum(renLines.filter((d) => ids.includes(d.id)), (d) => num(d.unit) * num(d.qty))); v.qty = 1; v.um = "%"; v.name = "1% RSE"; v.l2 = "N/A"; v.mode = "REN"; v.obsPct = null; v.obsAmt = null; v.roomId = ""; }
        if (!isRse && blank(v.qty)) return "La quantité est obligatoire";
        if (!isRse && blank(v.unit)) return "Le prix unitaire est obligatoire";
        const a = EC.damageAmounts({ l1: v.l1, qty: v.qty, unit: v.unit, vat: v.vat, obsPct: v.obsPct, obsAmountInput: v.obsAmt }, calc.taxRegime);
        if (!isRse && a.obsAmount > a.base) return "La vétusté ne peut pas dépasser le montant de la prestation";
        const d = ed || { id: uid(), calculationId: calc.id, thirdPartyId: tp.id, riskObjectId: roId };
        const moved = ed && (ed.l1 !== v.l1 || ed.l2 !== v.l2);
        Object.assign(d, { l1: v.l1, l2: v.l2, name: v.name, repairer: v.repairer, mode: v.mode, qty: num(v.qty), um: v.um, unit: num(v.unit), vat: num(v.vat),
          obsPct: r1(a.obsPct), obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT,
          beneficiaryName: v.beneficiaryName, roomId: v.roomId || null, co2: st.co2, csr: st.csr });
        if (!ed || moved) d.lineIndex = EC.nextLineIndex(scope.filter((x) => x.id !== d.id), v.l1, v.l2);
        d.irsiAmount = EC.irsiAmount(benefitOf(v.l1, v.l2), d);
        if (!ed) e.damages.push(d);
        touch(e, calc);
      },
    });
  }
  const r1 = EC.r1;

  function openMbvForm(id) {
    const c = cur(), e = est(), { tp, roId } = dmgScope(c, e);
    const calc = getCalc(e, tp.id, roId, true);
    const ed = id ? e.damages.find((d) => d.id === id) : null;
    const scope = scopeDamages(e, tp, roId).filter((d) => d.l1 === MBV);
    const irsi = c.irsiEnabled ? "true" : "false";
    const cats = db.refs.benefits.filter((b) => b.l1 === MBV && (blank(b.rec) || b.rec === irsi)).map((b) => b.l2);
    const st = ed || { vat: blank(tp.vat) ? 20 : tp.vat };
    const amountEntered = ed && num(ed.obsPct) === 0 && num(ed.obsAmount) > 0;
    openForm({
      title: ed ? "Modifier le bien" : "Ajouter un bien mobilier",
      intro: `${tp.name}${tp.insured ? " · " + roLabel(c, roId) : ""} · règlement ${calc.taxRegime ? "TTC" : "HT"} · indemnité pécuniaire`,
      fields: [
        { key: "l2", label: "Catégorie", type: "select", options: cats, value: st.l2, required: true },
        { key: "name", label: "Mobilier ou bien", value: st.name, required: true },
        { key: "goodStatus", label: "État du bien", type: "select", options: L.goodStatus, value: st.goodStatus, required: true },
        { key: "proof", label: "Justificatif", type: "select", options: L.proofs, value: st.proof, required: true },
        { key: "brand", label: "Marque", value: st.brand }, { key: "reference", label: "Référence", value: st.reference },
        { key: "purchaseDate", label: "Date d'achat", type: "date", value: st.purchaseDate },
        { key: "roomId", label: "Pièce", type: "select", options: c.rooms.map((r) => ({ value: r.id, label: r.name })), value: st.roomId },
        { key: "claimedAmount", label: "Montant réclamé €", type: "num", value: st.claimedAmount },
        { key: "vat", label: "TVA %", type: "select", options: L.vat.map((x) => ({ value: x, label: String(x).replace(".", ",") })), value: st.vat },
        { key: "ht", label: "Valeur à neuf HT €", type: "num", value: ed ? ed.unit : null, required: true },
        { key: "ttc", label: "Valeur à neuf TTC €", type: "num", value: ed ? ed.priceWithVAT : null, hint: "Saisir le TTC recalcule le HT." },
        { key: "obsPct", label: "Vétusté %", type: "num", value: amountEntered ? null : st.obsPct, max: 100 },
        { key: "obsAmt", label: "Vétusté €", type: "num", value: amountEntered ? ed.obsAmount : null },
        { key: "eqBrand", label: "Marque équivalente", value: st.eqBrand }, { key: "eqReference", label: "Référence équivalente", value: st.eqReference },
      ],
      extra: `<dl class="kv preview" id="pv"></dl>`,
      onInput(v, form, ev) {
        const name = ev && ev.target && ev.target.name;
        v.vat = v.vat === "" ? null : parseFloat(v.vat);
        if (name === "ttc" && !blank(v.ttc)) { v.ht = EC.htFromTtc(v.ttc, v.vat); form.querySelector('[name="ht"]').value = n2(v.ht); }
        else if (name === "ht" || name === "vat") { form.querySelector('[name="ttc"]').value = blank(v.ht) ? "" : n2(r2(num(v.ht) * (1 + num(v.vat) / 100))); }
        if (name === "obsAmt" && !blank(v.obsAmt)) { form.querySelector('[name="obsPct"]').value = ""; v.obsPct = null; }
        if (name === "obsPct") { form.querySelector('[name="obsAmt"]').value = ""; v.obsAmt = null; }
        const a = EC.mbvAmounts({ ht: v.ht, vat: v.vat, obsPct: v.obsPct, obsAmountInput: v.obsAmt }, calc.taxRegime);
        $("#pv", form).innerHTML = `<div><dt>Valeur à neuf HT</dt><dd>${eur(a.priceNoVAT)}</dd></div><div><dt>Valeur à neuf TTC</dt><dd>${eur(a.priceWithVAT)}</dd></div><div><dt>Vétusté</dt><dd>${eur(a.obsAmount)}</dd></div><div><dt>Vétusté déduite ${calc.taxRegime ? "TTC" : "HT"}</dt><dd>${eur(a.priceWithObs)}</dd></div>`;
      },
      onSubmit(v) {
        v.vat = v.vat === "" ? null : parseFloat(v.vat);
        const a = EC.mbvAmounts({ ht: v.ht, vat: v.vat, obsPct: v.obsPct, obsAmountInput: v.obsAmt }, calc.taxRegime);
        if (a.obsAmount > a.base) return "La vétusté ne peut pas dépasser la valeur du bien";
        const d = ed || { id: uid(), calculationId: calc.id, thirdPartyId: tp.id, riskObjectId: roId, lineIdentifier: uid() };
        const moved = ed && ed.l2 !== v.l2;
        Object.assign(d, { l1: MBV, l2: v.l2, name: v.name, goodStatus: v.goodStatus, proof: v.proof, brand: v.brand, reference: v.reference, purchaseDate: v.purchaseDate,
          roomId: v.roomId || null, claimedAmount: v.claimedAmount, eqBrand: v.eqBrand, eqReference: v.eqReference, qty: 1, um: "U", unit: r2(v.ht), vat: num(v.vat),
          obsPct: r1(a.obsPct), obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT, mode: "IP", beneficiaryName: "" });
        if (!ed || moved) d.lineIndex = EC.nextLineIndex(scope.filter((x) => x.id !== d.id), MBV, v.l2);
        d.irsiAmount = EC.mbvIrsiAmount(benefitOf(MBV, v.l2), { ht: v.ht, obsPct: a.obsPct });
        if (!ed) e.damages.push(d);
        touch(e, calc);
      },
    });
  }

  /* ----- Garanties ----- */
  function stanceValid(s) { return !blank(s.stance) && (s.stance === 1 || !blank(s.comment)); }
  function vGaranties(c, e) {
    if (!hasCoverages(c)) return `<section class="head"><div><h1>Prise de position sur les garanties</h1></div></section><div class="empty"><p>Aucun contrat ni garantie sur ce dossier : la prise de position n'est pas requise. Le bénéficiaire sera rattaché à une garantie choisie dans la liste.</p><button class="btn" data-act="step" data-step="parties">Saisir des garanties</button></div>`;
    const dis = readOnly() ? " disabled" : "";
    const rows = c.coverages.map((cv) => {
      const s = e.stances.find((x) => x.coverageId === cv.id) || {};
      const bad = !blank(s.stance) && !stanceValid(s);
      return `<tr><td><strong>${h(cv.policyNumber)}</strong> · ${h([cv.coverageType, cv.complementary].filter(Boolean).join(" · "))}<br><small class="muted">${h([cv.precision, cv.insurerLabel].filter(Boolean).join(" · "))}</small></td>
        <td>${sel("st-" + cv.id, "stance", [{ value: "", label: "Non prise" }, { value: 1, label: "Sans réserve" }, { value: 2, label: "Avec réserve" }, { value: 3, label: "Garantie non applicable" }], s.stance, `data-id="${cv.id}" data-k="stance"${dis}`)}</td>
        <td><input id="sc-${cv.id}" data-chg="stance" data-id="${cv.id}" data-k="comment" value="${h(s.comment || "")}" class="${bad ? "bad" : ""}" placeholder="${s.stance > 1 ? "Commentaire obligatoire" : ""}"${dis || (blank(s.stance) ? " disabled" : "")}></td>
        <td class="r"><input id="sn-${cv.id}" class="num" inputmode="decimal" data-chg="stance" data-id="${cv.id}" data-k="notCovered" value="${n2(s.notCovered)}"${dis || (blank(s.stance) ? " disabled" : "")}></td></tr>`;
    }).join("");
    const taken = e.stances.filter((s) => !blank(s.stance));
    const ok = taken.length > 0 && taken.every(stanceValid);
    return `<section class="head"><div><h1>Prise de position sur les garanties</h1><p class="muted">Seules les garanties applicables, avec ou sans réserve, ouvrent droit à indemnisation.</p></div></section>
      ${ok ? "" : `<p class="banner warn">${taken.length ? "Un commentaire est obligatoire pour une garantie avec réserve ou non applicable." : "Prenez position sur au moins une garantie."}</p>`}
      <section class="panel flush">${tbl(["Garantie", "Position", "Commentaire", "Montant des dommages non couverts €"], rows, "")}</section>`;
  }

  /* ----- Bénéficiaires ----- */
  const compensableStances = (e) => e.stances.filter((s) => s.stance === 1 || s.stance === 2);
  function vBeneficiaires(c, e) {
    const dis = readOnly() ? " disabled" : "";
    if (hasCoverages(c) && !compensableStances(e).length) return `<section class="head"><div><h1>Bénéficiaires</h1></div></section><div class="empty"><p>Aucune garantie applicable : prenez d'abord position sur les garanties.</p><button class="btn" data-act="step" data-step="garanties">Garanties</button></div>`;
    const rows = e.beneficiaries.map((b) => { const l = benLabel(c, e, b); return `<tr><td>${h(l.what)}</td><td>${h(l.who)}</td><td class="acts"><button class="btn sm ghost danger-t" data-act="del-ben" data-id="${b.id}"${dis}>Supprimer</button></td></tr>`; }).join("");
    return `<section class="head"><div><h1>Bénéficiaires</h1><p class="muted">Un bénéficiaire reçoit l'indemnité au titre d'une garantie.</p></div><div class="actions"><button class="btn primary" data-act="add-ben"${dis}>Ajouter un bénéficiaire</button></div></section>
      <section class="panel flush">${tbl(["Garantie", "Bénéficiaire", ""], rows, "Aucun bénéficiaire. Ajoutez au moins l'assuré pour ventiler l'indemnité.")}</section>`;
  }

  /* ----- Indemnisations ----- */
  function vIndemn(c, e) {
    const title = `<section class="head"><div><h1>Indemnisations</h1></div></section>`;
    if (hasCoverages(c) && !compensableStances(e).length) return title + `<div class="empty"><p>Aucune garantie applicable : prenez d'abord position sur les garanties.</p><button class="btn" data-act="step" data-step="garanties">Garanties</button></div>`;
    if (!e.beneficiaries.length) return title + `<div class="empty"><p>Ajoutez un bénéficiaire avant de ventiler l'indemnité.</p><button class="btn" data-act="step" data-step="beneficiaires">Bénéficiaires</button></div>`;
    const groups = groupsOf(c, e);
    if (!groups.length) return title + `<div class="empty"><p>Aucun dommage chiffré pour l'assuré sur cette estimation.</p><button class="btn" data-act="step" data-step="dommages">Dommages</button></div>`;
    if (!e.beneficiaries.some((b) => b.id === ui.benId)) ui.benId = e.beneficiaries[0].id;
    const ben = e.beneficiaries.find((b) => b.id === ui.benId), ro = readOnly(), dis = ro ? " disabled" : "";
    const st = e.stances.find((s) => s.id === ben.stanceId), cv = st && c.coverages.find((x) => x.id === st.coverageId);
    const covered = (cv && cv.coveredRiskObjects) || [];
    const err = EC.compensationError(groups, e.beneficiaries);
    const benList = e.beneficiaries.map((b) => { const l = benLabel(c, e, b), t = EC.beneficiaryTotals(groups, b); return `<button class="ben${b.id === ben.id ? " on" : ""}" data-act="sel-ben" data-id="${b.id}"><strong>${h(l.who)}</strong><span class="muted">${h(l.what)}</span><span class="ben-amt">${eur(r2(t.totalImmediate + t.totalDeferred))}</span></button>`; }).join("");
    const ninp = (id, k, key, val, extra) => `<input id="${id}" class="num${extra && extra.bad ? " bad" : ""}" inputmode="decimal" data-chg="comp" data-k="${k}" data-key="${h(key)}" value="${val}"${dis}${extra && extra.dis ? " disabled" : ""} aria-label="${k}">`;
    let rows = "";
    const shown = groups.filter((g) => !ui.onlyMine || g.beneficiaryId === ben.id);
    const sects = [...new Set(shown.map((g) => g.riskObjectId + "|" + g.l1))];
    let lastRo = undefined, i = 0;
    for (const sk of sects) {
      const [roId, l1] = [sk.slice(0, sk.indexOf("|")), sk.slice(sk.indexOf("|") + 1)];
      const gs = shown.filter((g) => g.riskObjectId + "|" + g.l1 === sk);
      const all = groups.filter((g) => g.riskObjectId + "|" + g.l1 === sk);
      if (roId !== lastRo) { rows += `<tr class="ro"><td colspan="11">${h(roLabel(c, roId === "null" ? null : roId))}</td></tr>`; lastRo = roId; }
      const mine = all.filter((g) => g.beneficiaryId === ben.id), free = all.filter((g) => !g.beneficiaryId);
      const canRo = !covered.length || covered.includes(gs[0].riskObjectId);
      rows += `<tr class="l1"><td><label class="ck"><input type="checkbox" id="cn-${i}" data-chg="comp-l1" data-sk="${h(sk)}"${mine.length && !free.length ? " checked" : ""}${dis}${!canRo || (!free.length && !mine.length) ? " disabled" : ""}> ${h(l1)}</label></td>
        <td class="r">${eur(EC.sum(mine, EC.gBase))}</td><td class="r">${eur(EC.sum(mine, (g) => g.obsTotal))}</td><td></td><td class="r">${eur(EC.sum(mine, (g) => g.cAmt))}</td>
        <td class="r"><input id="l1c-${i}" class="num" inputmode="decimal" data-chg="comp-l1ceil" data-sk="${h(sk)}" value="${n2((mine[0] || {}).level1Ceiling)}" placeholder="Plafond"${dis}${mine.length ? "" : " disabled"} aria-label="Plafond de la nature"></td>
        <td class="r">${eur(EC.sum(mine, (g) => g.immediate))}</td><td class="r">${eur(EC.sum(mine, (g) => g.deferred))}</td><td class="r">${eur(EC.sum(mine, EC.obsOverdraft))}</td><td class="r">${eur(EC.sum(mine, EC.ceilingOverrun))}</td><td></td></tr>`;
      for (const g of gs) {
        i++;
        const isMine = g.beneficiaryId === ben.id, other = g.beneficiaryId && !isMine;
        const ob = other ? e.beneficiaries.find((b) => b.id === g.beneficiaryId) : null;
        const over = !blank(g.ceiling) && r2(g.immediate + g.deferred) > r2(g.ceiling);
        const tooMuch = g.l1 !== RSE && r2(g.immediate + g.deferred) > r2(EC.gBase(g) - g.obsTotal + num(g.cAmt));
        const lock = { dis: !isMine };
        rows += `<tr class="l3${isMine ? " mine" : ""}"><td><label class="ck"><input type="checkbox" id="cg-${i}" data-chg="comp-check" data-key="${h(g.key)}"${isMine ? " checked" : ""}${dis}${other || !canRo ? " disabled" : ""}> ${h(g.l2)} <span class="muted">(${h(g.mode)})</span></label>${g.beneficiaryName ? `<br><small class="muted">${h(g.beneficiaryName)}</small>` : ""}${other ? `<br><small class="muted">Ventilé vers ${h(benLabel(c, e, ob).who)}</small>` : ""}${!canRo && !other ? `<br><small class="muted">Objet de risque non couvert par cette garantie</small>` : ""}</td>
          <td class="r">${eur(EC.gBase(g))}<br><small class="muted">${g.isTaxed ? "TTC" : "HT"}</small></td><td class="r">${eur(g.obsTotal)}</td>
          <td class="r">${ninp("cp-" + i, "cPct", g.key, isMine ? pct(g.cPct) : "", lock)}</td><td class="r">${ninp("ca-" + i, "cAmt", g.key, isMine ? n2(g.cAmt) : "", lock)}</td>
          <td class="r">${ninp("cc-" + i, "ceiling", g.key, n2(g.ceiling), { dis: other, bad: over })}</td>
          <td class="r">${ninp("ci-" + i, "immediate", g.key, isMine ? n2(g.immediate) : "", { dis: !isMine, bad: isMine && (over || tooMuch) })}</td><td class="r">${ninp("cd-" + i, "deferred", g.key, isMine ? n2(g.deferred) : "", { dis: !isMine, bad: isMine && (over || tooMuch) })}</td>
          <td class="r">${isMine ? eur(EC.obsOverdraft(g)) : ""}</td><td class="r">${eur(EC.ceilingOverrun(g))}</td><td></td></tr>`;
      }
      i++;
    }
    const t = EC.beneficiaryTotals(groups, ben);
    const bin = (id, k, val) => `<input id="${id}" class="num" inputmode="decimal" data-chg="ben" data-k="${k}" value="${n2(val)}"${dis}>`;
    const totals = `<section class="panel totals"><h2>Total pour ${h(benLabel(c, e, ben).who)}</h2><div class="tw"><table><thead><tr><th></th><th class="r">Indemnité immédiate €</th><th class="r">Indemnité différée €</th></tr></thead><tbody>
      <tr><td>Total des lignes ventilées</td><td class="r">${eur(t.subImmediate)}</td><td class="r">${eur(t.subDeferred)}</td></tr>
      <tr><td><label for="bn-discount">Remise %</label> <input id="bn-discount" class="num xs" inputmode="decimal" data-chg="ben" data-k="discount" value="${pct(ben.discount)}"${dis}></td><td class="r">${eur(t.discountedImmediate)}</td><td class="r">${eur(t.discountedDeferred)}</td></tr>
      <tr><td>Pénalités</td><td class="r">${bin("bn-pen", "penalization", ben.penalization)}</td><td class="r">${bin("bn-dpen", "deferredPenalization", ben.deferredPenalization)}</td></tr>
      <tr><td>Franchise <span class="req">*</span></td><td class="r">${bin("bn-ded", "deductible", ben.deductible)}</td><td class="r">${bin("bn-dded", "deferredDeductible", ben.deferredDeductible)}</td></tr>
      <tr class="tot"><td>TOTAL INDEMNISATION</td><td class="r">${eur(t.totalImmediate)}</td><td class="r">${eur(t.totalDeferred)}</td></tr></tbody></table></div>
      <p class="muted">Vétusté non récupérable : ${eur(t.overdraft)} · dépassement de plafond : ${eur(t.ceilingOverrun)}</p></section>`;
    return title + (err ? `<p class="banner err" role="alert">${h(err)}</p>` : "") + `<div class="indemn"><aside class="bens"><h2>Bénéficiaires</h2>${benList}<button class="link" data-act="step" data-step="beneficiaires">Gérer les bénéficiaires</button></aside><div class="indemn-main">
      <div class="filters"><div class="fld"><label>Assiette de la vétusté contractuelle</label>${toggle("opt", "comp-option", ui.option === 2, "Valeur à neuf", "Vétusté déduite", ro)}</div>
        <div class="fld"><label for="gen-pct">Vétusté contractuelle récupérable %</label><span class="join"><input id="gen-pct" class="num xs" inputmode="decimal" data-chg="gen-pct" value="${pct(ui.genericPct)}"${dis}><button class="btn sm" data-act="apply-gen"${dis}>Appliquer aux lignes ventilées</button></span></div>
        <div class="fld"><label class="inline"><input type="checkbox" id="only-mine" data-chg="only-mine"${ui.onlyMine ? " checked" : ""}> Lignes de ce bénéficiaire seulement</label></div></div>
      <section class="panel flush">${tbl(["Nature", "Dommages €", "Vétusté €", "Vét. récup. %", "Vét. récup. €", "Plafond €", "Indemnité immédiate €", "Indemnité différée €", "Vét. non récup. €", "Dépassement plafond €", ""], rows, "")}</section>
      ${totals}
      <section class="panel"><div class="fld"><label for="position">Position de l'assuré sur l'indemnisation <span class="req">*</span></label>${sel("position", "position", [{ value: "", label: "À sélectionner" }].concat(L.positions), e.position, dis)}</div></section></div></div>`;
  }

  /* ----- Synthèse ----- */
  function liveIrsi(c, e) { return !c.irsiEnabled ? null : e.status === 1 ? EC.irsiBase(e.damages, calcMap(e)) : e.irsiBase; }
  function vSynthese(c, e) {
    const cat = STATUS[e.status].cat, groups = groupsOf(c, e), irsi = liveIrsi(c, e);
    const act = cat === "Brouillon" ? `<button class="btn primary" data-act="verify">Vérifier l'estimation</button>`
      : cat === "Vérifiée" ? `<button class="btn primary" data-act="advance" data-to="4">Exporter et verrouiller</button><button class="btn ghost" data-act="verify">Vérifier à nouveau</button>`
      : cat === "Exportée" ? `<button class="btn primary" data-act="advance" data-to="4">Marquer comme communiquée à l'assureur</button>`
      : cat === "Communiquée" ? `<button class="btn primary" data-act="advance" data-to="4">Figer l'estimation</button>` : "";
    const tabs = [["main", "Synthèse"], ["detail", "Détail des dommages"], ["comp", "Indemnisations"], ["rooms", "Localisations"]];
    let body = "";
    if (ui.synthTab === "main") {
      body = c.thirdParties.map((tp) => {
        const ds = e.damages.filter((d) => d.thirdPartyId === tp.id); if (!ds.length) return "";
        const keys = [...new Set(ds.map((d) => { const b = benefitOf(d.l1, d.l2) || {}; return (b.synth1 || d.l1) + "|" + d.l1; }))];
        const line = (label, x, cls) => `<tr class="${cls || ""}"><td>${label}</td><td class="r">${eur(EC.sum(x, (d) => d.priceNoVAT))}</td><td class="r">${eur(EC.sum(x, (d) => d.priceWithVAT))}</td><td class="r">${eur(EC.sum(x, (d) => (d.l1 === RSE ? 0 : d.obsAmount)))}</td><td class="r">${eur(EC.sum(x, (d) => d.priceWithObs))}</td></tr>`;
        const calc = (tp.insured ? e.calculations.filter((k) => k.thirdPartyId === tp.id) : [getCalc(e, tp.id, null)]).filter(Boolean);
        return `<section class="panel flush"><div class="panel-h pad"><h2>${h(tp.name)} ${tp.insured ? '<span class="pill s-ver">Assuré</span>' : ""}</h2><span class="muted">Montant réclamé : ${eur(EC.sum(calc, (k) => k.claimedAmount) || null)}</span></div>
          ${tbl(["Nature", "Valeur à neuf HT €", "Valeur à neuf TTC €", "Montant vétusté €", "Montant vétusté déduite €"], keys.map((k) => { const [s1, l1] = k.split("|"); return line(`${h(l1)} <small class="muted">${h(s1)}</small>`, ds.filter((d) => d.l1 === l1)); }).join("") + line("TOTAL", ds, "tot"), "")}</section>`;
      }).join("") || `<div class="empty"><p>Aucun dommage chiffré sur cette estimation.</p></div>`;
    } else if (ui.synthTab === "detail") {
      const ds = e.damages.slice().sort((a, b) => (a.thirdPartyId + a.lineIndex < b.thirdPartyId + b.lineIndex ? -1 : 1));
      body = `<section class="panel flush">${tbl(["Tiers", "Nature", "Détail", "Désignation", "Pièce", "Qté", "Prix unitaire €", "Montant HT €", "TVA %", "Montant TTC €", "Vétusté €", "Montant VD €", "Mode"],
        ds.map((d) => `<tr><td>${h((c.thirdParties.find((t) => t.id === d.thirdPartyId) || {}).name)}</td><td>${h(d.l1)}</td><td>${h(d.l2)}</td><td>${h(d.name)}</td><td>${h((c.rooms.find((r) => r.id === d.roomId) || {}).name || "")}</td><td class="r">${qty(d.qty)} ${h(d.um || "")}</td><td class="r">${eur(d.unit)}</td><td class="r">${eur(d.priceNoVAT)}</td><td class="r">${pct(d.vat)}</td><td class="r">${eur(d.priceWithVAT)}</td><td class="r">${eur(d.l1 === RSE ? 0 : d.obsAmount)}</td><td class="r">${eur(d.priceWithObs)}</td><td>${h(d.mode)}</td></tr>`).join(""), "Aucune ligne.")}</section>`;
    } else if (ui.synthTab === "comp") {
      body = e.beneficiaries.map((b) => {
        const l = benLabel(c, e, b), t = EC.beneficiaryTotals(groups, b), mine = groups.filter((g) => g.beneficiaryId === b.id);
        return `<section class="panel flush"><div class="panel-h pad"><h2>${h(l.who)}</h2><span class="muted">${h(l.what)}</span></div>${tbl(["Nature", "Dommages €", "Vétusté €", "Vét. récup. €", "Plafond €", "Indemnité immédiate €", "Indemnité différée €"],
          mine.map((g) => `<tr><td>${h(g.l1)} · ${h(g.l2)} <span class="muted">(${h(g.mode)})</span></td><td class="r">${eur(EC.gBase(g))}</td><td class="r">${eur(g.obsTotal)}</td><td class="r">${eur(g.cAmt)}</td><td class="r">${eur(g.ceiling)}</td><td class="r">${eur(g.immediate)}</td><td class="r">${eur(g.deferred)}</td></tr>`).join("") +
          `<tr><td colspan="5">Remise ${pct(b.discount) || 0} % · pénalités ${eur(num(b.penalization))} / ${eur(num(b.deferredPenalization))} · franchise ${eur(b.deductible)} / ${eur(b.deferredDeductible)}</td><td class="r">${eur(t.discountedImmediate)}</td><td class="r">${eur(t.discountedDeferred)}</td></tr><tr class="tot"><td colspan="5">TOTAL INDEMNISATION</td><td class="r">${eur(t.totalImmediate)}</td><td class="r">${eur(t.totalDeferred)}</td></tr>`, "")}</section>`;
      }).join("") || `<div class="empty"><p>Aucun bénéficiaire sur cette estimation.</p></div>`;
      if (e.position) body += `<p class="muted">Position de l'assuré : ${h(e.position)}</p>`;
    } else {
      body = `<section class="panel flush">${tbl(["Pièce", "Type", "Dimensions", "Sol m²", "Murs m²", "Plafond m²", "Périmètre ml", "Plinthes ml"], c.rooms.map((r) => { const m = EC.roomMeasures(r); return `<tr><td>${h(r.name)}</td><td>${h(r.roomType)}</td><td>${qty(m.length)} × ${qty(m.width)} × ${qty(m.height)} m</td><td class="r">${n2(m.floor)}</td><td class="r">${n2(m.walls)}</td><td class="r">${n2(m.ceiling)}</td><td class="r">${n2(m.perimeter)}</td><td class="r">${n2(m.skirting)}</td></tr>`; }).join(""), "Aucune pièce.")}</section>`;
    }
    const ins = insured(c), ttc = EC.sum(e.damages, (d) => d.priceWithVAT), indem = EC.sum(e.beneficiaries, (b) => { const t = EC.beneficiaryTotals(groups, b); return t.totalImmediate + t.totalDeferred; });
    return `<section class="head"><div><h1>Synthèse</h1><p class="muted">${h(c.number || "")} · ${h(ins ? ins.name : "")} · ${h(e.name)}</p></div><div class="actions">${act}<button class="btn ghost" data-act="export-csv">Exporter en CSV</button>${window.claude ? "" : `<button class="btn ghost" data-act="print">Imprimer</button>`}</div></section>
      <dl class="kv big"><div><dt>Dommages TTC</dt><dd>${eur(ttc)}</dd></div><div><dt>Dommages vétusté déduite</dt><dd>${eur(EC.sum(e.damages, (d) => d.priceWithObs))}</dd></div><div><dt>Indemnisation totale</dt><dd>${eur(indem)}</dd></div><div><dt>IRSI, assiette du local</dt><dd>${c.irsiEnabled && !blank(irsi) ? eur(irsi) : "Non calculée"}</dd></div></dl>
      <div class="tabs">${tabs.map(([k, label]) => `<button class="${ui.synthTab === k ? "on" : ""}" data-act="synth-tab" data-v="${k}">${label}</button>`).join("")}</div>${body}`;
  }

  /* ----- Référentiels ----- */
  function vRefs() {
    const R = db.refs;
    return `<section class="head"><div><h1>Référentiels</h1><p class="muted">Natures, bordereaux de prix et réparateurs. Les valeurs fournies sont des exemples : remplacez-les par vos référentiels.</p></div><div class="actions"><label class="btn ghost" for="imp-refs">Importer (JSON)<input type="file" id="imp-refs" accept=".json" hidden></label><button class="btn ghost" data-act="export-refs">Exporter (JSON)</button><button class="btn ghost danger-t" data-act="reset-refs">Rétablir les exemples</button></div></section>` +
      sect("Natures et détails", "edit-benefit", "Ajouter", tbl(["Nature", "Détail", "Regroupement synthèse", "Nature IRSI", ""], R.benefits.map((b, i) => `<tr><td>${h(b.l1)}</td><td>${h(b.l2)}</td><td>${h(b.synth1)}</td><td>${h(b.damageREC)}</td><td class="acts"><button class="btn sm ghost danger-t" data-act="del-benefit" data-i="${i}">Supprimer</button></td></tr>`).join(""), "Aucune nature.")) +
      sect("Bordereaux de prix", "edit-price", "Ajouter", `<p><label class="btn sm ghost" for="imp-prices">Importer un bordereau CSV<input type="file" id="imp-prices" accept=".csv,text/csv" hidden></label> <small class="muted">Colonnes : repairer;l1;l2;name;unit;z1;z2;z3;z4;z5;co2;csr</small></p>` + tbl(["Bordereau", "Nature", "Détail", "Prestation", "Unité", "Prix zone 1 €", "Prix zone 5 €", "CO2e kg", "Code RSE", ""], R.prices.map((p, i) => `<tr><td>${h(p.repairer)}</td><td>${h(p.l1)}</td><td>${h(p.l2)}</td><td>${h(p.name)}</td><td>${h(p.unit)}</td><td class="r">${eur(p.prices[0])}</td><td class="r">${eur(p.prices[4])}</td><td class="r">${qty(p.co2)}</td><td>${h(p.csr)}</td><td class="acts"><button class="btn sm ghost danger-t" data-act="del-price" data-i="${i}">Supprimer</button></td></tr>`).join(""), "Aucun prix.")) +
      sect("Réparateurs et bordereaux", "edit-repairer", "Ajouter", tbl(["Nom", "Description", ""], R.repairers.map((r, i) => `<tr><td>${h(r.name)}</td><td>${h(r.description)}</td><td class="acts"><button class="btn sm ghost danger-t" data-act="del-repairer" data-i="${i}">Supprimer</button></td></tr>`).join(""), "Aucun réparateur."));
  }

  /* ---------- Fichiers ---------- */
  async function saveFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    try {
      const d = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (d) { await d.save({ filename, data: blob }); return; }
    } catch (err) { if (err && err.code === "declined") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    catch (err) { toast("Le téléchargement n'est pas disponible dans cette vue.", "err"); }
  }
  function readFile(input, cb) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { cb(String(r.result)); input.value = ""; }; r.readAsText(f);
  }
  function csvExport(c, e) {
    const q = (x) => { const s = blank(x) ? "" : typeof x === "number" ? String(r2(x)).replace(".", ",") : String(x); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [["Dossier", c.number, "Estimation", e.name, "Statut", STATUS[e.status].label], [],
      ["DOMMAGES"], ["Tiers", "Objet de risque", "Nature", "Détail", "Désignation", "Pièce", "Quantité", "Unité", "Prix unitaire HT", "Montant HT", "TVA %", "Montant TTC", "Vétusté %", "Vétusté", "Vétusté déduite", "Mode", "Bénéficiaire", "CO2e kg"]];
    e.damages.slice().sort((a, b) => (a.thirdPartyId + a.lineIndex < b.thirdPartyId + b.lineIndex ? -1 : 1)).forEach((d) => rows.push([(c.thirdParties.find((t) => t.id === d.thirdPartyId) || {}).name, d.riskObjectId ? roLabel(c, d.riskObjectId) : "", d.l1, d.l2, d.name, (c.rooms.find((r) => r.id === d.roomId) || {}).name, d.qty, d.um, d.unit, d.priceNoVAT, d.vat, d.priceWithVAT, d.obsPct, d.l1 === RSE ? 0 : d.obsAmount, d.priceWithObs, d.mode, d.beneficiaryName, num(d.co2) * num(d.qty)]));
    const groups = groupsOf(c, e);
    rows.push([], ["INDEMNISATIONS"], ["Bénéficiaire", "Garantie", "Nature", "Détail", "Mode", "Dommages", "Vétusté", "Vétusté récupérable %", "Vétusté récupérable", "Plafond", "Indemnité immédiate", "Indemnité différée"]);
    e.beneficiaries.forEach((b) => { const l = benLabel(c, e, b), t = EC.beneficiaryTotals(groups, b);
      groups.filter((g) => g.beneficiaryId === b.id).forEach((g) => rows.push([l.who, l.what, g.l1, g.l2, g.mode, EC.gBase(g), g.obsTotal, g.cPct, g.cAmt, g.ceiling, g.immediate, g.deferred]));
      rows.push([l.who, l.what, "Remise %", b.discount, "", "", "", "", "", "", t.discountedImmediate, t.discountedDeferred], [l.who, l.what, "Pénalités", "", "", "", "", "", "", "", num(b.penalization), num(b.deferredPenalization)], [l.who, l.what, "Franchise", "", "", "", "", "", "", "", num(b.deductible), num(b.deferredDeductible)], [l.who, l.what, "TOTAL INDEMNISATION", "", "", "", "", "", "", "", t.totalImmediate, t.totalDeferred]); });
    rows.push([], ["Position de l'assuré", e.position || ""], ["IRSI assiette du local", liveIrsi(c, e)]);
    return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
  }

  /* ---------- Actions ---------- */
  function duplicateEstimate(c, id) {
    const src = c.estimates.find((x) => x.id === id), n = clone(src), fresh = newEstimate(c);
    const calcIds = {}, stIds = {}, benIds = {};
    n.id = fresh.id; n.name = fresh.name; n.status = 1; n.statusDate = fresh.statusDate; n.active = false;
    n.calculations.forEach((k) => { calcIds[k.id] = k.id = uid(); });
    n.damages.forEach((d) => { d.id = uid(); d.calculationId = calcIds[d.calculationId]; });
    n.stances.forEach((s) => { stIds[s.id] = s.id = uid(); });
    n.beneficiaries.forEach((b) => { benIds[b.id] = b.id = uid(); if (b.stanceId) b.stanceId = stIds[b.stanceId]; });
    Object.values(n.comps).forEach((k) => { if (k.beneficiaryId) k.beneficiaryId = benIds[k.beneficiaryId]; });
    c.estimates.push(n); ui.estId = n.id; save();
    toast(n.name + " créée en brouillon à partir de " + src.name);
  }
  function mutateGroups(fn) {
    const c = cur(), e = est(); if (readOnly()) return;
    const groups = groupsOf(c, e); fn(groups, e); storeGroups(e, groups); touch(e);
  }
  function seedDemo() {
    const c = ECData.demoCase(), e = newEstimate(c); e.id = "demo-est"; c.estimates.push(e);
    const k = getCalc(e, "tp1", "ro1", true), k2 = getCalc(e, "tp2", null, true); k.claimedAmount = 5200;
    const P = (name) => db.refs.prices.find((p) => p.name === name) || ECData.refs.prices.find((p) => p.name === name);
    const add = (calc, name, q, roomId, obsPct, mode) => { const p = P(name), d = { id: uid(), calculationId: calc.id, thirdPartyId: calc.thirdPartyId, riskObjectId: calc.riskObjectId, l1: p.l1, l2: p.l2, name: p.name, repairer: p.repairer, mode, qty: q, um: p.unit, unit: p.prices[c.zone - 1], vat: 10, beneficiaryName: "", roomId, co2: p.co2, csr: p.csr };
      const a = EC.damageAmounts({ ...d, obsPct }, calc.taxRegime); Object.assign(d, { obsPct: a.obsPct, obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT });
      d.lineIndex = EC.nextLineIndex(e.damages.filter((x) => x.calculationId === calc.id && x.l1 !== MBV), d.l1, d.l2); d.irsiAmount = EC.irsiAmount(ECData.refs.benefits.find((b) => b.l1 === d.l1 && b.l2 === d.l2), d); e.damages.push(d); };
    const m1 = EC.roomMeasures(c.rooms[0]), m2 = EC.roomMeasures(c.rooms[1]);
    add(k, "Lessivage et préparation des supports", m1.walls, "rm1", 0, "IP");
    add(k, "Peinture acrylique murs, 2 couches", m1.walls, "rm1", 20, "IP");
    add(k, "Peinture acrylique plafond, 2 couches", m1.ceiling, "rm1", 20, "IP");
    add(k, "Dépose de parquet stratifié", m2.floor, "rm2", 0, "REN");
    add(k, "Parquet stratifié, fourniture et pose", m2.floor, "rm2", 25, "REN");
    add(k, "Plinthes médium à peindre", m2.skirting, "rm2", 25, "REN");
    add(k, "Déshumidificateur, pose et location 7 jours", 2, "rm1", 0, "IP");
    add(k2, "Remplacement flexible et robinet d'arrêt", 1, "rm1", 0, "IP");
    const mb = (l2, name, ht, obsPct, status, proof) => { const a = EC.mbvAmounts({ ht, vat: 20, obsPct }, k.taxRegime), d = { id: uid(), lineIdentifier: uid(), calculationId: k.id, thirdPartyId: "tp1", riskObjectId: "ro1", l1: MBV, l2, name, goodStatus: status, proof, qty: 1, um: "U", unit: ht, vat: 20, mode: "IP", beneficiaryName: "", roomId: "rm1", obsPct: a.obsPct, obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT };
      d.lineIndex = EC.nextLineIndex(e.damages.filter((x) => x.l1 === MBV), MBV, l2); d.irsiAmount = EC.mbvIrsiAmount({ damageREC: "Materiel", synth1: "Contenu" }, { ht, obsPct }); e.damages.push(d); };
    mb("Électroménager", "Lave-linge 8 kg", 415.83, 30, "Non réparable", "Justifiés en existence et valeur");
    mb("Mobilier", "Meuble bas de cuisine", 190, 40, "Non réparable", "Justifiés en existence");
    e.calculations.forEach((x) => (x.active = EC.calculationActive(x, e.damages)));
    db.cases.unshift(c); save();
  }

  const partyForms = {
    tp(c, id) {
      const t = c.thirdParties.find((x) => x.id === id) || { insured: !insured(c), role: "Lésé", vat: 20 };
      openForm({ title: id ? "Modifier le tiers" : "Ajouter un tiers", fields: [
        { key: "name", label: "Nom", value: t.name, required: true, wide: true },
        { key: "insured", label: "Assuré du dossier", type: "check", value: t.insured, checkLabel: "Ce tiers est l'assuré" },
        { key: "role", label: "Rôle", type: "select", empty: false, options: L.roles, value: t.role },
        { key: "type", label: "Qualité", type: "select", options: L.thirdPartyTypes, value: t.type },
        { key: "insurance", label: "Assureur", value: t.insurance }, { key: "contract", label: "N° de contrat", value: t.contract },
        { key: "vat", label: "TVA par défaut %", type: "select", options: L.vat.map((x) => ({ value: x, label: String(x).replace(".", ",") })), value: t.vat },
        { key: "ceiling", label: "Plafond de garantie €", type: "num", value: t.ceiling }],
      onSubmit(v) {
        v.vat = v.vat === "" ? null : parseFloat(v.vat);
        if (v.insured) c.thirdParties.forEach((x) => (x.insured = false));
        else if (id && t.insured) return "Le dossier doit garder un assuré : désignez-en un autre d'abord.";
        if (id) Object.assign(t, v); else c.thirdParties.push({ id: uid(), ...v });
      } });
    },
    ro(c, id) {
      const r = c.riskObjects.find((x) => x.id === id) || {};
      openForm({ title: id ? "Modifier l'objet de risque" : "Ajouter un objet de risque", fields: [
        { key: "riskType", label: "Type de risque", value: r.riskType, required: true, hint: "Appartement, maison, local commercial…" },
        { key: "address1", label: "Adresse", value: r.address1, required: true, wide: true },
        { key: "postalCode", label: "Code postal", value: r.postalCode }, { key: "city", label: "Ville", value: r.city }],
      onSubmit(v) { if (id) Object.assign(r, v); else c.riskObjects.push({ id: uid(), ...v }); } });
    },
    cov(c, id) {
      const v0 = c.coverages.find((x) => x.id === id) || { coveredRiskObjects: [] };
      openForm({ title: id ? "Modifier la garantie" : "Ajouter une garantie", fields: [
        { key: "policyNumber", label: "N° de contrat", value: v0.policyNumber, required: true },
        { key: "coverageType", label: "Garantie", type: "select", options: L.guarantees, value: v0.coverageType, required: true },
        { key: "complementary", label: "Garantie complémentaire", value: v0.complementary }, { key: "precision", label: "Précision", value: v0.precision },
        { key: "insurerLabel", label: "Assureur", value: v0.insurerLabel },
        { key: "coveredRiskObjects", label: "Objets de risque couverts (aucun coché = tous)", type: "checks", wide: true, options: c.riskObjects.map((r) => ({ value: r.id, label: roLabel(c, r.id) })), value: v0.coveredRiskObjects }],
      onSubmit(v) { if (id) Object.assign(v0, v); else c.coverages.push({ id: uid(), ...v }); } });
    },
    lp(c, id) {
      const l = c.linkedParties.find((x) => x.id === id) || { type: 1 };
      openForm({ title: id ? "Modifier la partie liée" : "Ajouter une partie liée", fields: [
        { key: "type", label: "Type", type: "select", empty: false, options: Object.entries(L.linkedTypes).map(([value, label]) => ({ value, label })), value: l.type },
        { key: "lastName", label: "Nom ou raison sociale", value: l.lastName, required: true }, { key: "firstName", label: "Prénom", value: l.firstName }],
      onSubmit(v) { v.type = +v.type; if (id) Object.assign(l, v); else c.linkedParties.push({ id: uid(), ...v }); } });
    },
    room(c, id) {
      const r = c.rooms.find((x) => x.id === id) || { roomType: "Pièce", height: 2.5 };
      openForm({ title: id ? "Modifier la pièce" : "Ajouter une pièce", intro: "Sans longueur, la surface seule suffit : les dimensions sont alors estimées.", fields: [
        { key: "name", label: "Nom", value: r.name, required: true }, { key: "roomType", label: "Type", type: "select", empty: false, options: L.roomTypes, value: r.roomType },
        { key: "length", label: "Longueur m", type: "num", value: r.length }, { key: "width", label: "Largeur m", type: "num", value: r.width },
        { key: "height", label: "Hauteur m", type: "num", value: r.height }, { key: "surface", label: "Surface au sol m²", type: "num", value: r.surface }],
      onSubmit(v) { if (blank(v.length) && blank(v.surface)) return "Renseignez la longueur et la largeur, ou la surface au sol."; if (id) Object.assign(r, v); else c.rooms.push({ id: uid(), openings: [], ...v }); } });
    },
  };
  const usedBy = {
    tp: (c, id) => c.estimates.some((e) => e.damages.some((d) => d.thirdPartyId === id)),
    ro: (c, id) => c.estimates.some((e) => e.damages.some((d) => d.riskObjectId === id)),
    cov: (c, id) => c.estimates.some((e) => e.stances.some((s) => s.coverageId === id && !blank(s.stance))),
    lp: (c, id) => c.estimates.some((e) => e.beneficiaries.some((b) => b.linkedPartyId === id)),
    room: () => false,
  };
  const coll = { tp: "thirdParties", ro: "riskObjects", cov: "coverages", lp: "linkedParties", room: "rooms" };

  const acts = {
    home() { ui.view = "home"; }, refs() { ui.view = "refs"; },
    step(el) { ui.step = el.dataset.step; window.scrollTo(0, 0); },
    "dlg-close"() { closeDlg(); return false; },
    "new-case"() {
      openForm({ title: "Nouveau dossier", fields: [{ key: "number", label: "N° de mission", required: true }, { key: "type", label: "Type de sinistre", type: "select", options: L.caseTypes },
        { key: "eventDate", label: "Date du sinistre", type: "date", value: today() }, { key: "insuredName", label: "Nom de l'assuré", required: true },
        { key: "address", label: "Adresse du sinistre", wide: true }, { key: "postalCode", label: "Code postal" }, { key: "city", label: "Ville" }],
      onSubmit(v) {
        const c = { id: uid(), number: v.number, type: v.type, eventDate: v.eventDate, address: [v.address, v.postalCode, v.city].filter(Boolean).join(" "), department: (v.postalCode || "").slice(0, 2), zone: 1, irsiEnabled: false, comments: "", expert: "",
          thirdParties: [{ id: uid(), name: v.insuredName, insured: true, role: "Lésé", type: "", insurance: "", contract: "", vat: 20, ceiling: null }],
          riskObjects: v.address ? [{ id: uid(), riskType: "Habitation", address1: v.address, postalCode: v.postalCode, city: v.city }] : [], coverages: [], linkedParties: [], rooms: [], estimates: [] };
        c.estimates.push(newEstimate(c)); c.referenceEstimateId = c.estimates[0].id; db.cases.unshift(c);
        Object.assign(ui, { view: "case", step: "infos", caseId: c.id, estId: c.estimates[0].id, tpId: null, roId: null, benId: null });
      } }); return false;
    },
    "load-demo"() { if (!db.cases.some((c) => c.id === "demo-case")) seedDemo(); Object.assign(ui, { view: "case", step: "dommages", caseId: "demo-case", estId: "demo-est", tpId: null, roId: null, benId: null }); },
    "open-case"(el) { Object.assign(ui, { view: "case", step: "infos", caseId: el.dataset.id, estId: null, tpId: null, roId: null, benId: null, collapsed: {} }); },
    "del-case"(el) { const c = db.cases.find((x) => x.id === el.dataset.id); confirmBox(`Supprimer définitivement le dossier ${c.number || ""} et ses estimations ?`, "Supprimer", () => { db.cases = db.cases.filter((x) => x !== c); save(); render(); }); return false; },
    "export-case"(el) { const c = db.cases.find((x) => x.id === el.dataset.id); saveFile(`dossier-${(c.number || "sans-numero").replace(/[^\w-]+/g, "_")}.json`, JSON.stringify({ format: "eureka-chiffrage-case", case: c }, null, 1), "application/json"); return false; },
    "case-irsi"(el) { const c = cur(); c.irsiEnabled = el.dataset.v === "1"; save(); },
    "add-est"() { const c = cur(), e = newEstimate(c); c.estimates.push(e); ui.estId = e.id; save(); },
    "open-est"(el) { ui.estId = el.dataset.id; ui.step = "dommages"; },
    "dup-est"(el) { duplicateEstimate(cur(), el.dataset.id); ui.step = "estimations"; },
    "ref-est"(el) { cur().referenceEstimateId = el.dataset.id; save(); },
    "del-est"(el) { const c = cur(), e = c.estimates.find((x) => x.id === el.dataset.id); confirmBox(`Supprimer ${e.name} et tout son chiffrage ?`, "Supprimer", () => { c.estimates = c.estimates.filter((x) => x !== e); if (c.referenceEstimateId === e.id) c.referenceEstimateId = c.estimates[0].id; ui.estId = null; save(); render(); }); return false; },
    "dm-tab"(el) { ui.tab = el.dataset.v; },
    collapse(el) { ui.collapsed[el.dataset.k] = !ui.collapsed[el.dataset.k]; },
    "edit-dmg"(el) { openDamageForm(el.dataset.id); return false; },
    "edit-mbv"(el) { openMbvForm(el.dataset.id); return false; },
    "dup-dmg"(el) { const e = est(), d = e.damages.find((x) => x.id === el.dataset.id), n = clone(d); n.id = uid(); n.lineIdentifier = uid();
      n.lineIndex = EC.nextLineIndex(e.damages.filter((x) => x.calculationId === d.calculationId && (x.l1 === MBV) === (d.l1 === MBV)), d.l1, d.l2); e.damages.push(n); touch(e, calcMap(e)[d.calculationId]); },
    "del-dmg"(el) { const e = est(), d = e.damages.find((x) => x.id === el.dataset.id); confirmBox(`Supprimer la ligne « ${d.name} » ?`, "Supprimer", () => { e.damages = e.damages.filter((x) => x !== d); touch(e, calcMap(e)[d.calculationId]); render(); }); return false; },
    "tax-regime"(el) {
      const c = cur(), e = est(), { tp, roId } = dmgScope(c, e), k = getCalc(e, tp.id, roId, true), v = el.dataset.v === "1";
      if (k.taxRegime === v) return;
      k.taxRegime = v;
      e.damages.filter((d) => d.calculationId === k.id).forEach((d) => Object.assign(d, EC.recalcOnTaxRegime(d, v)));
      // les montants changent : les ventilations de ces dommages sont à refaire
      if (tp.insured) { const before = Object.keys(e.comps).length; Object.keys(e.comps).forEach((key) => { if (key.startsWith(roId + "_")) delete e.comps[key]; }); if (before !== Object.keys(e.comps).length) toast("Régime fiscal modifié : l'indemnisation de ces dommages est à ventiler de nouveau."); }
      touch(e, k);
    },
    "irsi-included"(el) { const c = cur(), e = est(), { tp, roId } = dmgScope(c, e), k = getCalc(e, tp.id, roId, true); k.includedInIRSI = el.dataset.v === "1"; touch(e, k); },
    "add-ben"() {
      const c = cur(), e = est(), cov = hasCoverages(c), poss = possibleBeneficiaries(c);
      openForm({ title: "Ajouter un bénéficiaire", fields: [
        cov ? { key: "stanceId", label: "Garantie applicable", type: "select", required: true, wide: true, options: compensableStances(e).map((s) => ({ value: s.id, label: covLabel(c.coverages.find((x) => x.id === s.coverageId)) + " · " + STANCES[s.stance].label })) }
          : { key: "guarantee", label: "Garantie", type: "select", required: true, options: L.guarantees },
        { key: "who", label: "Bénéficiaire", type: "select", required: true, options: poss.map((p) => ({ value: p.id, label: p.display })) }],
      onSubmit(v) {
        const p = poss.find((x) => x.id === v.who), lp = p.id === "insured" ? null : p.id;
        if (e.beneficiaries.some((b) => (b.linkedPartyId || null) === lp && b.type === p.type && (cov ? b.stanceId === v.stanceId : b.guarantee === v.guarantee)))
          return "Ce couple de bénéficiaire existe déjà, veuillez en sélectionner un nouveau";
        const b = { id: uid(), type: p.type, name: p.name, linkedPartyId: lp, stanceId: v.stanceId || null, guarantee: v.guarantee || null, deductible: null, deferredDeductible: null, penalization: null, deferredPenalization: null, discount: null };
        e.beneficiaries.push(b); ui.benId = b.id; touch(e);
      } }); return false;
    },
    "del-ben"(el) { const c = cur(), e = est(), b = e.beneficiaries.find((x) => x.id === el.dataset.id);
      confirmBox(`Supprimer ${benLabel(c, e, b).who} ? Les lignes qui lui sont ventilées seront libérées.`, "Supprimer", () => { e.beneficiaries = e.beneficiaries.filter((x) => x !== b); const g = groupsOf(c, e); storeGroups(e, g); touch(e); render(); }); return false; },
    "sel-ben"(el) { ui.benId = el.dataset.id; },
    "comp-option"(el) { ui.option = el.dataset.v === "1" ? 2 : 1; },
    "apply-gen"() { mutateGroups((groups) => EC.applyGenericPct(groups, ui.benId, ui.genericPct, ui.option)); toast("Vétusté contractuelle appliquée aux lignes de ce bénéficiaire"); },
    "synth-tab"(el) { ui.synthTab = el.dataset.v; },
    verify() {
      const c = cur(), e = est(), groups = groupsOf(c, e);
      const cErr = e.beneficiaries.length && groups.some((g) => g.beneficiaryId) ? EC.compensationError(groups, e.beneficiaries) : "";
      const res = EC.verifyEstimate({ damages: e.damages, stances: e.stances.filter((s) => !blank(s.stance)), beneficiaries: e.beneficiaries, groups, damageEstimate: e.damageEstimate, position: e.position, hasCoverages: hasCoverages(c), coverages: c.coverages, riskObjectIds: c.riskObjects.map((r) => r.id) });
      const errors = res.errors.concat(cErr ? [cErr] : []);
      if (errors.length) { const d = dlg(); d.innerHTML = `<div class="dlg-body"><h3>Échec de la vérification</h3><p>Corrigez les points suivants :</p><ul>${errors.map((x) => `<li>${h(x)}</li>`).join("")}</ul></div><div class="dlg-foot"><button class="btn primary" data-act="dlg-close">OK</button></div>`; d.showModal(); return false; }
      if (!res.status) { toast("Rien à vérifier : saisissez des dommages ou une prise de position.", "err"); return false; }
      e.status = res.status; e.statusDate = new Date().toISOString(); e.active = true; e.irsiBase = c.irsiEnabled ? EC.irsiBase(e.damages, calcMap(e)) : null; save();
      toast(STATUS[res.status].label);
    },
    advance() { const c = cur(), e = est(); if (e.status < 2 || e.status > 13) return; const wasVerified = e.status <= 5; e.status += 4; e.statusDate = new Date().toISOString(); save(); if (wasVerified) acts["export-csv"](); toast(STATUS[e.status].label); },
    "export-csv"() { const c = cur(), e = est(); saveFile(`${(c.number || "dossier").replace(/[^\w-]+/g, "_")}-${e.name.replace(/\s+/g, "_")}.csv`, csvExport(c, e), "text/csv;charset=utf-8"); return false; },
    print() { window.print(); return false; },
    "add-opening"(el) { const r = cur().rooms.find((x) => x.id === el.dataset.id);
      openForm({ title: "Ajouter une ouverture · " + r.name, intro: "Les ouvertures sont déduites des murs ; les portes et baies le sont aussi des plinthes.", fields: [{ key: "type", label: "Type", type: "select", empty: false, options: L.openingTypes }, { key: "width", label: "Largeur m", type: "num", required: true }, { key: "height", label: "Hauteur m", type: "num", required: true }],
        onSubmit(v) { (r.openings = r.openings || []).push(v); } }); return false; },
    "del-opening"(el) { cur().rooms.find((x) => x.id === el.dataset.id).openings.splice(+el.dataset.i, 1); save(); },
    "export-refs"() { saveFile("referentiels-eureka-chiffrage.json", JSON.stringify({ format: "eureka-chiffrage-refs", refs: db.refs }, null, 1), "application/json"); return false; },
    "reset-refs"() { confirmBox("Remplacer les référentiels par les exemples fournis ?", "Rétablir", () => { db.refs = clone(ECData.refs); save(); render(); }); return false; },
    "edit-benefit"() { openForm({ title: "Ajouter une nature", fields: [{ key: "l1", label: "Nature", required: true, hint: `« ${MBV} » pour le mobilier` }, { key: "l2", label: "Détail", required: true }, { key: "synth1", label: "Regroupement synthèse", hint: "Contenu ou Contenu professionnel : vétusté déduite de l'assiette IRSI" }, { key: "damageREC", label: "Nature IRSI", type: "select", empty: false, options: ["Materiel", "Immateriel"] }], onSubmit(v) { db.refs.benefits.push(v); } }); return false; },
    "edit-price"() { openForm({ title: "Ajouter un prix", fields: [{ key: "repairer", label: "Bordereau", type: "select", empty: false, options: db.refs.repairers.map((r) => r.name) }, { key: "l1", label: "Nature", type: "select", required: true, options: [...new Set(db.refs.benefits.map((b) => b.l1))] }, { key: "l2", label: "Détail", required: true }, { key: "name", label: "Prestation", required: true, wide: true }, { key: "unit", label: "Unité", type: "select", empty: false, options: L.units }, { key: "z1", label: "Prix HT zone 1 €", type: "num", required: true }, { key: "co2", label: "CO2e kg par unité", type: "num" }, { key: "csr", label: "Code RSE" }],
      onSubmit(v) { db.refs.prices.push({ repairer: v.repairer, l1: v.l1, l2: v.l2, name: v.name, unit: v.unit, co2: v.co2, csr: v.csr, prices: [1, 1.04, 1.08, 1.13, 1.2].map((k) => r2(v.z1 * k)) }); } }); return false; },
    "edit-repairer"() { openForm({ title: "Ajouter un réparateur", fields: [{ key: "name", label: "Nom", required: true }, { key: "description", label: "Description" }], onSubmit(v) { db.refs.repairers.push(v); } }); return false; },
    "del-benefit"(el) { db.refs.benefits.splice(+el.dataset.i, 1); save(); }, "del-price"(el) { db.refs.prices.splice(+el.dataset.i, 1); save(); }, "del-repairer"(el) { db.refs.repairers.splice(+el.dataset.i, 1); save(); },
  };
  for (const kind of Object.keys(coll)) {
    acts["edit-" + kind] = (el) => { partyForms[kind](cur(), el.dataset.id); return false; };
    acts["del-" + kind] = (el) => {
      const c = cur(), id = el.dataset.id, item = c[coll[kind]].find((x) => x.id === id);
      if (usedBy[kind](c, id)) { toast("Suppression impossible : cet élément est utilisé dans une estimation.", "err"); return false; }
      if (kind === "tp" && item.insured) { toast("L'assuré ne peut pas être supprimé.", "err"); return false; }
      confirmBox("Supprimer cet élément ?", "Supprimer", () => { c[coll[kind]] = c[coll[kind]].filter((x) => x !== item); save(); render(); }); return false;
    };
  }

  // Champs à validation immédiate. Renvoie false pour ne pas redessiner.
  function numOrToast(el, opts) {
    const v = parseNum(el.value), o = opts || {};
    if (v === undefined) { toast(`La valeur saisie '${el.value}' n'est pas valide`, "err"); return undefined; }
    if (v !== null && (v < 0 || (o.max != null && v > o.max))) { toast(`La valeur saisie '${el.value}' doit être ${o.max != null ? "entre 0 et " + o.max : "supérieure ou égale à 0"}`, "err"); return undefined; }
    return v;
  }
  const chg = {
    case(el) { const c = cur(); c[el.dataset.k] = el.dataset.num ? +el.value : el.value; save(); return el.dataset.k === "number" || el.dataset.k === "zone"; },
    "est-sel"(el) { ui.estId = el.value; ui.benId = null; },
    "damage-estimate"(el) { const v = numOrToast(el); if (v === undefined) return; const e = cur().estimates.find((x) => x.id === el.dataset.id); e.damageEstimate = v === 0 ? null : v; touch(e); },
    "dm-tp"(el) { ui.tpId = el.value; }, "dm-ro"(el) { ui.roId = el.value; },
    claimed(el) { const v = numOrToast(el); if (v === undefined) return; const c = cur(), e = est(), { tp, roId } = dmgScope(c, e), k = getCalc(e, tp.id, roId, true); k.claimedAmount = v === 0 ? null : v; touch(e, k); },
    transverse(el) {
      const v = numOrToast(el, { max: 100 }); if (v === undefined || v === null) return;
      const c = cur(), e = est(), { tp, roId } = dmgScope(c, e), k = getCalc(e, tp.id, roId, true);
      scopeDamages(e, tp, roId).filter((d) => d.l1 === el.dataset.l1).forEach((d) => { Object.assign(d, EC.transverseObsolescence(d, v, k.taxRegime)); d.irsiAmount = EC.irsiAmount(benefitOf(d.l1, d.l2), d); });
      touch(e, k);
    },
    stance(el) {
      const c = cur(), e = est(), id = el.dataset.id, k = el.dataset.k;
      let s = e.stances.find((x) => x.coverageId === id);
      if (!s) { s = { id: uid(), coverageId: id, stance: null, comment: "", notCovered: null }; e.stances.push(s); }
      if (k === "stance") {
        s.stance = el.value === "" ? null : +el.value;
        if (!(s.stance === 1 || s.stance === 2)) { // les bénéficiaires de cette garantie n'ont plus lieu d'être
          const gone = e.beneficiaries.filter((b) => b.stanceId === s.id);
          if (gone.length) { e.beneficiaries = e.beneficiaries.filter((b) => b.stanceId !== s.id); storeGroups(e, groupsOf(c, e)); toast("Les bénéficiaires rattachés à cette garantie ont été retirés."); }
        }
      } else if (k === "comment") s.comment = el.value.trim();
      else { const v = numOrToast(el); if (v === undefined) return; s.notCovered = v; }
      touch(e);
    },
    "comp-check"(el) { mutateGroups((groups) => { const g = groups.find((x) => x.key === el.dataset.key); if (el.checked) EC.assignGroup(g, ui.benId, ui.genericPct, ui.option); else EC.unassignGroup(g); }); },
    "comp-l1"(el) { mutateGroups((groups) => { const gs = groups.filter((g) => g.riskObjectId + "|" + g.l1 === el.dataset.sk);
      if (el.checked) gs.filter((g) => !g.beneficiaryId).forEach((g) => EC.assignGroup(g, ui.benId, ui.genericPct, ui.option)); else gs.filter((g) => g.beneficiaryId === ui.benId).forEach(EC.unassignGroup); }); },
    "comp-l1ceil"(el) { const v = numOrToast(el); if (v === undefined) return; const l1 = el.dataset.sk.slice(el.dataset.sk.indexOf("|") + 1); mutateGroups((groups) => EC.setLevel1Ceiling(groups, l1, ui.benId, v, ui.option)); },
    comp(el) {
      const k = el.dataset.k, v = numOrToast(el, k === "cPct" ? { max: 100 } : null); if (v === undefined) return;
      mutateGroups((groups) => { const g = groups.find((x) => x.key === el.dataset.key);
        if (k === "cPct") EC.setContractPct(g, num(v), ui.option); else if (k === "cAmt") EC.setContractAmount(g, num(v), ui.option);
        else if (k === "ceiling") { if (g.beneficiaryId) EC.setCeiling(g, v, blank(g.cPct) ? ui.genericPct : g.cPct, ui.option); else g.ceiling = v; }
        else if (k === "immediate") g.immediate = num(v); else g.deferred = r2(num(v)); });
    },
    ben(el) { const k = el.dataset.k, v = numOrToast(el, k === "discount" ? { max: 99.99 } : null); if (v === undefined) return; const e = est(); e.beneficiaries.find((b) => b.id === ui.benId)[k] = v; touch(e); },
    "gen-pct"(el) { const v = numOrToast(el, { max: 100 }); if (v === undefined) return; ui.genericPct = v === null ? null : r1(v); },
    "only-mine"(el) { ui.onlyMine = el.checked; },
    position(el) { const e = est(); e.position = el.value || null; touch(e); },
  };

  function importCase(text) {
    try { const j = JSON.parse(text), c = j.case || j; if (!c || !Array.isArray(c.estimates) || !Array.isArray(c.thirdParties)) throw 0;
      if (db.cases.some((x) => x.id === c.id)) c.id = uid(); delete c.demo; db.cases.unshift(c); save(); toast("Dossier importé"); render();
    } catch (e) { toast("Ce fichier n'est pas un dossier Eureka Chiffrage exporté depuis cet outil.", "err"); }
  }
  function importRefs(text) {
    try { const j = JSON.parse(text), r = j.refs || j; if (!Array.isArray(r.benefits) || !Array.isArray(r.prices)) throw 0; db.refs = { benefits: r.benefits, prices: r.prices, repairers: r.repairers || [] }; save(); toast("Référentiels importés"); render();
    } catch (e) { toast("Fichier de référentiels non reconnu.", "err"); }
  }
  function importPrices(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0] || "").includes(";") ? ";" : ",", head = (lines.shift() || "").toLowerCase().split(sep).map((s) => s.trim());
    const col = (n) => head.indexOf(n);
    if (col("name") < 0 || col("z1") < 0 || col("l1") < 0) { toast("Colonnes attendues : repairer;l1;l2;name;unit;z1;z2;z3;z4;z5;co2;csr", "err"); return; }
    let n = 0;
    for (const line of lines) { const f = line.split(sep).map((s) => s.trim().replace(/^"|"$/g, "")), g = (k) => (col(k) < 0 ? "" : f[col(k)] || ""), z1 = parseNum(g("z1")); if (!g("name") || !(z1 >= 0)) continue;
      const z = [1, 2, 3, 4, 5].map((i) => { const x = parseNum(g("z" + i)); return x >= 0 && x !== null ? x : z1; });
      const rep = g("repairer") || "EUREXO"; if (!db.refs.repairers.some((r) => r.name === rep)) db.refs.repairers.push({ name: rep, description: "" });
      if (!db.refs.benefits.some((b) => b.l1 === g("l1") && b.l2 === g("l2"))) db.refs.benefits.push({ l1: g("l1"), l2: g("l2"), synth1: g("l1"), damageREC: "Materiel" });
      db.refs.prices.push({ repairer: rep, l1: g("l1"), l2: g("l2"), name: g("name"), unit: g("unit") || "U", prices: z, co2: parseNum(g("co2")) || 0, csr: g("csr") || null }); n++; }
    save(); toast(n + " prix importés"); render();
  }

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el || el.disabled) return;
    const fn = acts[el.dataset.act]; if (!fn) return;
    if (fn(el) !== false) render();
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.id === "imp-case") return readFile(t, importCase);
    if (t.id === "imp-refs") return readFile(t, importRefs);
    if (t.id === "imp-prices") return readFile(t, importPrices);
    const el = t.closest("[data-chg]"); if (!el || t.closest("#dlg")) return;
    if (readOnly() && !["est-sel", "dm-tp", "dm-ro", "only-mine", "case"].includes(el.dataset.chg)) return render();
    const fn = chg[el.dataset.chg]; if (!fn) return;
    if (fn(el) !== false) render();
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.matches && ev.target.matches("input[data-chg]")) ev.target.blur(); });
  $("#dlg").addEventListener("cancel", () => setTimeout(() => (dlg().innerHTML = ""), 0));

  window.ECApp = { get db() { return db; }, ui, render, seedDemo, acts,
    api: { cur, est, dmgScope, getCalc, scopeDamages, touch, benefitOf, possibleBeneficiaries, roLabel, dlg, closeDlg, toast, h, eur, n2, qty, parseNum, uid, readOnly, L } };
  render();
})();
