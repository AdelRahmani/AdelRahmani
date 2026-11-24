# Ouvrir Eureka Chiffrage depuis Eureka

Décision : un bouton **« Ouvrir Eureka Chiffrage »** dans le dossier Eureka ouvre l'application dans un nouvel onglet.

## Adresse à appeler

```
https://<adresse d'Eureka Chiffrage>/ouvrir?assignmentNumber=<n° de mission>
```

- `assignmentNumber` : n° de mission Eureka, par exemple `27FP260071606A01`. Les minuscules sont acceptées.
- `env` : accepté pour compatibilité avec l'app Power Apps, mais ignoré. L'environnement (recette, production) est celui où Eureka Chiffrage est déployé.
- L'adresse ne contient ni jeton ni donnée personnelle : l'accès au dossier est vérifié côté serveur, avec la session de l'utilisateur.

Ce sont les mêmes paramètres que l'app Power Apps actuelle (`Param("assignmentNumber")`, `Param("env")`). Le passage de l'une à l'autre (coupure franche ou période de coexistence) n'est pas encore décidé ; garder les mêmes paramètres laisse les deux options ouvertes, sans rien engager.

## Code du bouton côté Eureka (Angular 21)

```ts
openChiffrage(assignmentNumber: string): void {
  const url = new URL('/ouvrir', environment.eurekaChiffrageUrl);
  url.searchParams.set('assignmentNumber', assignmentNumber);
  // Un onglet par mission : un second clic sur la même mission réutilise l'onglet déjà ouvert
  window.open(url.toString(), `eureka-chiffrage-${assignmentNumber}`);
}
```

Eureka Chiffrage n'utilise pas `window.opener` : aucun échange entre les deux onglets n'est nécessaire. Comme les données de chiffrage sont enregistrées dans la base Eureka, Eureka les lit directement au rechargement du dossier.

## Ce que fait Eureka Chiffrage à l'ouverture

1. Vérifie le n° de mission, sinon affiche « Le numéro de mission est absent » ou « … n'est pas un numéro de mission valide ».
2. Demande le dossier de chiffrage de la mission en **un seul appel** (`CaseRepository.openAssignment`).
3. Ouvre l'écran Dommages. L'onglet porte le n° de mission (`27FP260071606A01 · Dommages · Eureka Chiffrage`). La page d'ouverture ne reste pas dans l'historique.

## API attendue côté Eureka

```
POST /api/chiffrage/missions/{assignmentNumber}/ouvrir
200  dossier de chiffrage (créé ou existant)
403  l'utilisateur n'a pas accès à cette mission
404  mission introuvable
```

Exigences, issues des problèmes constatés sur l'app Power Apps :

- **Une seule transaction côté serveur.** Le dossier et son estimation de référence sont créés entièrement ou pas du tout : plus de dossiers incomplets (1,9 % des créations en 2.7.4.0).
- **Idempotent.** Deux clics rapprochés, ou deux onglets, renvoient le même dossier ; aucun doublon. Une contrainte d'unicité sur le n° de mission le garantit. Le journal ProsPecT montre 293 recréations du même dossier avec l'app actuelle.
- **Jamais de suppression à l'ouverture.** Un dossier existant n'est ni supprimé ni recréé. Si des données de la mission ont changé dans Eureka, le dossier de chiffrage les lit directement, car il pointe vers les entités Eureka.
- **Contrôle d'accès** : seuls les utilisateurs habilités sur la mission reçoivent le dossier.

En attendant cette API, l'implémentation navigateur (`BrowserCaseRepository`) retrouve le dossier par son n° de mission, ou crée un dossier vide à compléter.
