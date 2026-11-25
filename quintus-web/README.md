# Quintus web (Eureka Chiffrage en Angular)

Réécriture d'Eureka Chiffrage (app Power Apps canvas `ava_Quintus_Solution`, v2.7.4.0) en application Angular.
Le point de départ est le prototype web à la racine du dépôt : mêmes règles de calcul, même format de données, même design.

## Lancer

```bash
npm install
npm start          # http://localhost:4200
npm test           # règles de calcul (Vitest)
npm run e2e        # build + parcours complet dans Chromium (Playwright requis)
```

## Sinapps

Le chiffrage part vers Sinapps (commande `chiffrerDommages`). `domain/sinapps.ts` anticipe ses refus, et la vérification de l'estimation reste bloquée tant qu'un point n'est pas réglé :
nature et détail obligatoires sur chaque ligne, correspondance avec les natures et détails Sinapps (si le référentiel la porte : champs `sinappsNature` et `sinappsDetail` des natures), TVA parmi les taux acceptés, vétusté au plus égale au montant, justificatif d'un bien volé, objet de risque de l'assuré, même régime fiscal pour tous les chiffrages d'un même bénéficiaire.

La correspondance entre les natures Quintus et celles de Sinapps n'est pas dans la spécification Sinapps (règle RG_CHIFFRAGE_EXP_0030 seulement) : elle doit venir du référentiel réel.

## Déploiement

- Servir les fichiers `.mjs` avec le type `text/javascript` : le lecteur PDF (`pdfjs/pdf.worker.min.mjs`) est refusé par le navigateur sinon.
- Renvoyer `index.html` pour toute adresse inconnue (routes Angular, dont `/ouvrir`).

## Architecture

```
src/app/
  domain/      règles de calcul, sans Angular ni accès réseau : testées seules
  data/        contrats d'accès aux données + implémentation navigateur, référentiels d'exemple
  state/       CaseStore (signaux, annulation) et opérations sur un dossier
  features/    écrans, chargés à la demande
  shared/      formats, pipes, dialogues
```

- **Domaine** : `damages.ts` (prestations, mobilier, index de ligne, IRSI), `compensation.ts` (ventilation, plafonds, totaux, contrôles), `verification.ts` (statuts, assiette IRSI), `rooms.ts`, `obsolescence.ts`. Chaque fonction cite le contrôle Power Fx d'origine quand il y en a un.
- **Données** : les écrans ne voient que `CaseRepository` et `ReferentialRepository`. L'implémentation se choisit dans `app.config.ts` ; aujourd'hui c'est le stockage du navigateur.
- **État** : toute modification passe par `CaseStore.update()`, qui travaille sur une copie du dossier, garde l'état précédent (30 niveaux, Ctrl+Z) puis enregistre. Une erreur métier renvoyée par l'opération annule la modification et s'affiche.
- **Format** : un dossier exporté depuis le prototype s'importe tel quel.

## Avancement

| Écran | État |
|---|---|
| Ouverture depuis le bouton Eureka (`/ouvrir?assignmentNumber=…`), voir [docs/integration-eureka.md](docs/integration-eureka.md) | porté, en attente de l'API Eureka |
| Dossiers (liste, création, import / export JSON, dossier d'exemple) | porté |
| Infos générales | porté |
| Estimations (création, duplication, référence, évaluation, suppression) | porté |
| Dommages : prestations (tableau groupé, saisie directe, ajout / modification avec bordereau, mesures de pièce, barème de vétusté, HT/TTC, vétusté par nature, ordre des lignes) | porté |
| Import d'un devis ou d'une facture, sans IA (PDF texte, fichier texte ou CSV, texte collé ; contrôle du total, nature proposée) | porté |
| Dommages : mobilier | affichage et saisie directe ; fenêtre d'ajout à porter |
| Synthèse (indicateurs, synthèse par tiers, détail, vérification, verrouillage) | porté |
| Parties prenantes, Localisations, Garanties, Bénéficiaires, Indemnisations | à porter : le domaine est prêt et testé |
| Bonification RSE, chiffrage depuis le bordereau, export Excel, comparaison d'estimations, référentiels | à porter depuis le prototype |

## Décisions à prendre avant la mise en production

1. **Pile technique.** Décidé : front Angular 22, back .NET, base SQL. Côté front, il reste à écrire une implémentation HTTP de `CaseRepository` et `ReferentialRepository` qui appelle l'API .NET. Conséquences : reprise des données Dataverse vers SQL, inventaire des flux Power Automate qui lisent Dataverse, et règles de calcul refaites en C# pour que le serveur fasse foi (vérification, envoi Sinapps, gel). Pour que le C# et le TypeScript calculent pareil, il faut des jeux de tests communs.
2. **Authentification.** Entra ID via MSAL Angular, avec les groupes `QuintusBusinessAdmins` / `QuintusSolutionAdmins` existants.
3. **Lien avec Eureka / ProsPecT.** L'app canvas passe par le connecteur personnalisé vers `wa-prospectfrquintusapi-env`. L'app Angular devra appeler cette API directement (CORS et jeton à ouvrir côté API) ou via le futur backend. C'est aussi là que se fera la création du dossier en une transaction côté serveur.
4. **Ouverture depuis Eureka.** Décidé : bouton « Ouvrir Eureka Chiffrage » dans Eureka, nouvel onglet. Voir [docs/integration-eureka.md](docs/integration-eureka.md).
5. **Hébergement et dépôt.** Azure Static Web Apps ou App Service ; dépôt `Quintus` sur ADO avec ses pipelines, plutôt que ce dépôt GitHub.
6. **Passage de Power Apps à Angular.** Pas encore décidé : coupure franche à une date donnée, ou période où les deux applications coexistent. Si les données passent dans la base Eureka, une coexistence impose de synchroniser Dataverse et la base Eureka dans les deux sens pendant toute la période.
