# Chiffrage IMH

Outil de chiffrage autonome construit à partir des classeurs « CHIFFRAGE DOMMAGES VIERGE <GAMME>.xlsx », des supports de chiffrage IMH 2018 et de la grille de vétusté mobilière 2017. Il remplace la saisie dans les classeurs : on choisit la gamme du contrat, on saisit les lignes, et les plafonds, la vétusté et le récapitulatif de règlement se calculent.

## Utilisation

Ouvrir `imh/index.html` dans un navigateur. Pas d'installation ni de serveur. Les dossiers sont enregistrés dans le navigateur ; « Exporter » les sauvegarde en JSON, « Importer » les recharge.

Onglets : Dossier · Immobilier · Mobilier · Autres préjudices · Aménagements ext. · Non garantis · Récapitulatif · Barème IMH. Les mêmes sections que les feuilles des classeurs.

## Gammes et plafonds repris des classeurs

| Gamme | Vétusté récupérable | Aménagements extérieurs | Bijoux et objets de valeur | Vins |
|---|---|---|---|---|
| Nature (mobil-home) | non | 5 000 €, meubles d'extérieur 1 500 € | 1 000 € | — |
| Indispensable | 25 % | 5 000 € | 5 250 € global | 15 % du capital |
| Confiance | 25 % | 4 000 € | 20 % du capital, 4 000 € au plus (chacun) | 2 000 € |
| Confort | 25 % | 15 000 € + 7 catégories | 21 000 € global | 30 % du capital |
| Performance | 25 % | 8 000 € + 6 catégories | 40 % du capital, 8 000 € au plus (chacun) | 2 000 € |
| Tranquillité | 25 % | 25 000 € + 7 catégories | 25 000 € global | 50 % du capital |

Le détail (matériel professionnel, biens de tiers, piscines, arbres, perte d'électricité…) est dans `src/gammes.js` et s'affiche dans l'onglet Dossier pour la gamme choisie.

## Règles de calcul

- Ligne immobilière : VAN HT = Q × PU ; vétusté = VAN × taux ; VVD = VAN − vétusté ; vétusté récupérable = VAN × min(taux, 25 %) sur les locaux d'habitation (bâtiment TCE et embellissements), pas sur les dépendances ni les clôtures ; TVA sur VVD + récupérable. La pose par le sociétaire est sans TVA.
- Règlement, selon la réalisation :
  - entreprise non agréée : VVD HT en acompte, vétusté récupérable et TVA à réception de la facture (identique au classeur) ;
  - entreprise agréée : tout à réception de la facture ;
  - travaux de l'assuré : VVD (TVA comprise pour les fournitures) en acompte, vétusté récupérable sur justificatifs.
- Nature : réparation du mobil-home limitée à sa valeur d'occasion (saisie sur le dossier), frais d'enlèvement 3 000 €, dépendances 5 000 €. Un plafond réduit les règlements de la rubrique au prorata.
- Mobilier : pas de vétusté avant le seuil d'âge de la gamme (1 an Nature, 2 ans Indispensable et Confiance, 5 ans Confort et Performance sauf informatique 2 ans, à neuf illimité en Tranquillité), puis 10 % par an, 80 % au plus. La vétusté est proposée d'après la date d'achat et la date du sinistre ; un taux saisi la remplace. La grille 2017 (socle, option 5 ans, option illimité) peut être choisie à la place. Bijoux, objets de valeur et vins en valeur d'occasion. Plafonds par catégorie, puis limite du capital mobilier.
- Aménagements extérieurs : VVD TTC par catégorie, dans la limite du plafond.
- Autres préjudices : montant TTC en acompte. Non garantis : pour mémoire.
- Franchise déduite de l'acompte ; si elle est remboursable après recours, elle passe dans la colonne « différé à l'issue du recours ».
- Les dépassements de plafonds sont listés automatiquement (feuille « Dépassement plafonds » des classeurs).

Le test `tests/calc.test.js` vérifie que le dossier 7443 retombe sur les montants du classeur : VAN 5 890,92 €, acompte 4 418,19 €, différé 2 061,82 €, total 6 480,01 €.

## Barème IMH

La liste des articles normalisés des supports IMH 2018 est fournie sans prix. Les prix se saisissent dans l'onglet Barème IMH ou s'importent en CSV :

```
groupe;article;unité;rubrique;zone 1;zone 2;zone 3;zone 4;zone 5
Murs;Peinture mate/satinée;m²;hab-emb;18,50;19,00;19,50;20,00;21,50
```

« Depuis le barème », dans Immobilier, ajoute plusieurs articles d'un coup au prix de la zone du dossier.

## Écarts avec les classeurs

- Travaux de l'assuré : le classeur règle la valeur à neuf (colonne D) ; l'outil règle la VVD et la vétusté récupérable, comme le classeur Nature. À valider.
- Entreprise agréée : la ligne du classeur n'a pas de formule ; l'outil met tout en différé à réception de facture. À valider.
- Le classeur Confiance compte les clôtures réalisées par le sociétaire deux fois (lignes 52 et 53 du récapitulatif) ; l'outil les compte une fois.
- Les plafonds mobiliers ne sont que des libellés dans les classeurs ; l'outil les applique.

## Développement

```
python3 imh/build.py          # assemble imh/src/ en imh/index.html
node imh/tests/calc.test.js   # règles de calcul
node imh/tests/e2e.js         # parcours dans Chromium (Playwright)
```
