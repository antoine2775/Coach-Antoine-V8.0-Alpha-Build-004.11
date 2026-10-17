# Profil utilisateur — Lot 1

Module : `src/utils/userProfile.js`. Aucun branchement à l'interface, aucune migration,
aucun effet à l'import. Les séances et leurs données restent indépendantes.

## Stockage et API

Clé dédiée : `coachAntoineProfile`. L'objet contient `profileVersion: 1`.
La clé reste stable ; le champ de version permettra de reconnaître un futur schéma.
Une version différente est signalée et n'est jamais migrée ou écrasée dans ce lot.

- `createEmptyProfile()` : nouveau brouillon indépendant, sans écriture.
- `validateProfile(profile)` : validité du schéma et des conditions de complétion.
- `readProfile(storage?)` : `{ status, profile }` ; statuts `absent`, `valid`,
  `invalid`, `unsupported-version`, `unavailable`. `profile` vaut `null` hors succès.
- `saveProfile(profile, storage?)` : sauvegarde complète, résultat `saved` avec
  une copie du profil, ou l'un des statuts d'erreur ci-dessus.
- `updateProfile(changes, storage?)` : fusion au premier niveau, puis validation
  et sauvegarde. Les tableaux fournis remplacent le tableau entier. Les autres
  champs, y compris les extensions JSON, sont conservés. Sur profil absent,
  crée explicitement un brouillon ; sur profil invalide, refuse l'écriture.
- `profileExists(storage?)` : vrai seulement pour un profil valide, même incomplet.
- `isOnboardingCompleted(storage?)` : vrai seulement pour un profil valide déjà
  sauvegardé avec `onboardingCompleted: true`.

Le stockage optionnel permet des tests sans navigateur. Par défaut, accès protégé
à `globalThis.localStorage`. Lectures et écritures refusées/quota atteints donnent
`unavailable`, sans exception à propager. Un JSON vide ou corrompu donne `invalid`.
Une clé absente donne `absent`. Rien n'est réparé, supprimé ou réinitialisé en silence.
Utiliser `readProfile` pour distinguer les erreurs ; les prédicats booléens seuls
ne permettent pas de décider de réinitialiser un profil.

## Champs et valeurs

| Champ | Valeurs / défaut |
|---|---|
| `profileVersion` | Entier `1` |
| `firstName` | Chaîne ; `""` avant saisie |
| `age` | Entier positif ou nul ; `null` avant saisie |
| `sex` | `female`, `male` ; `null` avant saisie |
| `addressMode` | `tu`, `vous` ; `null` avant saisie |
| `equipment` | Liste sans doublons : `dumbbells`, `longBar`, `resistanceBands` ; `[]` = aucun matériel sportif |
| `proposedLevel` | `reprise`, `forme`, `tonique` ; `null` avant évaluation |
| `selectedLevel` | Mêmes valeurs ; `null` avant décision |
| `levelOrigin` | `coach` = proposition acceptée, `manual` = choix explicite ; `null` avant décision |
| `assessmentAnswers` | Tableau ordonné de 9 réponses JSON ; 9 valeurs `null` par défaut |
| `assessmentDate` | Date sous forme de chaîne interprétable, ISO recommandée ; `null` par défaut |
| `assessmentVersion` | Identifiant textuel du questionnaire, par exemple `"1"` ; `null` par défaut |
| `previousProgramExperience` | `current` = utilise encore ; `stopped` = a arrêté ; `never` = jamais vraiment ; `null` par défaut |
| `previousProgramStopReason` | Chaîne optionnelle ; `null` par défaut |
| `onboardingCurrentStep` | Entier >= 0 ; `0` par défaut ; les écrans futurs définiront les étapes |
| `onboardingCompleted` | Booléen, `false` par défaut |

Les champs supplémentaires JSON sont acceptés et conservés. Les valeurs non JSON,
cycles, types incorrects et enums inconnus sont refusés, sans coercition silencieuse.
Les réponses ne sont pas notées ni interprétées : aucun barème n'est créé ici.

## Reprise et fin de l'onboarding

Enregistrer les champs saisis et `onboardingCurrentStep` avec `updateProfile` permet
de relire un brouillon après interruption. Aucune logique d'écran n'est implémentée.
Le module ne passe jamais automatiquement `onboardingCompleted` à `true`.

Garde de complétion conservatrice pour ce lot : prénom non blanc, âge renseigné,
sexe, mode d'adresse, niveau sélectionné, origine, expérience antérieure, niveau
proposé, date/version d'évaluation et neuf réponses non nulles et non vides.
Un équipement vide et une raison d'abandon absente sont valides.
Avec l'origine `coach`, niveau accepté et proposé doivent correspondre ; un autre
choix doit porter l'origine `manual`. La raison d'abandon ne participe à aucun calcul.
Cette garde contrôle la présence et les types, pas la validité métier des réponses
aux neuf questions (questions et barème encore à définir).

La complétion n'est persistée que si `setItem` réussit. Sur échec, l'appelant reçoit
une erreur et l'indicateur stocké n'est pas modifié par le module.
Si un futur parcours permet de terminer sans évaluation après choix manuel, sa
garde devra être adaptée explicitement lors de ce futur lot.

## Identité et indépendance

`sex` est déclaré, jamais déduit du prénom. Il servira aux accords féminins/masculins
et aux futures variantes vocales. En V1, il ne modifie ni niveau, ni exercice,
ni intensité. Le module ne calcule aucun niveau et ne choisit aucun exercice.
`addressMode` sera utilisé avec des variantes de phrases explicites, sans
remplacement automatique de mots.

L'âge peut être stocké avant 18 ans : le blocage V1 réservé aux adultes appartient
au futur onboarding, pas à cette persistance. Aucun filtre d'âge n'est ajouté ici.

Aucune lecture/écriture/migration des clés existantes : `coachAntoineSound`,
`coachAntoineRestDuration`, `coachAntoineDayForm`, `coachAntoineHistory`,
`coachAntoineWeight`, `coachAntoineBrainV1`. La forme du jour et les pauses ne font
pas partie de ce profil. Pas de synchronisation multi-fenêtres dans ce lot.

## Vérification

Sans dépendance supplémentaire : `node --test tests/userProfile.test.js`.
Compilation habituelle : `npm run build` (génère uniquement `dist`, ignoré par Git).
