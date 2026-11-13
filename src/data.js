/* Référentiels d'exemple et dossier de démonstration.
   Les vraies tables Benefits / Prices / Repairers vivent dans Dataverse et ne sont pas dans le dépôt :
   celles-ci sont des exemples, modifiables et importables depuis l'écran Référentiels. */
(function (root) {
  "use strict";
  const MBV = "Dommages mobiliers et biens volés";
  const b = (l1, l2, synth1, damageREC) => ({ l1, l2, synth1, damageREC });
  const benefits = [
    b("Embellissements", "Peinture", "Embellissements", "Materiel"),
    b("Embellissements", "Revêtements de sols", "Embellissements", "Materiel"),
    b("Embellissements", "Revêtements muraux", "Embellissements", "Materiel"),
    b("Embellissements", "Plafonds", "Embellissements", "Materiel"),
    b("Immobilier", "Maçonnerie", "Bâtiment", "Materiel"),
    b("Immobilier", "Plâtrerie - Isolation", "Bâtiment", "Materiel"),
    b("Immobilier", "Menuiserie", "Bâtiment", "Materiel"),
    b("Immobilier", "Plomberie - Sanitaire", "Bâtiment", "Materiel"),
    b("Immobilier", "Électricité", "Bâtiment", "Materiel"),
    b("Immobilier", "Couverture - Zinguerie", "Bâtiment", "Materiel"),
    b("Mesures conservatoires", "Assèchement", "Divers", "Materiel"),
    b("Mesures conservatoires", "Recherche de fuite", "Divers", "Materiel"),
    b("Mesures conservatoires", "Bâchage - Mise en sécurité", "Divers", "Materiel"),
    b("Frais et pertes", "Relogement", "Dommages Immatériels", "Immateriel"),
    b("Frais et pertes", "Perte de loyers", "Dommages Immatériels", "Immateriel"),
    b("Frais et pertes", "Honoraires", "Dommages Immatériels", "Immateriel"),
    b("Bonification RSE", "N/A", "Divers", "Immateriel"),
    b(MBV, "Mobilier", "Contenu", "Materiel"),
    b(MBV, "Électroménager", "Contenu", "Materiel"),
    b(MBV, "Hi-fi - Vidéo - Informatique", "Contenu", "Materiel"),
    b(MBV, "Vêtements et linge", "Contenu", "Materiel"),
    b(MBV, "Objets de valeur", "Contenu", "Materiel"),
    b(MBV, "Matériel professionnel", "Contenu professionnel", "Materiel"),
  ];

  // Bordereaux : prix unitaire HT par zone (1 à 5), CO2eq en kg, code RSE commun aux prestations équivalentes
  const p = (repairer, l1, l2, name, unit, z1, co2, csr) => ({
    repairer, l1, l2, name, unit, co2, csr,
    prices: [z1, +(z1 * 1.04).toFixed(2), +(z1 * 1.08).toFixed(2), +(z1 * 1.13).toFixed(2), +(z1 * 1.2).toFixed(2)],
  });
  const E = "EUREXO";
  const prices = [
    p(E, "Embellissements", "Peinture", "Peinture acrylique murs, 2 couches", "m²", 18.5, 1.9, "PEI-MUR"),
    p(E, "Embellissements", "Peinture", "Peinture écolabel murs, 2 couches", "m²", 19.8, 1.1, "PEI-MUR"),
    p(E, "Embellissements", "Peinture", "Peinture acrylique plafond, 2 couches", "m²", 21.0, 2.0, "PEI-PLA"),
    p(E, "Embellissements", "Peinture", "Peinture écolabel plafond, 2 couches", "m²", 22.4, 1.2, "PEI-PLA"),
    p(E, "Embellissements", "Peinture", "Lessivage et préparation des supports", "m²", 6.2, 0.2, "PEI-PREP"),
    p(E, "Embellissements", "Peinture", "Peinture boiseries (portes, plinthes)", "ml", 9.4, 0.6, "PEI-BOI"),
    p(E, "Embellissements", "Revêtements de sols", "Dépose de parquet stratifié", "m²", 7.5, 0.3, "SOL-DEP"),
    p(E, "Embellissements", "Revêtements de sols", "Parquet stratifié, fourniture et pose", "m²", 42.0, 6.8, "SOL-PAR"),
    p(E, "Embellissements", "Revêtements de sols", "Parquet réemploi, fourniture et pose", "m²", 46.0, 2.4, "SOL-PAR"),
    p(E, "Embellissements", "Revêtements de sols", "Sol PVC en lés, fourniture et pose", "m²", 31.0, 5.1, "SOL-PVC"),
    p(E, "Embellissements", "Revêtements de sols", "Plinthes médium à peindre", "ml", 11.2, 0.9, "SOL-PLI"),
    p(E, "Embellissements", "Revêtements muraux", "Papier peint intissé, fourniture et pose", "m²", 24.0, 1.4, "MUR-PAP"),
    p(E, "Embellissements", "Revêtements muraux", "Faïence murale 20x20", "m²", 68.0, 9.5, "MUR-FAI"),
    p(E, "Embellissements", "Plafonds", "Faux plafond plaque de plâtre BA13", "m²", 52.0, 7.2, "PLA-BA13"),
    p(E, "Immobilier", "Plâtrerie - Isolation", "Cloison plaque de plâtre 72/48", "m²", 58.0, 8.4, "PLT-CLO"),
    p(E, "Immobilier", "Plâtrerie - Isolation", "Isolant laine de verre 100 mm", "m²", 17.0, 3.9, "PLT-ISO"),
    p(E, "Immobilier", "Plâtrerie - Isolation", "Isolant biosourcé fibre de bois 100 mm", "m²", 21.5, 1.3, "PLT-ISO"),
    p(E, "Immobilier", "Menuiserie", "Bloc-porte intérieur alvéolaire", "U", 245.0, 21.0, "MEN-POR"),
    p(E, "Immobilier", "Plomberie - Sanitaire", "Remplacement flexible et robinet d'arrêt", "U", 86.0, 2.2, "PLB-ROB"),
    p(E, "Immobilier", "Plomberie - Sanitaire", "Remplacement de canalisation cuivre", "ml", 64.0, 4.6, "PLB-CAN"),
    p(E, "Immobilier", "Électricité", "Remplacement prise ou interrupteur", "U", 48.0, 1.1, "ELE-PRI"),
    p(E, "Immobilier", "Électricité", "Vérification de l'installation", "FFT", 180.0, 0.5, "ELE-VER"),
    p(E, "Immobilier", "Couverture - Zinguerie", "Remplacement de tuiles", "m²", 74.0, 12.0, "COU-TUI"),
    p(E, "Mesures conservatoires", "Assèchement", "Déshumidificateur, pose et location 7 jours", "U", 210.0, 14.0, "MC-ASS"),
    p(E, "Mesures conservatoires", "Recherche de fuite", "Recherche de fuite non destructive", "FFT", 320.0, 3.0, "MC-RDF"),
    p(E, "Mesures conservatoires", "Bâchage - Mise en sécurité", "Bâchage de toiture", "m²", 16.0, 2.6, "MC-BAC"),
    p(E, "Frais et pertes", "Relogement", "Nuitée de relogement", "U", 95.0, 0, "FP-REL"),
  ];
  const repairers = [
    { name: E, description: "Bordereau générique" },
    { name: "AUTOREPARATION", description: "Travaux réalisés par l'assuré" },
  ];

  const refs = { benefits, prices, repairers };

  const LISTS = {
    caseTypes: ["DDE", "Incendie", "Vol", "Dommages électriques", "Bris de glace", "Tempête/Neige/Grêle", "Inondation", "Autre sinistre"],
    roles: ["Lésé", "Responsable", "Mise en cause"],
    thirdPartyTypes: ["Propriétaire occupant", "Propriétaire non occupant", "Propriétaire bailleur", "Propriétaire", "Copropriétaire", "Copropriétaire occupant", "Copropriétaire non occupant", "Copropriétaire bailleur", "Locataire", "Locataire meublé", "Locataire non occupant", "Colocataire", "Syndic de copropriété", "Usufruitier", "Nu propriétaire", "Représentant de SCI", "Mandataire ou gérant", "Occupant sous garantie du bâtiment", "Occupant sans garantie du bâtiment", "Sans objet", "Inconnu", "Autre"],
    vat: [0, 2.1, 4, 5.5, 7, 8, 8.5, 10, 19.6, 20],
    units: ["ml", "m²", "m3", "U", "H", "FFT"],
    modes: ["REN", "IP"],
    goodStatus: ["Bien volé", "Réparable", "Non réparable"],
    proofs: ["Biens non justifiés", "Justifiés en existence et valeur", "Justifiés en existence"],
    roomTypes: ["Pièce", "Toit", "Extérieur"],
    openingTypes: ["Porte", "Porte fenêtre", "Baie coulissante", "Fenêtre", "Autre"],
    linkedTypes: { 1: "Réparateur agréé", 2: "Artisan", 3: "Entreprise en délégation de paiement", 4: "Centre de gestion", 5: "Autre" },
    linkedPrefix: { 1: "Ren. - ", 2: "Art. - ", 3: "Ent. DP - ", 4: "CdG. - ", 5: "Autre - " },
    positions: ["Acceptation des dommages", "Acceptation des dommages avec réserves", "Acceptation de l'indemnité", "Acceptation de l'indemnité avec réserves", "En attente position client", "Refus", "Sans objet"],
    guarantees: ["Attentat", "Bris De Glace", "Bris de machine", "Catastrophe Naturelle", "Catastrophe Technologique", "Choc VTM", "Défense Recours", "Dégat Des Eaux", "Divers", "Dommages Electriques", "Effondrement", "Explosion", "Foudre", "Fumée", "Gel", "Incendie", "Inondation", "Perte de Contenu", "Perte d'Eau", "Perte d'Exploitation", "Protection Juridique", "Responsabilité Civile", "Tempête Neige Grèle - Evènements Climatiques", "Transport", "Vandalisme", "Vol"],
  };

  // Dossier fictif pour découvrir l'outil (aucune donnée réelle)
  function demoCase() {
    return {
      id: "demo-case", number: "DEMO-2026-0001", demo: true, type: "DDE", eventDate: "2026-10-02",
      address: "12 rue des Tilleuls, 69003 Lyon", department: "69", zone: 2, irsiEnabled: true,
      comments: "Dossier d'exemple : fuite sur flexible de machine à laver, dommages en cuisine et séjour.",
      expert: "", referenceEstimateId: "demo-est",
      thirdParties: [
        { id: "tp1", name: "Camille Exemple", insured: true, role: "Lésé", type: "Locataire", insurance: "Assureur Démo", contract: "HAB-000123", vat: 10, ceiling: null },
        { id: "tp2", name: "SCI Les Tilleuls", insured: false, role: "Lésé", type: "Propriétaire bailleur", insurance: "Autre Assureur", contract: "PNO-778", vat: 10, ceiling: null },
      ],
      riskObjects: [{ id: "ro1", riskType: "Appartement", address1: "12 rue des Tilleuls", postalCode: "69003", city: "Lyon" }],
      coverages: [{ id: "cov1", policyNumber: "HAB-000123", coverageType: "Dégat Des Eaux", complementary: "", precision: "Contenu et embellissements", insurerLabel: "Assureur Démo", coveredRiskObjects: [] }],
      linkedParties: [{ id: "lp1", type: 1, lastName: "Réno Services", firstName: "" }],
      rooms: [
        { id: "rm1", name: "Cuisine", roomType: "Pièce", length: 3.6, width: 2.8, height: 2.5, surface: null, openings: [{ type: "Porte", width: 0.83, height: 2.04 }, { type: "Fenêtre", width: 1.2, height: 1.25 }] },
        { id: "rm2", name: "Séjour", roomType: "Pièce", length: 5.2, width: 4.1, height: 2.5, surface: null, openings: [{ type: "Porte", width: 0.83, height: 2.04 }, { type: "Baie coulissante", width: 2.4, height: 2.15 }] },
      ],
      estimates: [],
    };
  }

  root.ECData = { refs, LISTS, demoCase };
})(typeof window !== "undefined" ? window : globalThis);
