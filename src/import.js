/* Import d'un devis ou d'une facture dans le chiffrage : lecture du document, contrôle des lignes, intégration. */
(function () {
  "use strict";
  const A = ECApp.api, { h, eur, n2, parseNum, toast } = A, { MBV, RSE, num, blank, r2 } = EC;
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const $ = (s, el) => (el || document).querySelector(s);
  let S = null; // état du dialogue en cours

  const loadScript = (src) => new Promise((ok, ko) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => ko(new Error("load")); document.head.appendChild(el); });
  async function pdfLib() {
    if (!window.pdfjsLib) { await loadScript(PDFJS + "pdf.min.js"); await loadScript(PDFJS + "pdf.worker.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; }
    return window.pdfjsLib;
  }
  const fileText = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsText(f); });
  const fileBytes = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result)); r.onerror = ko; r.readAsArrayBuffer(f); });
  async function openPdf(file) { const lib = await pdfLib(); return lib.getDocument({ data: await fileBytes(file) }).promise; }
  async function pdfText(pdf) {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      pages.push(ECExtract.itemsToText(tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) }))));
    }
    return pages.join("\n");
  }
  async function pdfImages(pdf, max) {
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, max); i++) {
      const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1.7 }), cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      out.push(await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.85)));
    }
    return out;
  }
  const isPdf = (f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
  const isImage = (f) => /^image\//.test(f.type);

  /* ----- Étape 1 : choix du document ----- */
  function open() {
    if (A.readOnly()) return;
    const c = A.cur(), e = A.est(), { tp, roId } = A.dmgScope(c, e);
    S = { c, e, tp, roId, doc: null, sample: null, label: "" };
    const d = A.dlg();
    d.innerHTML = `<div class="dlg-body"><h3>Importer un devis ou une facture</h3>
      <p class="muted">Les lignes chiffrées du document sont repérées, vous les contrôlez, puis elles sont ajoutées aux prestations de ${h(tp.name)}${tp.insured ? " · " + h(A.roLabel(c, roId)) : ""}.</p>
      <div class="fld"><label for="imp-doc-file">Document : PDF, image, ou fichier texte / CSV</label><input type="file" id="imp-doc-file" accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv,image/*"></div>
      <div class="fld"><label for="imp-doc-text">Ou collez ici le texte du document</label><textarea id="imp-doc-text" rows="6" placeholder="Désignation   Qté   U   P.U. HT   TVA   Total HT"></textarea></div>
      <p class="muted" id="imp-privacy">La lecture se fait dans ce navigateur : le document n'est envoyé nulle part.</p>
      <p class="form-err" id="imp-status" role="status" hidden></p></div>
      <div class="dlg-foot"><button class="btn ghost" data-act="dlg-close">Annuler</button><button class="btn" id="imp-ai" hidden>Analyser avec Claude</button><button class="btn primary" id="imp-run">Extraire les lignes</button></div>`;
    $("#imp-run", d).onclick = () => run(false);
    $("#imp-ai", d).onclick = () => run(true);
    d.showModal();
    // l'analyse par Claude n'existe que dans la page publiée sur claude.ai
    if (window.claude && window.claude.use) window.claude.use("sample").then((fn) => {
      if (!fn || !S || S.doc) return; S.sample = fn;
      const b = $("#imp-ai", d); if (!b) return; b.hidden = false;
      $("#imp-privacy", d).textContent = "« Extraire les lignes » lit le document dans ce navigateur, sans rien envoyer. « Analyser avec Claude » envoie son contenu à Claude : à réserver aux scans et aux photos, ou aux mises en page que la lecture locale ne comprend pas.";
    }).catch(() => {});
  }
  function status(msg, busy) {
    const p = $("#imp-status"); if (!p) return;
    p.hidden = !msg; p.textContent = msg || ""; p.className = busy ? "muted" : "form-err";
    ["#imp-run", "#imp-ai"].forEach((s) => { const b = $(s); if (b) b.disabled = !!busy; });
  }
  async function run(useAi) {
    const d = A.dlg(), file = $("#imp-doc-file", d).files[0], pasted = $("#imp-doc-text", d).value.trim();
    if (!file && !pasted) return status("Choisissez un document ou collez son texte.");
    S.label = file ? file.name : "texte collé";
    let text = pasted, pdf = null;
    try {
      if (!text && file) {
        if (isPdf(file)) { status("Lecture du PDF…", true); pdf = await openPdf(file); text = (await pdfText(pdf)).trim(); }
        else if (!isImage(file)) text = (await fileText(file)).trim();
      }
    } catch (err) {
      return status(err && err.message === "load" ? "Le lecteur PDF n'a pas pu être chargé (connexion internet requise). Collez le texte du document à la place." : "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un PDF ou d'un fichier texte.");
    }
    if (useAi) return runAi(text, file, pdf);
    if (!text) return status(file && isImage(file) ? "Une image ne peut pas être lue localement." + (S.sample ? " Utilisez « Analyser avec Claude »." : " Collez le texte du document, ou importez un PDF contenant du texte.")
      : "Ce PDF est un scan : il ne contient pas de texte." + (S.sample ? " Utilisez « Analyser avec Claude »." : " Collez le texte du document à la place."));
    const doc = ECExtract.parseQuoteText(text);
    if (!doc.lines.length) return status("Aucune ligne chiffrée reconnue dans ce document." + (S.sample ? " Essayez « Analyser avec Claude »." : " Vérifiez que chaque ligne porte une désignation et un montant."));
    review(doc);
  }
  async function runAi(text, file, pdf) {
    const opts = { cache: false };
    let prompt = "Tu lis un devis ou une facture d'artisan ou d'entreprise du bâtiment (document français). Extrais chaque ligne chiffrée de prestation ou de fourniture. Ignore les sous-totaux, totaux, acomptes, remises globales et mentions légales. " +
      'Réponds uniquement par un objet JSON de cette forme : {"kind":"devis"|"facture","supplier":string|null,"number":string|null,"date":string|null,"totalHT":number|null,"totalTTC":number|null,"lines":[{"designation":string,"quantity":number,"unit":string|null,"unitPriceHT":number,"vatRate":number|null,"totalHT":number}]}. ' +
      "Les montants sont des nombres hors taxes avec un point décimal. Si seul un montant TTC figure sur une ligne, convertis-le en HT avec son taux de TVA. Ne déduis rien qui ne soit pas écrit dans le document.";
    try {
      status("Analyse du document par Claude…", true);
      if (text) prompt += "\n\nTexte du document (les tabulations séparent les colonnes) :\n" + text.slice(0, 60000);
      else {
        const lim = await S.sample.limits().catch(() => null);
        if (!lim || !lim.images) return status("L'envoi d'images à Claude n'est pas disponible dans cette vue. Collez le texte du document.");
        opts.images = pdf ? await pdfImages(pdf, lim.images.maxCount || 4) : [file];
        prompt += "\n\nLe document est fourni en image" + (opts.images.length > 1 ? "s, une par page." : ".");
      }
      const doc = ECExtract.fromModel(await S.sample.json(prompt, opts));
      if (!doc.lines.length) return status("Claude n'a trouvé aucune ligne chiffrée dans ce document.");
      doc.byModel = true; review(doc);
    } catch (err) {
      const code = err && err.code;
      status(code === "not_granted" ? "L'analyse par Claude n'a pas été autorisée. La lecture locale reste disponible." : code === "rate_limited" ? "Trop de demandes pour l'instant. Réessayez dans un moment." : code === "image_rejected" ? "Ce format d'image n'est pas accepté. Essayez un PDF, un JPEG ou un PNG." : "L'analyse par Claude a échoué. Réessayez, ou utilisez la lecture locale.");
    }
  }

  /* ----- Étape 2 : contrôle des lignes ----- */
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const STOP = new Set(["fourniture", "fournitures", "remplacement", "couches", "location", "jours", "dépose", "depose", "installation", "prestation", "travaux", "divers", "mise", "avec", "pour", "sans"]);
  const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !STOP.has(w)).map((w) => w.slice(0, 6));
  // Propose une nature d'après les mots de la désignation (détails et prestations du référentiel)
  function guessNature(name, natures) {
    const ws = new Set(words(name)); let best = null, score = 0;
    for (const n of natures) { let sc = 0; n.kw2.forEach((w) => ws.has(w) && (sc += 2)); n.kw1.forEach((w) => ws.has(w) && (sc += 1)); if (sc > score) { score = sc; best = n; } }
    return best ? best.value : "";
  }
  function review(doc) {
    S.doc = doc;
    const { c, e, tp } = S, d = A.dlg(), L = A.L;
    const irsi = c.irsiEnabled ? "true" : "false";
    const natures = ECApp.db.refs.benefits.filter((b) => b.l1 !== MBV && b.l1 !== RSE && (blank(b.rec) || b.rec === irsi)).map((b) => ({ value: b.l1 + "›" + b.l2, label: b.l1 + " › " + b.l2, kw2: words(b.l2),
      kw1: [...new Set(ECApp.db.refs.prices.filter((p) => p.l1 === b.l1 && p.l2 === b.l2).flatMap((p) => words(p.name)))] }));
    const natOpts = (sel, first) => `<option value="">${first}</option>` + natures.map((n) => `<option value="${h(n.value)}"${n.value === sel ? " selected" : ""}>${h(n.label)}</option>`).join("");
    const kind = doc.kind === "facture" ? "Facture" : "Devis";
    S.source = [kind, doc.number ? "n° " + doc.number : "", doc.supplier || ""].filter(Boolean).join(" ");
    const defVat = blank(tp.vat) ? 20 : tp.vat;
    const bens = [{ display: "" }].concat(A.possibleBeneficiaries(c));
    const rows = doc.lines.map((l, i) => `<tr data-i="${i}"><td><input type="checkbox" class="ir-on" id="ir-on-${i}" checked aria-label="Retenir la ligne"></td>
      <td><input class="ir-name" id="ir-name-${i}" value="${h(l.name)}" aria-label="Désignation">${l.check ? '<small class="warn-t">Quantité ou prix à vérifier</small>' : ""}</td>
      <td><input class="num xs ir-qty" id="ir-qty-${i}" inputmode="decimal" value="${A.qty(l.qty)}" aria-label="Quantité"></td>
      <td><select class="ir-um" id="ir-um-${i}" aria-label="Unité">${[""].concat(L.units).map((u) => `<option${u === (l.unit || "") ? " selected" : ""}>${u}</option>`).join("")}</select></td>
      <td><input class="num ir-pu" id="ir-pu-${i}" inputmode="decimal" value="${n2(l.unitPrice)}" aria-label="Prix unitaire HT"></td>
      <td><input class="num xs ir-vat" id="ir-vat-${i}" inputmode="decimal" value="${blank(l.vat) ? "" : String(l.vat).replace(".", ",")}" placeholder="${String(defVat).replace(".", ",")}" aria-label="TVA %"></td>
      <td class="r ir-tot"></td>
      <td><select class="ir-nat" id="ir-nat-${i}" aria-label="Nature">${natOpts(guessNature(l.name, natures), "Nature par défaut")}</select></td></tr>`).join("");
    d.innerHTML = `<div class="dlg-body"><h3>Contrôler les lignes à intégrer</h3>
      <p class="muted">${h(S.source)}${doc.date ? " du " + h(doc.date) : ""} · ${h(S.label)}${doc.byModel ? " · lu par Claude : vérifiez chaque montant avec le document" : ""}</p>
      <p id="ir-check" class="banner"></p>
      <div class="grid">
        <div class="fld"><label for="ig-nat">Nature par défaut</label><select id="ig-nat">${natOpts("", "À choisir")}</select></div>
        <div class="fld"><label for="ig-mode">Mode d'indemnisation</label><select id="ig-mode"><option value="IP">IP · indemnité pécuniaire</option><option value="REN">REN · réparation en nature</option></select></div>
        <div class="fld"><label for="ig-obs">Vétusté %</label><input id="ig-obs" class="num" inputmode="decimal"></div>
        <div class="fld"><label for="ig-room">Pièce</label><select id="ig-room"><option value="">—</option>${c.rooms.map((r) => `<option value="${r.id}">${h(r.name)}</option>`).join("")}</select></div>
        <div class="fld"><label for="ig-ben">Bénéficiaire</label><select id="ig-ben">${bens.map((b) => `<option value="${h(b.display)}">${h(b.display || "—")}</option>`).join("")}</select></div>
        <div class="fld"><label class="inline"><input type="checkbox" id="ig-claimed"> Reporter le total du document dans le montant réclamé</label></div>
      </div>
      <div class="tw imp-tw"><table><thead><tr><th></th><th>Désignation</th><th class="r">Qté</th><th>Unité</th><th class="r">Prix unitaire HT €</th><th class="r">TVA %</th><th class="r">Montant HT €</th><th>Nature</th></tr></thead><tbody id="ir-body">${rows}</tbody></table></div>
      <p class="form-err" id="imp-status" hidden></p></div>
      <div class="dlg-foot"><button class="btn ghost" data-act="dlg-close">Annuler</button><button class="btn ghost" id="imp-back">Autre document</button><button class="btn primary" id="imp-go"></button></div>`;
    const body = $("#ir-body", d);
    const refresh = () => {
      let sum = 0, n = 0;
      body.querySelectorAll("tr").forEach((tr) => {
        const q = parseNum($(".ir-qty", tr).value), pu = parseNum($(".ir-pu", tr).value), t = q > 0 && pu >= 0 && pu !== null ? r2(q * pu) : null;
        $(".ir-tot", tr).textContent = t === null ? "–" : eur(t);
        const on = $(".ir-on", tr).checked; tr.classList.toggle("off", !on);
        if (on) { n++; sum += num(t); }
      });
      sum = r2(sum);
      const chk = $("#ir-check", d), ht = doc.totals.ht;
      const ok = !blank(ht) && Math.abs(sum - ht) < 0.015;
      chk.className = "banner " + (blank(ht) ? "info" : ok ? "ok" : "warn");
      chk.textContent = `${n} ligne${n > 1 ? "s" : ""} retenue${n > 1 ? "s" : ""} pour ${eur(sum)} HT. ` + (blank(ht) ? "Le total HT du document n'a pas été repéré : comparez avec le document." : ok ? `Identique au total HT du document.` : `Le document annonce ${eur(ht)} HT : écart de ${eur(r2(sum - ht))}.`);
      $("#imp-go", d).textContent = n ? `Intégrer ${n} ligne${n > 1 ? "s" : ""} au chiffrage` : "Aucune ligne retenue"; $("#imp-go", d).disabled = !n;
      S.sum = sum;
    };
    body.addEventListener("input", refresh); body.addEventListener("change", refresh); refresh();
    $("#imp-back", d).onclick = open;
    $("#imp-go", d).onclick = integrate;
  }

  function integrate() {
    const { c, e, tp, roId, doc } = S, d = A.dlg();
    const fail = (msg, el) => { const p = $("#imp-status", d); p.hidden = false; p.textContent = msg; if (el) el.focus(); };
    const defNat = $("#ig-nat", d).value, mode = $("#ig-mode", d).value, obs = parseNum($("#ig-obs", d).value);
    if (obs === undefined || (obs !== null && (obs < 0 || obs > 100))) return fail("La vétusté doit être un pourcentage entre 0 et 100.", $("#ig-obs", d));
    const defVat = blank(tp.vat) ? 20 : tp.vat, list = [];
    for (const tr of d.querySelectorAll("#ir-body tr")) {
      if (!$(".ir-on", tr).checked) continue;
      const name = $(".ir-name", tr).value.trim(), q = parseNum($(".ir-qty", tr).value), pu = parseNum($(".ir-pu", tr).value), vat = parseNum($(".ir-vat", tr).value), nat = $(".ir-nat", tr).value || defNat;
      if (!name) return fail("Une ligne retenue n'a pas de désignation.", $(".ir-name", tr));
      if (!(q > 0)) return fail(`« ${name} » : la quantité doit être supérieure à 0.`, $(".ir-qty", tr));
      if (pu === null || pu === undefined || pu < 0) return fail(`« ${name} » : le prix unitaire n'est pas valide.`, $(".ir-pu", tr));
      if (vat === undefined || (vat !== null && (vat < 0 || vat >= 100))) return fail(`« ${name} » : la TVA doit être un pourcentage entre 0 et 100.`, $(".ir-vat", tr));
      if (!nat) return fail("Choisissez une nature par défaut, ou une nature sur chaque ligne.", $("#ig-nat", d));
      list.push({ name, q, pu, vat: vat === null ? defVat : vat, um: $(".ir-um", tr).value, nat });
    }
    const calc = A.getCalc(e, tp.id, roId, true);
    for (const x of list) {
      const [l1, l2] = x.nat.split("›");
      const a = EC.damageAmounts({ l1, qty: x.q, unit: x.pu, vat: x.vat, obsPct: obs }, calc.taxRegime);
      const dm = { id: A.uid(), calculationId: calc.id, thirdPartyId: tp.id, riskObjectId: roId, l1, l2, name: x.name, repairer: "Hors bordereau", mode, qty: x.q, um: x.um, unit: x.pu, vat: x.vat,
        obsPct: EC.r1(a.obsPct), obsAmount: a.obsAmount, priceWithObs: a.priceWithObs, priceNoVAT: a.priceNoVAT, priceWithVAT: a.priceWithVAT,
        beneficiaryName: $("#ig-ben", d).value, roomId: $("#ig-room", d).value || null, co2: null, csr: null, source: S.source };
      dm.lineIndex = EC.nextLineIndex(A.scopeDamages(e, tp, roId).filter((y) => y.l1 !== MBV), l1, l2);
      dm.irsiAmount = EC.irsiAmount(A.benefitOf(l1, l2), dm);
      e.damages.push(dm);
    }
    if ($("#ig-claimed", d).checked) calc.claimedAmount = !blank(doc.totals.ttc) ? doc.totals.ttc : !blank(doc.totals.ht) ? doc.totals.ht : S.sum;
    A.touch(e, calc);
    ECApp.ui.tab = "prest"; S = null;
    A.closeDlg(); ECApp.render();
    toast(`${list.length} ligne${list.length > 1 ? "s" : ""} intégrée${list.length > 1 ? "s" : ""} au chiffrage`);
  }

  ECApp.acts["import-doc"] = () => { open(); return false; };
})();
