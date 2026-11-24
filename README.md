# Eureka Chiffrage — version web

Recréation en page web autonome d'Eureka Chiffrage (app Power Apps canvas, v2.7.4.0) : chiffrage des dommages et calcul de l'indemnisation, de la création du dossier à la synthèse.

## Utilisation

Ouvrir `index.html` dans un navigateur. Aucune installation, aucun serveur. Les dossiers sont enregistrés dans le navigateur (localStorage) ; l'export JSON permet de les sauvegarder ou de les transférer.

Parcours : Infos générales → Parties prenantes → Localisations → Estimations → Dommages (prestations, mobilier) → Garanties → Bénéficiaires → Indemnisations → Synthèse.

## Règles de calcul reprises de l'app d'origine

- Ligne de prestation : montant HT = quantité × prix unitaire ; TTC = HT × (1 + TVA) ; vétusté calculée sur le montant du régime fiscal du règlement (HT ou TTC), en % ou en montant saisi (le montant remplace le %).
- Bonification RSE : 1 % des prestations en réparation en nature retenues.
- Vétusté transverse par nature, bascule HT/TTC avec recalcul des lignes et remise à zéro des ventilations concernées.
- Mobilier et biens volés : saisie HT ou TTC, vétusté en % ou en montant, indemnité pécuniaire.
- Indemnisation : regroupement des dommages de l'assuré par objet de risque, nature, détail, mode et bénéficiaire ; vétusté contractuelle récupérable (assiette valeur à neuf ou vétusté déduite) ; indemnité immédiate et différée selon le mode REN / IP ; plafond par ligne et plafond par nature réparti au prorata ; remise, pénalités, franchise.
- Contrôles : franchise obligatoire, indemnités ≤ plafonds, indemnités ≤ dommages, position de l'assuré, ventilation complète des dommages couverts.
- Statuts de l'estimation : brouillon, vérifiée, exportée, communiquée, figée. Toute modification repasse en brouillon ; une estimation exportée est verrouillée et se duplique pour être modifiée.
- Assiette IRSI : somme des montants IRSI des calculs inclus et actifs.

Le moteur est dans `src/calc.js`, sans dépendance au navigateur.

## Import d'un devis ou d'une facture

Dans Dommages, « Importer un devis ou une facture » lit un PDF, un fichier texte / CSV ou un texte collé, repère les lignes chiffrées (désignation, quantité, unité, prix unitaire HT, TVA) et les propose au contrôle avant intégration.

- La lecture se fait dans le navigateur (`src/extract.js`) ; le PDF est lu avec pdf.js, chargé depuis un CDN à la première utilisation.
- Le total des lignes retenues est comparé au total HT du document.
- Une nature est proposée par ligne d'après le référentiel ; mode d'indemnisation, vétusté, pièce et bénéficiaire s'appliquent à tout l'import.
- Les lignes intégrées portent l'origine du document et suivent les mêmes règles de calcul que les prestations saisies à la main.
- Sur la page publiée dans claude.ai, « Analyser avec Claude » lit aussi les scans et les photos. C'est le seul cas où le contenu du document quitte le navigateur.

## Outils de chiffrage

- **Saisie directe** : quantité, prix unitaire et vétusté se modifient dans le tableau des dommages.
- **Chiffrer depuis le bordereau** : recherche dans les prestations, quantités reprises des mesures d'une pièce (sol, murs, plafond, périmètre, plinthes), ajout de plusieurs lignes en une fois.
- **Barèmes de vétusté** : taux par an, franchise et plafond par nature ; la vétusté se propose d'après l'âge de la prestation, ou la date d'achat d'un bien mobilier.
- **Actions sur les lignes** : monter, descendre, dupliquer, réaffecter à un autre tiers ou objet de risque ; modification d'une nature entière (ajustement des prix en %, vétusté, TVA, mode, pièce).
- **Annuler** la dernière action (30 états, aussi par Ctrl+Z).
- **Synthèse** : écart entre montant réclamé et montant chiffré, comparaison des estimations d'un dossier, export Excel à quatre feuilles (CSV en repli hors connexion).

## Ce qui diffère de l'app Power Apps

- Pas de connexion à ProsPecT / Eureka ni à Dataverse : le dossier est créé à la main ou importé en JSON.
- Les référentiels (natures, bordereaux de prix, réparateurs) fournis sont des exemples. Ils se remplacent depuis l'écran Référentiels (import JSON, ou CSV pour un bordereau).
- L'export Excel est un classeur généré dans le navigateur, pas le modèle Excel de l'app d'origine.
- La zone tarifaire se choisit sur le dossier au lieu d'être déduite du département du réparateur.

## Réécriture Angular

La suite du projet est dans [`quintus-web/`](quintus-web/README.md) : même moteur de calcul en TypeScript, écrans en Angular.

## Développement

```
python3 build.py          # assemble src/ en index.html
node tests/calc.test.js      # règles de calcul
node tests/extract.test.js   # lecture des lignes d'un devis
node tests/e2e.js            # parcours complet dans Chromium (Playwright)
node tests/import.e2e.js     # import d'un devis PDF et d'un texte collé
node tests/pro.e2e.js        # saisie directe, bordereau, barèmes, annulation, export
```
