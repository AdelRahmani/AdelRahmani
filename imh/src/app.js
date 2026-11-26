/* Interface du chiffrage IMH : dossiers enregistrés dans le navigateur, saisie en tableaux, récapitulatif, barème par zone. */
(() => {
  const R = IMHData, { num, blank, r2 } = IMH;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const eur = (x) => EUR.format(Number(x) || 0);
  const eur0 = (x) => (Math.abs(Number(x) || 0) < 0.005 ? "" : eur(x));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const opts = (list, v) => list.map(([k, l]) => `<option value="${h(k)}"${String(k) === String(v) ? " selected" : ""}>${h(l)}</option>`).join("");
  const KEY = "imh-chiffrage-v1";

  /* ----- Données ----- */
  function exemple() {
    const d = Object.assign(IMH.newDossier(), { ref: "7443", assure: "Exemple, dossier 7443", gamme: "CONFIANCE", zone: "5", franchise: "150", dateSinistre: "2026-10-12", dateExpertise: "2026-11-05", capitalMobilier: "20000",
      observations: "Dossier d'exemple : les travaux immobiliers reprennent le classeur « CHIFFRAGE DOMMAGES 7443.xlsx », le mobilier et les frais sont ajoutés pour la démonstration." });
    const L = (o) => Object.assign({ id: uid() }, o);
    d.immo = [
      L({ rub: "hab-tce", real: "na", piece: "Séjour", des: "Remise en état conduit pouzzolane et conduit inox", unite: "forfait", q: "1", pu: "2726.36", tva: 10, vet: "25" }),
      L({ rub: "hab-tce", real: "na", piece: "Toiture", des: "Remplacement chapeau de cheminée", unite: "u", q: "1", pu: "603", tva: 10, vet: "25" }),
      L({ rub: "hab-tce", real: "na", piece: "Séjour, cuisine", des: "Mise en peinture plafond séjour cuisine", unite: "forfait", q: "1", pu: "2561.56", tva: 10, vet: "25" }),
    ];
    d.mob = [
      L({ cat: "appareils", des: "Téléviseur 55 pouces", just: "Oui", achat: "2021-03-02", valeur: "799", vet: "" }),
      L({ cat: "vetements", des: "Manteaux (fumées)", just: "Non", achat: "", valeur: "420", vet: "40" }),
    ];
    d.autres = [L({ nat: "Frais de relogement", des: "Hôtel, 3 nuits", q: "3", pu: "85", tva: 10 })];
    return d;
  }
  const defaultBareme = () => ({ zones: R.zones.slice(), articles: JSON.parse(JSON.stringify(R.articles)) });
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
  let db = load();
  if (!db || !Array.isArray(db.dossiers) || !db.dossiers.length) { const d = exemple(); db = { dossiers: [d], current: d.id, bareme: defaultBareme() }; }
  if (!db.bareme) db.bareme = defaultBareme();
  let saveT;
  const flush = () => { clearTimeout(saveT); saveT = null; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* stockage indisponible : le dossier reste en mémoire */ } };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(flush, 200); };
  addEventListener("pagehide", () => { if (saveT) flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveT) flush(); });
  const cur = () => db.dossiers.find((x) => x.id === db.current) || db.dossiers[0];
  const ui = { tab: "dossier" };
  try { ui.tab = sessionStorage.getItem(KEY + "-tab") || "dossier"; } catch { /* sans stockage */ }

  /* ----- Colonnes des tableaux de saisie ----- */
  const g = () => R.gammes[cur().gamme] || R.gammes.CONFIANCE;
  const pctOut = (x) => (x == null ? "" : `${r2(x).toLocaleString("fr-FR")} %`);
  const COLS = {
    immo: [
      { f: "real", label: "Réalisation", type: "select", cls: "c-sel", opts: () => R.REAL.map((x) => [x.id, x.label]) },
      { f: "piece", label: "Pièce", cls: "c-md" },
      { f: "des", label: "Désignation", cls: "c-des" },
      { f: "unite", label: "Unité", type: "select", cls: "c-sm", opts: () => R.UNITS.map((u) => [u, u]) },
      { f: "q", label: "Q", type: "num", cls: "c-sm" },
      { f: "pu", label: "PU HT", type: "num", cls: "c-num" },
      { f: "tva", label: "TVA %", type: "select", cls: "c-sm", opts: () => R.TVA.map((t) => [t, t ? `${String(t).replace(".", ",")} %` : "Exo"]) },
      { f: "vet", label: "Vét. %", type: "num", cls: "c-sm" },
      { k: "van", label: "Valeur à neuf HT", out: (c) => eur0(c.van) },
      { k: "vvd", label: "VVD HT", out: (c) => eur0(c.vvd) },
      { k: "recup", label: "Vét. récupérable", out: (c) => eur0(c.recup) },
      { k: "total", label: "TTC après travaux", out: (c) => eur0(c.total), strong: true },
      { f: "rub", label: "Rubrique", type: "select", cls: "c-sel", opts: () => g().rubriques.map((r) => [r.id, r.label]), rerender: true },
    ],
    mob: [
      { f: "cat", label: "Catégorie", type: "select", cls: "c-sel", opts: () => g().mobilier.map((c) => [c.id, c.label]), rerender: true },
      { f: "des", label: "Désignation", cls: "c-des" },
      { f: "just", label: "Justificatif", type: "select", cls: "c-sm", opts: () => [["", "—"], ["Oui", "Oui"], ["Non", "Non"], ["Vu", "Vu"]] },
      { f: "achat", label: "Date d'achat", type: "date", cls: "c-md" },
      { f: "valeur", label: "Valeur TTC", type: "num", cls: "c-num" },
      { f: "vet", label: "Vét. %", type: "num", cls: "c-sm", ph: (c) => (c.sugg != null ? `auto ${c.sugg}` : "") },
      { k: "age", label: "Âge", out: (c) => (c.age == null ? "" : `${c.age} an${c.age > 1 ? "s" : ""}`) },
      { k: "vetPct", label: "Vét. retenue", out: (c) => (c.excluded ? "" : pctOut(c.vetPct)) },
      { k: "indem", label: "Indemnité", out: (c) => eur0(c.indem), strong: true },
    ],
    autres: [
      { f: "nat", label: "Nature du préjudice", type: "select", cls: "c-sel", opts: () => R.autresPrejudices.map((x) => [x, x]) },
      { f: "des", label: "Précision de l'expert", cls: "c-des" },
      { f: "q", label: "Q", type: "num", cls: "c-sm" },
      { f: "pu", label: "PU HT", type: "num", cls: "c-num" },
      { f: "tva", label: "TVA %", type: "select", cls: "c-sm", opts: () => R.TVA.map((t) => [t, t ? `${String(t).replace(".", ",")} %` : "Exo"]) },
      { k: "ht", label: "Montant HT", out: (c) => eur0(c.ht) },
      { k: "ttc", label: "Montant TTC", out: (c) => eur0(c.ttc), strong: true },
    ],
    amen: [
      { f: "cat", label: "Catégorie garantie", type: "select", cls: "c-sel", opts: () => (g().amenag || []).map((a) => [a.id, a.label]), rerender: true },
      { f: "des", label: "Désignation", cls: "c-des" },
      { f: "unite", label: "Unité", type: "select", cls: "c-sm", opts: () => R.UNITS.map((u) => [u, u]) },
      { f: "q", label: "Q", type: "num", cls: "c-sm" },
      { f: "pu", label: "PU HT", type: "num", cls: "c-num" },
      { f: "tva", label: "TVA %", type: "select", cls: "c-sm", opts: () => R.TVA.map((t) => [t, t ? `${String(t).replace(".", ",")} %` : "Exo"]) },
      { f: "vet", label: "Vét. %", type: "num", cls: "c-sm" },
      { k: "van", label: "Valeur à neuf HT", out: (c) => eur0(c.van) },
      { k: "ttc", label: "VVD TTC", out: (c) => eur0(c.ttc), strong: true },
    ],
    ng: [
      { f: "nat", label: "Nature non garantie", type: "select", cls: "c-sel", opts: () => R.nonGarantis.map((x) => [x, x]) },
      { f: "des", label: "Précision", cls: "c-des" },
      { f: "van", label: "VAN HT", type: "num", cls: "c-md" },
      { f: "tva", label: "TVA %", type: "select", cls: "c-sm", opts: () => R.TVA.map((t) => [t, t ? `${String(t).replace(".", ",")} %` : "Exo"]) },
      { f: "vet", label: "Vét. %", type: "num", cls: "c-sm" },
      { k: "ttc", label: "Montant TTC", out: (c) => eur0(c.ttc) },
      { k: "vvd", label: "VVD TTC", out: (c) => eur0(c.vvd) },
    ],
  };
  const NEW = {
    immo: (rub) => ({ rub: rub || g().rubriques[0].id, real: "na", piece: "", des: "", unite: "m²", q: "", pu: "", tva: 10, vet: "" }),
    mob: () => ({ cat: g().mobilier[0].id, des: "", just: "", achat: "", valeur: "", vet: "" }),
    autres: () => ({ nat: R.autresPrejudices[0], des: "", q: "1", pu: "", tva: 10 }),
    amen: () => ({ cat: (g().amenag || [{}])[0].id, des: "", unite: "m²", q: "", pu: "", tva: 10, vet: "" }),
    ng: () => ({ nat: R.nonGarantis[0], des: "", van: "", tva: 20, vet: "" }),
  };

  function cell(sec, l, c, calc) {
    if (c.out) return `<td class="num${c.strong ? " strong" : ""}" data-o="${sec}:${l.id}:${c.k}">${h(c.out(calc || {}, l))}</td>`;
    const id = `${sec}-${l.id}-${c.f}`, v = l[c.f] == null ? "" : l[c.f];
    const attrs = `id="${id}" data-sec="${sec}" data-id="${l.id}" data-f="${c.f}" aria-label="${h(c.label)}"${c.rerender ? " data-rerender" : ""}`;
    if (c.type === "select") {
      const list = c.opts(); const known = list.some(([k]) => String(k) === String(v));
      return `<td class="${c.cls || ""}"><select ${attrs}>${known ? "" : `<option value="${h(v)}" selected>Hors gamme (${h(v)})</option>`}${opts(list, v)}</select></td>`;
    }
    if (c.type === "date") return `<td class="${c.cls || ""}"><input type="date" ${attrs} value="${h(v)}"></td>`;
    const dis = sec === "mob" && c.f === "vet" && calc && (g().mobilier.find((x) => x.id === l.cat) || {}).kind === "occasion";
    const ph = c.ph && calc ? c.ph(calc) : "";
    return `<td class="${c.cls || ""}"><input ${attrs} value="${h(v)}"${c.type === "num" ? ' inputmode="decimal" class="n"' : ""}${ph ? ` placeholder="${h(ph)}" data-ph="${sec}:${l.id}"` : c.ph ? ` data-ph="${sec}:${l.id}"` : ""}${dis ? ' disabled title="Valeur d\'occasion : pas de vétusté"' : ""}></td>`;
  }
  const row = (sec, l, res) => { const calc = res[sec].lines[l.id] || {}; return `<tr class="${calc.excluded ? "off" : ""}">${COLS[sec].map((c) => cell(sec, l, c, calc)).join("")}<td><button class="x" type="button" data-act="del-line" data-sec="${sec}" data-id="${l.id}" title="Supprimer la ligne" aria-label="Supprimer la ligne">×</button></td></tr>`; };
  const thead = (sec) => `<thead><tr>${COLS[sec].map((c) => `<th class="${c.out || c.type === "num" ? "num" : ""}">${h(c.label)}</th>`).join("")}<th></th></tr></thead>`;

  /* ----- Valeurs calculées mises à jour pendant la saisie ----- */
  function outMap(res) {
    const d = cur(), m = {};
    for (const sec of Object.keys(COLS)) for (const l of d[sec]) { const calc = res[sec].lines[l.id] || {}; for (const c of COLS[sec]) if (c.out) m[`${sec}:${l.id}:${c.k}`] = c.out(calc, l); }
    for (const r of res.immo.rubriques) for (const k of ["van", "vvd", "recup", "total", "retenu"]) m[`rub:${r.id}:${k}`] = eur0(r[k]);
    for (const c of res.mob.cats) { m[`mc:${c.id}:valeur`] = eur0(c.valeur); m[`mc:${c.id}:total`] = eur0(c.total); }
    res.mob.groupes.forEach((p, i) => { m[`mg:${i}:total`] = eur0(p.total); m[`mg:${i}:retenu`] = eur(p.retenu); });
    for (const a of res.amen.cats) { m[`ac:${a.id}:ttc`] = eur0(a.ttc); m[`ac:${a.id}:retenu`] = eur(a.retenu); }
    Object.assign(m, { "mob:total": eur(res.mob.total), "mob:retenu": eur(res.mob.retenu), "amen:retenu": eur(res.amen.retenu), "autres:total": eur(res.autres.total), "ng:total": eur(res.ng.total),
      "immo:total": eur(res.immo.corpsTotal.total), "immo:retenu": eur(res.immo.corpsTotal.retenu) });
    return m;
  }
  function refresh() {
    const res = IMH.compute(cur()), m = outMap(res);
    $$("[data-o]").forEach((el) => { const v = m[el.dataset.o]; if (v != null && el.textContent !== v) el.textContent = v; });
    $$("[data-ph]").forEach((el) => { const [sec, id] = el.dataset.ph.split(":"); const c = (res[sec].lines[id] || {}); el.placeholder = c.sugg != null ? `auto ${c.sugg}` : ""; });
    renderStrip(res);
  }

  /* ----- En-tête ----- */
  const TABS = [["dossier", "Dossier"], ["immo", "Immobilier"], ["mob", "Mobilier"], ["autres", "Autres préjudices"], ["amen", "Aménagements ext."], ["ng", "Non garantis"], ["recap", "Récapitulatif"], ["bareme", "Barème IMH"]];
  function renderStrip(res) {
    const d = cur(), t = res.pay.totals, nA = res.alertes.length, nD = res.depassements.length;
    $("#strip").innerHTML = `<span class="chip gamme">${h(res.gamme.label)}</span><span class="chip">Zone ${h(d.zone || "—")}</span>
      <span class="k big"><span>Indemnité</span><b>${eur(t.total)}</b></span><span class="k"><span>Acompte</span><b>${eur(t.acompte)}</b></span>
      <span class="k"><span>Différé facture</span><b>${eur(t.differe)}</b></span>${t.recours ? `<span class="k"><span>Différé recours</span><b>${eur(t.recours)}</b></span>` : ""}
      ${nD ? `<button class="chip warn" type="button" data-act="tab" data-v="recap">${nD} plafond${nD > 1 ? "s" : ""} dépassé${nD > 1 ? "s" : ""}</button>` : ""}
      ${nA ? `<button class="chip err" type="button" data-act="tab" data-v="recap">${nA} point${nA > 1 ? "s" : ""} à vérifier</button>` : `<span class="chip ok">Aucun point à vérifier</span>`}`;
  }
  function renderHeader(res) {
    $("#dossier-pick").innerHTML = db.dossiers.map((d) => `<option value="${h(d.id)}"${d.id === db.current ? " selected" : ""}>${h([d.ref || "Sans référence", d.assure].filter(Boolean).join(" · "))}</option>`).join("");
    const d = cur(), counts = { immo: d.immo.length, mob: d.mob.length, autres: d.autres.length, amen: d.amen.length, ng: d.ng.length };
    $("#tabs").innerHTML = TABS.map(([k, l]) => `<button class="tab${ui.tab === k ? " on" : ""}" type="button" data-act="tab" data-v="${k}"${ui.tab === k ? ' aria-current="page"' : ""}>${l}${counts[k] ? `<small>${counts[k]}</small>` : ""}</button>`).join("");
    renderStrip(res);
  }

  /* ----- Écrans ----- */
  const field = (f, label, type, extra = "") => {
    const d = cur(), v = d[f] == null ? "" : d[f], id = `d-${f}`, a = `id="${id}" data-sec="d" data-f="${f}"`;
    if (type === "textarea") return `<label class="wide" for="${id}">${label}<textarea ${a}>${h(v)}</textarea></label>`;
    if (type === "check") return `<label class="check" for="${id}"><input type="checkbox" ${a}${v ? " checked" : ""}>${label}</label>`;
    if (Array.isArray(type)) return `<label for="${id}">${label}<select ${a} data-rerender>${opts(type, v)}</select>${extra}</label>`;
    return `<label for="${id}">${label}<input ${a} type="${type === "num" ? "text" : type || "text"}"${type === "num" ? ' inputmode="decimal"' : ""} value="${h(v)}">${extra}</label>`;
  };
  function viewDossier() {
    const d = cur(), gm = g();
    const plaf = (p) => IMH.plafondLabel(p);
    const ref = `<dl class="kv">
      <dt>Vétusté récupérable (locaux d'habitation)</dt><dd>${gm.recupMax ? `jusqu'à ${gm.recupMax * 100} % de la VAN` : "non prévue"}</dd>
      ${gm.rubriques.filter((r) => r.plafond).map((r) => `<dt>${h(r.label)}</dt><dd>${h(plaf(r.plafond))}</dd>`).join("")}
      ${gm.mobilier.filter((c) => c.kind === "neuf").map((c) => `<dt>${h(c.label)}</dt><dd>${c.seuil === Infinity ? "à neuf illimité" : `pas de vétusté avant ${c.seuil} an${c.seuil > 1 ? "s" : ""}`}</dd>`).join("")}
      ${gm.plafondsMob.map((p) => `<dt>${h(p.label)}</dt><dd>${h(plaf(p.plafond))}</dd>`).join("")}
      ${(gm.amenag || []).map((a) => `<dt>${h(a.label)}</dt><dd>${h(a.plafond ? plaf(a.plafond) : a.note || "Sans plafond")}</dd>`).join("")}
    </dl>`;
    return `<section class="head"><div><h1>Dossier</h1><p class="muted">Références du dossier, contrat et paramètres qui pilotent les plafonds et la vétusté.</p></div>
      <div class="actions"><button class="btn sm danger" type="button" data-act="del-dossier">Supprimer le dossier</button></div></section>
      <div class="grid2">
        <div class="panel"><h2>Références</h2><div class="form">
          ${field("ref", "Référence du dossier")}${field("assure", "Assuré")}${field("dateSinistre", "Date du sinistre", "date")}${field("dateExpertise", "Date d'expertise", "date")}
          ${field("cabinet", "Cabinet")}${field("collaborateur", "Collaborateur")}${field("observations", "Observations", "textarea")}
        </div></div>
        <div class="panel"><h2>Contrat et règlement</h2><div class="form">
          ${field("gamme", "Gamme de contrat", Object.entries(R.gammes).map(([k, x]) => [k, x.label + (x.note ? ` (${x.note})` : "")]))}
          ${field("zone", "Zone du barème IMH", db.bareme.zones.map((z) => [z, "Zone " + z]))}
          ${field("capitalMobilier", "Capital mobilier souscrit (€)", "num", '<span class="hint">Sert aux plafonds exprimés en % du capital.</span>')}
          ${field("franchise", "Franchise (€)", "num")}
          ${d.gamme === "NATURE" ? field("valeurOccasionMH", "Valeur d'occasion du mobil-home (€)", "num", '<span class="hint">Limite la réparation du mobil-home.</span>') : ""}
          ${field("grilleMob", "Barème de vétusté mobilier", R.GRILLES.map((x) => [x.id, x.label]))}
          ${field("franchiseRecours", "Franchise remboursée à l'issue du recours", "check")}
        </div></div>
      </div>
      <div class="panel"><h2>Ce que prévoit la gamme ${h(gm.label)}</h2>${ref}</div>`;
  }

  function viewImmo(res) {
    const d = cur(), gm = g(), known = new Set(gm.rubriques.map((r) => r.id)), ncol = COLS.immo.length + 1;
    const groups = gm.rubriques.map((r) => ({ r, lines: d.immo.filter((l) => l.rub === r.id) }));
    const orphans = d.immo.filter((l) => !known.has(l.rub));
    const body = groups.map(({ r, lines }) => {
      const rr = res.immo.rubriques.find((x) => x.id === r.id);
      return `<tr class="grp"><td colspan="${ncol}"><div class="actions" style="justify-content:space-between"><span>${h(r.label)} ${r.recup && gm.recupMax ? '<span class="muted">· vétusté récupérable</span>' : ""}${r.plafond ? ` <span class="muted">· plafond ${h(IMH.plafondLabel(r.plafond))}</span>` : ""}${r.note ? ` <span class="muted">· ${h(r.note)}</span>` : ""}</span>
        <span class="actions noprint"><button class="btn sm" type="button" data-act="add-line" data-sec="immo" data-v="${r.id}">Ajouter une ligne</button><button class="btn sm ghost" type="button" data-act="bareme-pick" data-v="${r.id}">Depuis le barème</button></span></div></td></tr>
        ${lines.map((l) => row("immo", l, res)).join("")}
        ${lines.length ? `<tr class="sub"><td colspan="8">Sous-total ${h(r.label)}${r.plafond ? ` <span class="muted">· retenu <span data-o="rub:${r.id}:retenu">${eur0(rr.retenu)}</span></span>` : ""}</td><td class="num" data-o="rub:${r.id}:van">${eur0(rr.van)}</td><td class="num" data-o="rub:${r.id}:vvd">${eur0(rr.vvd)}</td><td class="num" data-o="rub:${r.id}:recup">${eur0(rr.recup)}</td><td class="num" data-o="rub:${r.id}:total">${eur0(rr.total)}</td><td colspan="2"></td></tr>` : ""}`;
    }).join("") + (orphans.length ? `<tr class="grp"><td colspan="${ncol}">Hors gamme ${h(gm.label)} <span class="muted">· choisir une rubrique pour compter ces lignes</span></td></tr>${orphans.map((l) => row("immo", l, res)).join("")}` : "");
    return `<section class="head"><div><h1>Dommages immobiliers</h1><p class="muted">Valeur à neuf = Q × PU. La vétusté récupérable sur les locaux d'habitation est limitée à ${gm.recupMax ? gm.recupMax * 100 + " %" : "0 %"} de la valeur à neuf. La pose par le sociétaire est sans TVA.</p></div></section>
      <div class="tw"><table>${thead("immo")}<tbody>${body}</tbody><tfoot><tr class="tot"><td colspan="11">Total travaux, TTC après travaux</td><td class="num" data-o="immo:total">${eur(res.immo.corpsTotal.total)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }

  function flatTable(sec, res, addLabel) {
    const d = cur();
    return `<div class="tw"><table>${thead(sec)}<tbody>${d[sec].length ? d[sec].map((l) => row(sec, l, res)).join("") : `<tr><td colspan="${COLS[sec].length + 1}" class="empty">Aucune ligne. « ${addLabel} » pour commencer.</td></tr>`}</tbody></table></div>
      <div class="actions noprint"><button class="btn primary" type="button" data-act="add-line" data-sec="${sec}">${addLabel}</button></div>`;
  }
  function viewMob(res) {
    const d = cur(), gm = g(), grille = R.GRILLES.find((x) => x.id === d.grilleMob) || R.GRILLES[0];
    const cats = res.mob.cats.filter((c) => c.n);
    return `<section class="head"><div><h1>Dommages mobiliers</h1><p class="muted">Vétusté proposée d'après la date d'achat et la date du sinistre (${h(grille.label.toLowerCase())}). Un taux saisi remplace la proposition. Bijoux, objets de valeur et vins sont pris en valeur d'occasion.</p></div></section>
      ${flatTable("mob", res, "Ajouter un bien")}
      <div class="grid2">
        <div class="panel"><h2>Par catégorie</h2>${cats.length ? `<div class="tw"><table><thead><tr><th>Catégorie</th><th class="num">Valeur</th><th class="num">Indemnité</th></tr></thead><tbody>${cats.map((c) => `<tr><td>${h(c.label)}</td><td class="num" data-o="mc:${c.id}:valeur">${eur0(c.valeur)}</td><td class="num" data-o="mc:${c.id}:total">${eur0(c.total)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Aucun bien saisi.</p>'}</div>
        <div class="panel"><h2>Plafonds ${h(gm.label)}</h2><div class="tw"><table><thead><tr><th>Plafond</th><th class="num">Montant</th><th class="num">Retenu</th></tr></thead><tbody>
          ${res.mob.groupes.map((p, i) => `<tr><td>${h(p.label)} <span class="flag">${h(p.plafond)}</span></td><td class="num" data-o="mg:${i}:total">${eur0(p.total)}</td><td class="num" data-o="mg:${i}:retenu">${eur(p.retenu)}</td></tr>`).join("")}
          <tr class="tot"><td>Mobilier retenu${num(d.capitalMobilier) > 0 ? ` <span class="flag">dans la limite du capital de ${eur(num(d.capitalMobilier))}</span>` : ""}</td><td class="num" data-o="mob:total">${eur(res.mob.total)}</td><td class="num" data-o="mob:retenu">${eur(res.mob.retenu)}</td></tr>
        </tbody></table></div></div>
      </div>`;
  }
  function viewAutres(res) {
    return `<section class="head"><div><h1>Autres préjudices garantis</h1><p class="muted">Recherche de fuite, gel, démolition, relogement, perte de loyer, frais de garde, gardiennage… Réglés en acompte, TVA comprise.</p></div></section>
      ${flatTable("autres", res, "Ajouter un préjudice")}<p class="strong">Total autres préjudices : <span data-o="autres:total">${eur(res.autres.total)}</span></p>`;
  }
  function viewAmen(res) {
    const gm = g();
    return `<section class="head"><div><h1>Aménagements extérieurs garantis</h1><p class="muted">Chaque catégorie est retenue en valeur vétusté déduite TTC, dans la limite de son plafond ${h(gm.label)}.</p></div></section>
      ${flatTable("amen", res, "Ajouter une ligne")}
      <div class="panel"><h2>Plafonds ${h(gm.label)}</h2><div class="tw"><table><thead><tr><th>Catégorie</th><th>Plafond</th><th class="num">VVD TTC</th><th class="num">Retenu</th></tr></thead><tbody>
        ${res.amen.cats.map((a) => `<tr><td>${h(a.label)}</td><td>${h(a.plafondTxt)}</td><td class="num" data-o="ac:${a.id}:ttc">${eur0(a.ttc)}</td><td class="num" data-o="ac:${a.id}:retenu">${eur(a.retenu)}</td></tr>`).join("")}
        <tr class="tot"><td colspan="3">Aménagements extérieurs retenus</td><td class="num" data-o="amen:retenu">${eur(res.amen.retenu)}</td></tr></tbody></table></div></div>`;
  }
  function viewNg(res) {
    return `<section class="head"><div><h1>Dommages non garantis</h1><p class="muted">Pour mémoire : ces montants ne sont pas indemnisés au titre du contrat ${h(g().label)}.</p></div></section>
      ${flatTable("ng", res, "Ajouter un dommage")}<p class="strong">Total non garanti : <span data-o="ng:total">${eur(res.ng.total)}</span></p>`;
  }

  function viewRecap(res) {
    const d = cur(), gm = g(), t = res.pay.totals, c = res.immo.corps, ct = res.immo.corpsTotal;
    const crow = (label, x, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="num">${eur0(x.van)}</td><td class="num">${eur0(x.vet)}</td><td class="num">${eur0(x.vvd)}</td><td class="num">${eur0(x.recup)}</td><td class="num">${eur0(x.nonRecup)}</td><td class="num">${eur0(x.tva)}</td><td class="num strong">${eur0(x.total)}</td></tr>`;
    const capped = res.immo.rubriques.filter((r) => r.plafond && r.n);
    const prow = (r) => `<tr><td>${h(r.label)}</td><td class="num">${eur0(r.acompte)}</td><td class="num">${eur0(r.differe)}</td><td class="num">${eur0(r.recours)}</td><td class="num strong">${eur0(r.total)}</td></tr>`;
    const xl = window.claude ? "" : `<button class="btn ghost" type="button" data-act="print">Imprimer</button>`;
    const parNat = Object.entries(res.autres.parNature);
    return `<section class="head"><div><h1>Récapitulatif ${h(gm.label)}</h1><p class="muted">${h([d.ref && "Dossier " + d.ref, d.assure, d.dateSinistre && "sinistre du " + new Date(d.dateSinistre).toLocaleDateString("fr-FR")].filter(Boolean).join(" · "))}</p></div>
      <div class="actions noprint"><button class="btn primary" type="button" data-act="export-xlsx">Exporter vers Excel</button>${xl}</div></section>
      <div class="cards"><div class="card main"><span>Indemnité totale</span><b>${eur(t.total)}</b></div><div class="card"><span>Acompte à régler</span><b>${eur(t.acompte)}</b></div>
        <div class="card"><span>Différé à réception de facture</span><b>${eur(t.differe)}</b></div><div class="card"><span>Différé à l'issue du recours</span><b>${eur(t.recours)}</b></div></div>
      ${res.alertes.length ? `<div class="note"><strong>Points à vérifier</strong><ul class="list">${res.alertes.map((a) => `<li>${h(a)}</li>`).join("")}</ul></div>` : ""}
      <div class="panel"><h2>Règlement</h2><div class="tw"><table><thead><tr><th></th><th class="num">Acompte à régler</th><th class="num">Différé à réception de la facture</th><th class="num">Différé à l'issue du recours</th><th class="num">Total</th></tr></thead>
        <tbody>${res.pay.rows.map(prow).join("")}<tr class="tot"><td>Solde ou total</td><td class="num">${eur(t.acompte)}</td><td class="num">${eur(t.differe)}</td><td class="num">${eur(t.recours)}</td><td class="num">${eur(t.total)}</td></tr></tbody></table></div>
        <p class="muted">Entreprise non agréée : VVD HT en acompte, vétusté récupérable et TVA sur facture. Entreprise agréée : tout sur facture. Travaux de l'assuré : VVD (TVA comprise pour les fournitures) en acompte, vétusté récupérable sur justificatifs.</p></div>
      <div class="panel"><h2>Les travaux par corps d'état</h2><div class="tw"><table><thead><tr><th></th><th class="num">VAN HT</th><th class="num">Vétusté</th><th class="num">Reste HT, vétusté déduite</th><th class="num">Vétusté récupérée</th><th class="num">Vétusté non récupérable</th><th class="num">TVA</th><th class="num">Total TTC après travaux</th></tr></thead>
        <tbody>${crow("Embellissements", c.emb)}${crow("Immobilier", c.immo)}${crow("Total", ct, "tot")}</tbody></table></div>
        ${capped.length ? `<div class="tw"><table><thead><tr><th>Rubrique plafonnée</th><th>Plafond</th><th class="num">TTC</th><th class="num">Retenu</th></tr></thead><tbody>${capped.map((r) => `<tr><td>${h(r.label)}</td><td>${h(IMH.plafondLabel(r.plafond))}</td><td class="num">${eur(r.total)}</td><td class="num">${eur(r.retenu)}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>
      <div class="grid2">
        <div class="panel"><h2>Le mobilier</h2>${res.mob.cats.some((x) => x.n) ? `<div class="tw"><table><thead><tr><th>Catégorie</th><th class="num">Valeur</th><th class="num">Indemnité</th></tr></thead><tbody>${res.mob.cats.filter((x) => x.n).map((x) => `<tr><td>${h(x.label)}</td><td class="num">${eur(x.valeur)}</td><td class="num">${eur(x.total)}</td></tr>`).join("")}<tr class="tot"><td>Préjudice mobilier garanti</td><td></td><td class="num">${eur(res.mob.retenu)}</td></tr></tbody></table></div>` : '<p class="muted">Aucun bien mobilier.</p>'}</div>
        <div class="panel"><h2>Autres préjudices et aménagements</h2><dl class="kv">${parNat.map(([n, v]) => `<dt>${h(n)}</dt><dd>${eur(v)}</dd>`).join("") || '<dt class="muted">Aucun autre préjudice</dt><dd></dd>'}
          ${res.amen.cats.filter((a) => a.n).map((a) => `<dt>${h(a.label)}</dt><dd>${eur(a.retenu)}</dd>`).join("")}</dl></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>Dépassements de plafonds</h2>${res.depassements.length ? `<div class="tw"><table><thead><tr><th>Catégorie</th><th>Plafond</th><th class="num">Dépassement</th></tr></thead><tbody>${res.depassements.map((x) => `<tr><td>${h(x.label)}</td><td>${h(x.plafond)}</td><td class="num">${eur(x.montant)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Aucun plafond contractuel dépassé.</p>'}</div>
        <div class="panel"><h2>Dommages non garantis</h2>${d.ng.length ? `<dl class="kv">${d.ng.map((l) => `<dt>${h(l.nat)}${l.des ? ` · ${h(l.des)}` : ""}</dt><dd>${eur(res.ng.lines[l.id].ttc)}</dd>`).join("")}<dt class="strong">Total</dt><dd class="strong">${eur(res.ng.total)}</dd></dl>` : '<p class="muted">Aucun dommage non garanti saisi.</p>'}</div>
      </div>
      ${d.observations ? `<div class="panel"><h2>Observations</h2><p>${h(d.observations).replace(/\n/g, "<br>")}</p></div>` : ""}`;
  }

  function viewBareme() {
    const b = db.bareme, d = cur(), priced = b.articles.filter((a) => Object.keys(a.prix || {}).length).length;
    const rubs = R.gammes.CONFIANCE.rubriques.map((r) => [r.id, r.label]);
    let grp = null;
    const rows = b.articles.map((a) => {
      const head = a.grp !== grp ? ((grp = a.grp), `<tr class="grp"><td colspan="${4 + b.zones.length}">${h(a.grp)}</td></tr>`) : "";
      return `${head}<tr><td class="c-des"><input id="bar-${a.id}-des" data-sec="bar" data-id="${a.id}" data-f="des" value="${h(a.des)}" aria-label="Article"></td>
        <td class="c-sm"><select id="bar-${a.id}-unite" data-sec="bar" data-id="${a.id}" data-f="unite" aria-label="Unité">${opts(R.UNITS.map((u) => [u, u]), a.unite)}</select></td>
        <td class="c-sel"><select id="bar-${a.id}-rub" data-sec="bar" data-id="${a.id}" data-f="rub" aria-label="Rubrique">${opts(rubs, a.rub)}</select></td>
        ${b.zones.map((z) => `<td class="c-sm"><input class="n" inputmode="decimal" id="bar-${a.id}-z${h(z)}" data-sec="bar" data-id="${a.id}" data-f="z:${h(z)}" value="${h(a.prix[z] == null ? "" : a.prix[z])}" aria-label="Prix zone ${h(z)}"></td>`).join("")}
        <td><button class="x" type="button" data-act="del-article" data-id="${a.id}" aria-label="Supprimer l'article">×</button></td></tr>`;
    }).join("");
    return `<section class="head"><div><h1>Barème IMH</h1><p class="muted">Articles normalisés des supports de chiffrage IMH 2018. ${priced ? `${priced} article${priced > 1 ? "s" : ""} sur ${b.articles.length} ont un prix.` : "Aucun prix n'est encore renseigné : saisissez-les ici ou importez le barème en CSV."} Le dossier ouvert utilise la zone ${h(d.zone)}.</p></div>
      <div class="actions"><button class="btn primary" type="button" data-act="import-csv">Importer un CSV</button><button class="btn" type="button" data-act="export-csv">Exporter en CSV</button><button class="btn ghost" type="button" data-act="add-article">Ajouter un article</button><button class="btn ghost" type="button" data-act="reset-bareme">Rétablir la liste IMH</button></div></section>
      <p class="note info">Format attendu : une ligne d'en-tête <code>groupe;article;unité;rubrique;zone 1;zone 2;…</code> puis un article par ligne. La rubrique vaut <code>hab-tce</code>, <code>hab-emb</code>, <code>dep</code> ou <code>clo</code>. L'import remplace le barème actuel.</p>
      <div class="tw"><table><thead><tr><th>Article</th><th>Unité</th><th>Rubrique par défaut</th>${b.zones.map((z) => `<th class="num">Zone ${h(z)} €</th>`).join("")}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ----- Rendu ----- */
  function render() {
    const d = cur(), res = IMH.compute(d), a = document.activeElement, focusId = a && a.id, sel = a && a.selectionStart;
    renderHeader(res);
    const V = { dossier: viewDossier, immo: viewImmo, mob: viewMob, autres: viewAutres, amen: viewAmen, ng: viewNg, recap: viewRecap, bareme: viewBareme };
    $("#main").innerHTML = (V[ui.tab] || viewDossier)(res);
    if (focusId && !focusId.startsWith("dossier-pick")) { const el = document.getElementById(focusId); if (el && el.closest("main")) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch { /* champ sans curseur */ } } }
  }

  /* ----- Fichiers ----- */
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
  async function saveFile(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    try { const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; if (dl) { await dl.save({ filename, data: blob }); return; } }
    catch (err) { if (err && err.code === "declined") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    catch { toast("Le téléchargement n'est pas disponible dans cette vue."); }
  }
  const baseName = () => `chiffrage-imh-${(cur().ref || "dossier").replace(/[^\w-]+/g, "_")}`;
  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const loadXlsx = () => (window.XLSX ? Promise.resolve(window.XLSX) : new Promise((ok, ko) => { const s = document.createElement("script"); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = ko; document.head.appendChild(s); }));
  function workbook(d, res) {
    const gm = res.gamme, rubL = (id) => (gm.rubriques.find((r) => r.id === id) || {}).label || id, realL = (id) => (R.REAL.find((r) => r.id === id) || {}).label || "";
    const catL = (id) => (gm.mobilier.find((c) => c.id === id) || {}).label || id, amenL = (id) => ((gm.amenag || []).find((c) => c.id === id) || {}).label || id;
    const t = res.pay.totals;
    return {
      "Dossier": [["Référence", d.ref], ["Assuré", d.assure], ["Contrat", gm.label], ["Zone IMH", d.zone], ["Date du sinistre", d.dateSinistre], ["Date d'expertise", d.dateExpertise], ["Cabinet", d.cabinet], ["Collaborateur", d.collaborateur], ["Capital mobilier", num(d.capitalMobilier)], ["Franchise", num(d.franchise)], ["Observations", d.observations]],
      "Immobilier": [["Rubrique", "Réalisation", "Pièce", "Désignation", "Unité", "Q", "PU HT", "Valeur à neuf HT", "Taux de vétusté", "Vétusté", "Valeur vétusté déduite HT", "Vétusté récupérable", "TVA %", "TVA", "Total TTC après travaux"],
        ...d.immo.map((l) => { const c = res.immo.lines[l.id]; return [rubL(l.rub), realL(l.real), l.piece, l.des, l.unite, num(l.q), num(l.pu), r2(c.van || 0), num(l.vet) / 100, r2(c.vet || 0), r2(c.vvd || 0), r2(c.recup || 0), l.real === "po" ? 0 : num(l.tva) / 100, r2(c.tva || 0), r2(c.total || 0)]; })],
      "Mobilier": [["Catégorie", "Désignation", "Justificatif", "Date d'achat", "Valeur", "Taux de vétusté", "Vétusté", "Indemnité"],
        ...d.mob.map((l) => { const c = res.mob.lines[l.id]; return [catL(l.cat), l.des, l.just, l.achat, num(l.valeur), (c.vetPct || 0) / 100, r2(c.vet || 0), r2(c.indem || 0)]; }), [], ["Plafond", "", "", "", "Montant", "", "", "Retenu"], ...res.mob.groupes.map((p) => [p.label + " (" + p.plafond + ")", "", "", "", p.total, "", "", p.retenu]), ["Mobilier retenu", "", "", "", res.mob.total, "", "", res.mob.retenu]],
      "Autres préjudices": [["Nature du préjudice", "Précision de l'expert", "Q", "PU HT", "TVA %", "Montant HT", "Montant TTC"], ...d.autres.map((l) => { const c = res.autres.lines[l.id]; return [l.nat, l.des, num(l.q), num(l.pu), num(l.tva) / 100, r2(c.ht), r2(c.ttc)]; })],
      "Aménagements ext": [["Catégorie", "Désignation", "Unité", "Q", "PU HT", "Taux de vétusté", "TVA %", "Valeur à neuf HT", "VVD TTC"], ...d.amen.map((l) => { const c = res.amen.lines[l.id]; return [amenL(l.cat), l.des, l.unite, num(l.q), num(l.pu), num(l.vet) / 100, num(l.tva) / 100, r2(c.van || 0), r2(c.ttc || 0)]; }),
        [], ["Catégorie", "Plafond", "", "", "", "", "", "VVD TTC", "Retenu"], ...res.amen.cats.map((a) => [a.label, a.plafondTxt, "", "", "", "", "", a.ttc, r2(a.retenu)])],
      "Récapitulatif": [[`Contrat ${gm.label}`, d.ref, d.assure], [], ["Par corps d'état", "VAN HT", "Vétusté", "Reste HT vétusté déduite", "Vétusté récupérée", "Vétusté non récupérable", "TVA", "Total TTC après travaux"],
        ...[["Embellissements", res.immo.corps.emb], ["Immobilier", res.immo.corps.immo], ["Total", res.immo.corpsTotal]].map(([n, x]) => [n, x.van, x.vet, x.vvd, x.recup, x.nonRecup, x.tva, x.total]), [],
        ["Récapitulatif", "Acompte à régler", "Différé à la réception de la facture", "Différé à l'issue du recours", "Total"], ...res.pay.rows.map((r) => [r.label, r.acompte, r.differe, r.recours, r.total]), ["Solde ou total", t.acompte, t.differe, t.recours, t.total]],
      "Dépassement plafonds": [["Catégorie", "Plafond", "Dépassement"], ...res.depassements.map((x) => [x.label, x.plafond, x.montant])],
      "Non garantis": [["Nature du préjudice non garanti", "Précision", "VAN HT", "TVA %", "Montant TTC", "Taux de vétusté", "VVD TTC"], ...d.ng.map((l) => { const c = res.ng.lines[l.id]; return [l.nat, l.des, num(l.van), num(l.tva) / 100, r2(c.ttc), num(l.vet) / 100, r2(c.vvd)]; })],
    };
  }

  /* ----- Dialogues ----- */
  const dlg = () => $("#dlg");
  function confirmBox(msg, label, fn) {
    dlg().innerHTML = `<form method="dialog"><p>${h(msg)}</p><div class="foot"><button class="btn" value="no">Annuler</button><button class="btn primary" value="ok" id="dlg-ok">${h(label)}</button></div></form>`;
    dlg().onclose = () => { if (dlg().returnValue === "ok") fn(); };
    dlg().returnValue = ""; dlg().showModal();
  }
  function pickFromBareme(rubId) {
    const d = cur(), b = db.bareme, gm = g();
    const list = (q) => { const k = q.trim().toLowerCase(); let grp = null; return b.articles.filter((a) => !k || (a.grp + " " + a.des).toLowerCase().includes(k)).map((a) => {
      const p = a.prix[d.zone], head = a.grp !== grp ? ((grp = a.grp), `<tr class="grp"><td colspan="4">${h(a.grp)}</td></tr>`) : "";
      return `${head}<tr><td><input type="checkbox" id="pk-${a.id}" data-pick="${a.id}" aria-label="Choisir ${h(a.des)}"></td><td><label for="pk-${a.id}">${h(a.des)}</label></td><td class="num">${p == null ? '<span class="muted">à saisir</span>' : eur(p)}</td><td class="c-sm"><input class="n" inputmode="decimal" id="pq-${a.id}" data-qty="${a.id}" placeholder="${h(a.unite)}" aria-label="Quantité"></td></tr>`; }).join("") || '<tr><td colspan="4" class="empty">Aucun article ne correspond.</td></tr>'; };
    dlg().innerHTML = `<form method="dialog"><h2>Ajouter depuis le barème IMH · zone ${h(d.zone)}</h2>
      <div class="form"><label for="pk-q">Rechercher<input id="pk-q" type="search" placeholder="peinture, plinthe, ragréage…"></label>
        <label for="pk-rub">Rubrique<select id="pk-rub">${opts(gm.rubriques.map((r) => [r.id, r.label]), rubId)}</select></label>
        <label for="pk-real">Réalisation<select id="pk-real">${opts(R.REAL.map((x) => [x.id, x.label]), "na")}</select></label>
        <label for="pk-piece">Pièce<input id="pk-piece"></label><label for="pk-vet">Vétusté %<input id="pk-vet" inputmode="decimal"></label>
        <label for="pk-tva">TVA<select id="pk-tva">${opts(R.TVA.map((t) => [t, t ? t + " %" : "Exo"]), 10)}</select></label></div>
      <div class="scroll"><table><thead><tr><th></th><th>Article</th><th class="num">Prix zone ${h(d.zone)}</th><th class="num">Quantité</th></tr></thead><tbody id="pk-list">${list("")}</tbody></table></div>
      <div class="foot"><button class="btn" value="no">Annuler</button><button class="btn primary" value="ok">Ajouter les articles cochés</button></div></form>`;
    $("#pk-q").addEventListener("input", (e) => { $("#pk-list").innerHTML = list(e.target.value); });
    $("#pk-list").addEventListener("input", (e) => { if (e.target.dataset.qty && e.target.value) { const c = $(`#pk-${e.target.dataset.qty}`); if (c) c.checked = true; } });
    dlg().onclose = () => {
      if (dlg().returnValue !== "ok") return;
      const picked = $$("[data-pick]:checked", dlg()); if (!picked.length) return;
      const base = { rub: $("#pk-rub").value, real: $("#pk-real").value, piece: $("#pk-piece").value, vet: $("#pk-vet").value, tva: num($("#pk-tva").value) };
      for (const el of picked) { const a = b.articles.find((x) => x.id === el.dataset.pick), q = $(`#pq-${a.id}`).value;
        d.immo.push({ id: uid(), ...base, des: a.des, unite: a.unite, q: q || "1", pu: a.prix[d.zone] == null ? "" : String(a.prix[d.zone]), src: "Barème IMH" }); }
      save(); render(); toast(`${picked.length} article${picked.length > 1 ? "s" : ""} ajouté${picked.length > 1 ? "s" : ""}.`);
    };
    dlg().returnValue = ""; dlg().showModal(); $("#pk-q").focus();
  }
  function pasteCsv() {
    dlg().innerHTML = `<form method="dialog"><h2>Importer le barème</h2><p class="muted">Choisissez un fichier CSV, ou collez son contenu ci-dessous (export Excel en CSV séparateur point-virgule).</p>
      <div class="actions"><button class="btn" type="button" id="csv-file">Choisir un fichier…</button></div>
      <label for="csv-text" class="muted">Contenu CSV<textarea id="csv-text" rows="8" placeholder="groupe;article;unité;rubrique;zone 1;zone 2&#10;Murs;Peinture mate/satinée;m²;hab-emb;18,50;19,20"></textarea></label>
      <div class="foot"><button class="btn" value="no">Annuler</button><button class="btn primary" value="ok">Importer</button></div></form>`;
    $("#csv-file").onclick = () => $("#file-csv").click();
    dlg().onclose = () => { if (dlg().returnValue === "ok") importCsv($("#csv-text").value); };
    dlg().returnValue = ""; dlg().showModal();
  }
  function importCsv(text) {
    try { const b = IMH.parseBaremeCsv(text); db.bareme = b; const d = cur(); if (!b.zones.includes(d.zone)) d.zone = b.zones[0]; save(); render(); toast(`Barème importé : ${b.articles.length} articles, ${b.zones.length} zone${b.zones.length > 1 ? "s" : ""}.`); }
    catch (err) { toast(err.message); }
  }

  /* ----- Actions ----- */
  const acts = {
    tab(el) { ui.tab = el.dataset.v; try { sessionStorage.setItem(KEY + "-tab", ui.tab); } catch { /* sans stockage */ } window.scrollTo(0, 0); },
    "add-line"(el) { const sec = el.dataset.sec, l = { id: uid(), ...NEW[sec](el.dataset.v) }; cur()[sec].push(l); save(); render(); const f = $(`[data-id="${l.id}"][data-f="des"]`); if (f) f.focus(); return false; },
    "del-line"(el) { const d = cur(), sec = el.dataset.sec; d[sec] = d[sec].filter((l) => l.id !== el.dataset.id); save(); },
    "bareme-pick"(el) { pickFromBareme(el.dataset.v); return false; },
    new() { const d = IMH.newDossier(); d.zone = db.bareme.zones[0] || "1"; db.dossiers.push(d); db.current = d.id; ui.tab = "dossier"; save(); },
    dup() { const d = JSON.parse(JSON.stringify(cur())); d.id = IMH.newDossier().id; d.ref = (d.ref || "") + " (copie)"; db.dossiers.push(d); db.current = d.id; save(); toast("Dossier dupliqué."); },
    "del-dossier"() { const d = cur(); confirmBox(`Supprimer le dossier ${d.ref || "sans référence"} et tout son chiffrage ?`, "Supprimer", () => { db.dossiers = db.dossiers.filter((x) => x !== d); if (!db.dossiers.length) db.dossiers.push(exemple()); db.current = db.dossiers[0].id; ui.tab = "dossier"; save(); render(); }); return false; },
    "export-json"() { saveFile(baseName() + ".json", JSON.stringify({ format: "chiffrage-imh", version: 1, dossier: cur() }, null, 1), "application/json"); return false; },
    "import-json"() { $("#file-json").click(); return false; },
    "export-xlsx"() {
      const d = cur(), res = IMH.compute(d);
      loadXlsx().then((X) => {
        const wb = X.utils.book_new();
        for (const [name, rows] of Object.entries(workbook(d, res))) {
          const ws = X.utils.aoa_to_sheet(rows);
          ws["!cols"] = rows.reduce((w, r) => { r.forEach((v, i) => (w[i] = Math.min(60, Math.max(w[i] || 8, String(v == null ? "" : v).length + 2)))); return w; }, []).map((wch) => ({ wch }));
          X.utils.book_append_sheet(wb, ws, name);
        }
        saveFile(baseName() + ".xlsx", new Blob([X.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      }).catch(() => toast("Excel indisponible hors connexion : exportez le dossier en JSON."));
      return false;
    },
    print() { window.print(); return false; },
    "import-csv"() { pasteCsv(); return false; },
    "export-csv"() { saveFile("bareme-imh.csv", IMH.baremeCsv(db.bareme), "text/csv;charset=utf-8"); return false; },
    "add-article"() { db.bareme.articles.push({ id: "n" + uid(), grp: "Articles ajoutés", rub: "hab-tce", des: "Nouvel article", unite: "u", prix: {} }); save(); },
    "del-article"(el) { db.bareme.articles = db.bareme.articles.filter((a) => a.id !== el.dataset.id); save(); },
    "reset-bareme"() { confirmBox("Remplacer le barème par la liste d'articles IMH sans prix ?", "Rétablir", () => { db.bareme = defaultBareme(); save(); render(); }); return false; },
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const fn = acts[el.dataset.act]; if (!fn) return;
    e.preventDefault(); if (fn(el) !== false) render();
  });
  function setField(el) {
    const { sec, id, f } = el.dataset, v = el.type === "checkbox" ? el.checked : el.value;
    if (sec === "d") cur()[f] = v;
    else if (sec === "bar") { const a = db.bareme.articles.find((x) => x.id === id); if (!a) return; if (f.startsWith("z:")) { const z = f.slice(2); if (blank(v)) delete a.prix[z]; else a.prix[z] = num(v); } else a[f] = v; }
    else { const l = cur()[sec].find((x) => x.id === id); if (!l) return; l[f] = f === "tva" ? num(v) : v; }
    save();
  }
  document.addEventListener("input", (e) => { const el = e.target; if (!el.dataset || !el.dataset.sec) return; setField(el); refresh(); });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "dossier-pick") { db.current = el.value; save(); render(); return; }
    if (el.id === "file-json" || el.id === "file-csv") {
      const file = el.files[0]; if (!file) return; const rd = new FileReader();
      rd.onload = () => {
        if (el.id === "file-csv") { if (dlg().open) dlg().close("no"); importCsv(String(rd.result)); }
        else { try { const j = JSON.parse(String(rd.result)), d = j.dossier || j; if (!Array.isArray(d.immo)) throw new Error(); d.id = IMH.newDossier().id; for (const k of ["mob", "autres", "amen", "ng"]) d[k] = d[k] || []; db.dossiers.push(d); db.current = d.id; save(); render(); toast("Dossier importé."); }
          catch { toast("Ce fichier n'est pas un dossier de chiffrage IMH exporté depuis cet outil."); } }
        el.value = "";
      };
      rd.readAsText(file, "utf-8"); return;
    }
    if (el.dataset && el.dataset.sec && (el.tagName === "SELECT" || el.type === "checkbox")) { setField(el); if (el.dataset.rerender != null || el.dataset.sec === "d") render(); else refresh(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("td input") && !e.isComposing) { // passer à la ligne suivante, même colonne
      const td = e.target.closest("td"), tr = td.closest("tr"), idx = [...tr.children].indexOf(td);
      let next = tr.nextElementSibling; while (next && !next.children[idx]?.querySelector("input:not([disabled])")) next = next.nextElementSibling;
      if (next) { e.preventDefault(); next.children[idx].querySelector("input").focus(); }
    }
  });
  render();
  window.IMHApp = { db: () => db, compute: () => IMH.compute(cur()), render };
})();
