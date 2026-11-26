/* Référentiel IMH : gammes de contrat, plafonds, catégories, barème d'articles normalisés.
   Source : classeurs « CHIFFRAGE DOMMAGES VIERGE <GAMME>.xlsx », supports de chiffrage IMH 2018
   et grille « Estimation et vétusté des biens mobiliers, gamme 2017 socle et options ».
   Plafond : {eur} montant fixe · {pct, max?} part du capital mobilier souscrit (plafonnée à max) ·
   {field} montant saisi sur le dossier · null : pas de plafond. */
const IMHData = (() => {
  const STD_RUB = [
    { id: "hab-tce", label: "Locaux d'habitation · Bâtiment TCE", corps: "immo", recup: true },
    { id: "hab-emb", label: "Locaux d'habitation · Embellissements", corps: "emb", recup: true },
    { id: "dep", label: "Dépendances", corps: "immo", recup: false },
    { id: "clo", label: "Clôtures, murs de clôture, portails", corps: "immo", recup: false },
  ];
  const NATURE_RUB = [
    { id: "mh-rep", label: "Réparation du mobil-home", corps: "immo", recup: false, plafond: { field: "valeurOccasionMH" }, note: "Dans la limite de la valeur de remplacement sur le marché de l'occasion" },
    { id: "mh-rem", label: "Remplacement du mobil-home (valeur d'occasion, accessoires intégrés)", corps: "immo", recup: false },
    { id: "mh-frais", label: "Frais d'enlèvement, démolition, réinstallation, raccordement", corps: "immo", recup: false, plafond: { eur: 3000 }, note: "Sur factures" },
    { id: "mh-dep", label: "Dépendances, abri de jardin et leurs frais de démolition", corps: "immo", recup: false, plafond: { eur: 5000 } },
  ];

  /* Catégories mobilières. kind : neuf (valeur de remplacement, pas de vétusté sous le seuil d'âge),
     taux (vétusté appréciée), occasion (valeur d'occasion, sans vétusté). fam : famille de la grille 2017. */
  const C = {
    meubles: { label: "Meubles meublants dont éléments de cuisine", kind: "neuf", fam: "equip" },
    appareils: { label: "Appareils vidéo, audio, photo, électroménager, climatiseur portable", kind: "neuf", fam: "equip" },
    info: { label: "Informatique", kind: "neuf", fam: "info" },
    vetements: { label: "Vêtements", kind: "taux", fam: "vet" },
    autres: { label: "Autres objets mobiliers", kind: "taux", fam: "autres" },
    epoque: { label: "Meubles d'époque ou signés", kind: "taux", fam: "autres" },
    bijoux: { label: "Bijoux et objets en métal précieux massif", kind: "occasion", fam: "occ" },
    objets: { label: "Objets de valeur et collections (plus de 2 000 €)", kind: "occasion", fam: "occ" },
    vins: { label: "Vins et spiritueux", kind: "occasion", fam: "occ" },
  };
  const cat = (id, extra) => ({ id, ...C[id], ...extra });
  const AUTRES_LABEL = "Matériel professionnel de l'employeur et autres biens n'appartenant pas à l'assuré";
  const TIERS_LABEL = "Biens confiés ou apportés par des tiers (hors matériel professionnel)";

  const gammes = {
    NATURE: {
      label: "Nature", note: "Mobil-home", recupMax: 0,
      rubriques: NATURE_RUB,
      mobilier: [
        { id: "mh-biens", label: "Biens acquis indépendamment de l'équipement du mobil-home (audio, vidéo, photo, électroménager, informatique)", kind: "neuf", fam: "equip", seuil: 1 },
        { id: "vet-autres", label: "Vêtements et autres objets mobiliers", kind: "taux", fam: "vet" },
        { id: "bij-obj", label: "Bijoux, objets de valeur et collections", kind: "occasion", fam: "occ" },
      ],
      plafondsMob: [{ label: "Bijoux, objets de valeur et collections", cats: ["bij-obj"], plafond: { eur: 1000 } }],
      amenag: [
        { id: "amen", label: "Aménagements immobiliers d'extérieur, y compris démolition et déblais", plafond: { eur: 5000 } },
        { id: "meub-ext", label: "Meubles d'extérieur", plafond: { eur: 1500 } },
      ],
    },
    INDISPENSABLE: {
      label: "Indispensable", recupMax: 0.25, rubriques: STD_RUB,
      mobilier: [cat("meubles", { seuil: 2 }), cat("appareils", { seuil: 2 }), cat("info", { seuil: 2 }), cat("vetements"), cat("autres"), cat("epoque"), cat("bijoux"), cat("objets"), cat("vins"),
        { id: "tiers", label: TIERS_LABEL, kind: "taux", fam: "autres" }],
      plafondsMob: [
        { label: "Bijoux et objets de valeur (plafond global)", cats: ["bijoux", "objets"], plafond: { eur: 5250 } },
        { label: "Vins et spiritueux", cats: ["vins"], plafond: { pct: 0.15 } },
        { label: TIERS_LABEL, cats: ["tiers"], plafond: { eur: 1500 } },
      ],
      amenag: [{ id: "amen", label: "Aménagements immobiliers d'extérieur", plafond: { eur: 5000 } }],
    },
    CONFIANCE: {
      label: "Confiance", recupMax: 0.25, rubriques: STD_RUB,
      mobilier: [cat("meubles", { seuil: 2 }), cat("appareils", { seuil: 2 }), cat("info", { seuil: 2 }), cat("vetements"), cat("autres"), cat("epoque"), cat("bijoux"), cat("objets"), cat("vins"),
        { id: "pro", label: "Matériel à usage professionnel appartenant à l'assuré", kind: "neuf", fam: "equip", seuil: 2 },
        { id: "tiers", label: AUTRES_LABEL, kind: "taux", fam: "autres" }],
      plafondsMob: [
        { label: "Bijoux et objets en métal précieux massif", cats: ["bijoux"], plafond: { pct: 0.2, max: 4000 } },
        { label: "Objets de valeur et collections", cats: ["objets"], plafond: { pct: 0.2, max: 4000 } },
        { label: "Vins et spiritueux", cats: ["vins"], plafond: { eur: 2000 } },
        { label: "Matériel professionnel de l'assuré", cats: ["pro"], plafond: { eur: 4000 } },
        { label: AUTRES_LABEL, cats: ["tiers"], plafond: { eur: 2000 } },
      ],
      amenag: [{ id: "amen", label: "Aménagements immobiliers d'extérieur", plafond: { eur: 4000 } }],
    },
    CONFORT: {
      label: "Confort", recupMax: 0.25, rubriques: STD_RUB,
      mobilier: [cat("meubles", { seuil: 5 }), cat("appareils", { seuil: 5 }), cat("info", { seuil: 2 }), cat("vetements"), cat("autres"), cat("epoque"), cat("bijoux"), cat("objets"), cat("vins"),
        { id: "pro", label: "Matériel professionnel appartenant à l'assuré ou à l'employeur", kind: "neuf", fam: "equip", seuil: 5 },
        { id: "tiers", label: TIERS_LABEL, kind: "taux", fam: "autres" }],
      plafondsMob: [
        { label: "Bijoux et objets de valeur (plafond global)", cats: ["bijoux", "objets"], plafond: { eur: 21000 } },
        { label: "Vins et spiritueux", cats: ["vins"], plafond: { pct: 0.3 } },
        { label: "Matériel professionnel", cats: ["pro"], plafond: { eur: 1500 } },
        { label: TIERS_LABEL, cats: ["tiers"], plafond: { eur: 3000 } },
      ],
      amenag: [
        { id: "amen", label: "Aménagements immobiliers d'extérieur", plafond: { eur: 15000 } },
        { id: "fuite-ext", label: "Recherche de fuites sur canalisation extérieure et surconsommation d'eau", plafond: { eur: 3000 } },
        { id: "arbres", label: "Arbres et plantations", plafond: { eur: 3000 } },
        { id: "piscine", label: "Piscines, leurs abris et leurs installations", plafond: { eur: 50000 } },
        { id: "meub-ext", label: "Meubles d'extérieur", plafond: { eur: 3000 } },
        { id: "loisirs", label: "Aménagements d'extérieur de loisirs ou d'agrément", plafond: { eur: 5000 } },
        { id: "dev-dur", label: "Équipements de développement durable", plafond: { eur: 20000 } },
        { id: "perte-elec", label: "Perte d'exploitation d'électricité (sur un an)", plafond: { eur: 3000 } },
      ],
    },
    PERFORMANCE: {
      label: "Performance", recupMax: 0.25, rubriques: STD_RUB,
      mobilier: [cat("meubles", { seuil: 5 }), cat("appareils", { seuil: 5 }), cat("info", { seuil: 2 }), cat("vetements"), cat("autres"), cat("epoque"), cat("bijoux"), cat("objets"), cat("vins"),
        { id: "pro", label: "Matériel à usage professionnel appartenant à l'assuré", kind: "neuf", fam: "equip", seuil: 5 },
        { id: "tiers", label: AUTRES_LABEL, kind: "taux", fam: "autres" }],
      plafondsMob: [
        { label: "Bijoux et objets en métal précieux massif", cats: ["bijoux"], plafond: { pct: 0.4, max: 8000 } },
        { label: "Objets de valeur et collections", cats: ["objets"], plafond: { pct: 0.4, max: 8000 } },
        { label: "Vins et spiritueux", cats: ["vins"], plafond: { eur: 2000 } },
        { label: "Matériel professionnel de l'assuré", cats: ["pro"], plafond: { eur: 4000 } },
        { label: AUTRES_LABEL, cats: ["tiers"], plafond: { eur: 2000 } },
      ],
      amenag: [
        { id: "amen", label: "Aménagements immobiliers d'extérieur", plafond: { eur: 8000 } },
        { id: "terrasses", label: "Terrasses, murs de soutènement, chemins d'accès, escaliers", plafond: { eur: 6000 } },
        { id: "fuite-ext", label: "Recherche de fuites sur canalisation extérieure enterrée (1 000 €) et surconsommation d'eau (1 000 €)", plafond: { eur: 2000 } },
        { id: "arbres", label: "Arbres et plantations", plafond: { eur: 2000 } },
        { id: "piscine", label: "Piscines, leurs abris et installation de chauffage", plafond: { eur: 50000 } },
        { id: "loisirs", label: "Meubles et aménagements d'extérieur de loisirs ou d'agrément", plafond: { eur: 4000 } },
        { id: "dev-dur", label: "Équipements de développement durable", plafond: { eur: 20000 } },
      ],
    },
    TRANQUILLITE: {
      label: "Tranquillité", recupMax: 0.25, rubriques: STD_RUB,
      mobilier: [cat("meubles", { seuil: Infinity }), cat("appareils", { seuil: Infinity }), cat("info", { seuil: Infinity }), cat("vetements"), cat("autres"), cat("epoque"), cat("bijoux"), cat("objets"), cat("vins"),
        { id: "pro", label: "Matériel professionnel appartenant à l'assuré ou à l'employeur", kind: "neuf", fam: "equip", seuil: Infinity },
        { id: "tiers", label: TIERS_LABEL, kind: "taux", fam: "autres" }],
      plafondsMob: [
        { label: "Bijoux et objets de valeur (plafond global)", cats: ["bijoux", "objets"], plafond: { eur: 25000 } },
        { label: "Vins et spiritueux", cats: ["vins"], plafond: { pct: 0.5 } },
        { label: "Matériel professionnel", cats: ["pro"], plafond: { eur: 1500 } },
        { label: TIERS_LABEL, cats: ["tiers"], plafond: { eur: 5000 } },
      ],
      amenag: [
        { id: "amen", label: "Aménagements immobiliers d'extérieur", plafond: { eur: 25000 } },
        { id: "fuite-ext", label: "Recherche de fuites sur canalisation extérieure et surconsommation d'eau", plafond: { eur: 5000 } },
        { id: "arbres", label: "Arbres et plantations", plafond: { eur: 5000 } },
        { id: "piscine", label: "Piscines, leurs abris et installation de chauffage", plafond: { eur: 100000 } },
        { id: "meub-ext", label: "Meubles d'extérieur", plafond: { pct: 0.5 } },
        { id: "loisirs", label: "Aménagements d'extérieur de loisirs ou d'agrément", plafond: null, note: "Valeur de reconstruction vétusté déduite" },
        { id: "dev-dur", label: "Équipements de développement durable", plafond: null, note: "Valeur de reconstruction vétusté déduite" },
        { id: "perte-elec", label: "Perte d'exploitation d'électricité (sur un an)", plafond: { eur: 3000 } },
      ],
    },
  };

  const autresPrejudices = [
    "Travaux de recherche de fuite", "Gel de canalisations et appareils à effet d'eau", "Frais de démolition et déblais",
    "Détériorations immobilières pour réparation des conducteurs électriques", "Frais de relogement", "Perte de loyer",
    "Frais de garde, de déplacement et de replacement des objets mobiliers", "Détériorations immobilières pour porter secours",
    "Frais de gardiennage, de clôture provisoire, de bâchage", "Autre",
  ];
  const nonGarantis = [
    "Moyens de paiement, titres et valeurs mobilières", "Espèces, chèques déjeuner ou autres titres de paiement", "VTAM soumis à obligation d'assurance",
    "Microtracteurs et leurs remorques", "Embarcations à moteur, moteurs hors-bord", "Planche à voile, kitesurf", "Marchandises destinées à l'exercice d'une profession",
    "Animaux", "Appareils de locomotion aérienne", "Terrain", "Essentiel, bijoux", "Essentiel, objets précieux", "Essentiel, vins et spiritueux",
    "Essentiel, matériel professionnel", "Essentiel, biens prêtés ou apportés par des tiers", "Essentiel, biens mobiliers dans une dépendance",
    "Essentiel, biens immobiliers à une autre adresse", "Essentiel, détériorations immobilières (conducteurs électriques)", "Autre (à préciser)",
  ];

  const REAL = [
    { id: "na", label: "Entreprise non agréée" },
    { id: "ag", label: "Entreprise agréée" },
    { id: "fo", label: "Fourniture par le sociétaire" },
    { id: "po", label: "Pose par le sociétaire" },
  ];
  const TVA = [10, 20, 5.5, 0];
  const UNITS = ["m²", "ml", "u", "forfait", "h", "m³"];

  const GRILLES = [
    { id: "contrat", label: "Contrat : 10 % par an après le seuil d'âge, 80 % au plus" },
    { id: "2017-socle", label: "Gamme 2017, socle" },
    { id: "2017-5ans", label: "Gamme 2017, option rééquipement à neuf 5 ans" },
    { id: "2017-illimite", label: "Gamme 2017, option rééquipement à neuf illimité" },
  ];

  /* Articles normalisés des supports de chiffrage IMH 2018 (prix à importer par zone). */
  const A = (grp, rub, list) => list.map(([des, unite]) => ({ grp, rub, des, unite }));
  const articles = [
    ...A("Plafonds", "hab-emb", [["Peinture mate/satinée", "m²"], ["Peinture brillante", "m²"], ["Peinture laque roulée", "m²"], ["Peinture laque tendue (spaltée)", "m²"], ["Peinture à projeter gouttelette", "m²"], ["Plus-value peinture corniche/moulure", "ml"], ["Plus-value peinture rosace en plâtre", "forfait"], ["Remplacement plaques de plâtre", "m²"], ["Plus-value plaques hydrofuges", "m²"], ["Entoilage plafond", "m²"], ["Dépose seule PP/tissu tendu/TDV", "m²"], ["Remplacement toile de verre peinte", "m²"], ["Remplacement papier peint", "m²"], ["Remplacement papier peint à peindre", "m²"], ["Faux plafond dalle minérale", "m²"], ["Lambris bois ou PVC", "m²"]]),
    ...A("Murs", "hab-emb", [["Peinture mate/satinée", "m²"], ["Peinture brillante", "m²"], ["Peinture laque roulée", "m²"], ["Peinture laque tendue (spaltée)", "m²"], ["Peinture à projeter gouttelette", "m²"], ["Remplacement toile de verre peinte", "m²"], ["Remplacement papier peint", "m²"], ["Remplacement papier peint à peindre", "m²"], ["Remplacement frise/galon", "m²"], ["Remplacement plaques de plâtre", "m²"], ["Dépose seule PP/tissu tendu/TDV", "m²"], ["Lambris mural bois ou PVC", "m²"], ["Peinture radiateur standard", "forfait"], ["Peinture radiateur à ailettes", "forfait"], ["Plus-value peinture tuyaux", "ml"], ["Peinture décorative", "m²"], ["Peinture porte d'entrée palière/service", "u"], ["Peinture porte-fenêtre/volets 3 pentures", "u"], ["Peinture fenêtre/volets 2 pentures", "u"], ["Mise en teinte surface de boiserie", "m²"]]),
    ...A("Travaux préparatoires", "hab-emb", [["Enduit en complément", "m²"], ["Recherche de teinte", "forfait"], ["Lessivage en conservation", "m²"], ["Couche anti-moisissures", "m²"]]),
    ...A("Sols", "hab-emb", [["Dépose seule revêtement de sol", "m²"], ["Remplacement moquette ou sol PVC", "m²"], ["Ragréage", "m²"], ["Barre de seuil", "u"], ["Ponçage, vitrification de parquet < 10 m²", "forfait"], ["Ponçage/vitrification au-delà de 10 m²", "m²"], ["Ponçage et mise en cire de parquet", "m²"], ["Mise en teinte surface sol", "m²"]]),
    ...A("Immobilier", "hab-tce", [["Reprise de plâtre sur plafond", "m²"], ["Reprise de plâtres sur murs", "m²"], ["Piquage seul d'enduit plâtre", "m²"], ["Remplacement parquet flottant avec feutre", "m²"], ["Remplacement parquet cloué", "m²"], ["Remplacement parquet collé", "m²"], ["Remplacement plaques de plâtre murs", "m²"], ["Ossature neuve pour plaque de plâtre", "m²"], ["Plus-value plaques hydrofuges", "m²"], ["Remplacement de plinthe bois ou PVC", "ml"], ["Remplacement de 1/4 de rond", "ml"], ["Laine de verre ou roche plafond/murs", "m²"], ["Préparation surface endommagée carrelage/faïence", "m²"], ["Remplacement carrelage sol", "forfait"], ["Remplacement faïence collée", "forfait"], ["Remplacement plinthe faïence", "ml"], ["Reprise de tablette douche/tablier baignoire", "ml"]]),
    ...A("Forfaits petites interventions", "hab-emb", [["Forfait petits travaux de peinture et revêtement < 6 m²", "forfait"], ["Forfait petits travaux de remplacement parquets flottants ou collés < 8 m²", "forfait"], ["Forfait petits travaux de remplacement sol souple < 8 m²", "forfait"], ["Forfait petits travaux faïence/carrelage < 5 m²", "forfait"]]),
    ...A("Interventions complémentaires", "hab-tce", [["Intervention pour séchage expressément demandée par la Mutuelle", "forfait"], ["Échafaudage pour travaux en plafond < 5 m (forfait)", "forfait"], ["Plus-value échafaudage pour escalier (forfait)", "forfait"], ["Main-d'œuvre prestation spécifique peinture", "h"], ["Main-d'œuvre prestation spécifique plâtrerie, habillage, isolation", "h"]]),
  ].map((a, i) => ({ id: "a" + (i + 1), ...a, prix: {} }));

  return { gammes, autresPrejudices, nonGarantis, REAL, TVA, UNITS, GRILLES, articles, zones: ["1", "2", "3", "4", "5"] };
})();
if (typeof module !== "undefined") module.exports = IMHData;
