# Onboarding V1 — Lot 4A

Ce lot fournit un conteneur et un garde de navigation, sans formulaires détaillés.
Il ne permet donc pas encore de terminer un nouvel onboarding depuis l'interface.
Aucun bouton de contournement, profil de test ni complétion automatique n'est ajouté.

## Parcours

- Le splash reste affiché à chaque chargement, avec une salutation neutre.
- Le provider lit le profil pendant le splash, sans écrire de profil vide.
- À la fermeture du splash : profil absent -> conteneur ; profil incomplet -> étape
  mémorisée ; profil terminé -> application et routes habituelles.
- Les routes directes protégées sont remplacées par `/onboarding` si nécessaire.
  Le garde s'applique aussi à l'accueil, au Garage et au laboratoire de présence.
- Le sous-chemin Vite reste géré par le BrowserRouter existant.
- Pour un profil terminé, `/onboarding` redirige vers l'accueil.

Cette protection est une règle de parcours locale, pas un système d'authentification.

## Source de vérité et mises à jour

`UserProfileProvider` expose `profile`, `profileStatus`, `onboarding`, `saveError`,
`reloadProfile()` et `updateUserProfile(changes)` via `useUserProfile()`.
L'état initial est `loading`. La validation et les écritures restent exclusivement
dans `userProfile.js` du lot 1. Une mise à jour n'est annoncée comme réussie que
si ce module renvoie `saved`. En cas d'échec, les données persistées sont relues et
`saveError` est renseigné. Les autres clés localStorage ne sont jamais migrées.

Le conteneur dispose donc du profil déjà saisi et de l'étape sans devoir relire le
stockage. Pour sauvegarder une future étape validée, transmettre ensemble ses champs
et `onboardingCurrentStep` à `updateUserProfile`. Ce lot ne définit pas encore la
validation métier de chaque écran et ne relâche pas la garde de complétion du lot 1.

## Séquence réservée

Les indices de `steps.js` sont persistants et ne doivent pas être réordonnés :

| Index | Identifiant | Rôle futur |
|---|---|---|
| 0 | introduction | Présentation et tu/vous |
| 1 | getting-to-know | Explication du choix du niveau de départ |
| 2 | sex | Sexe déclaré, avant le prénom |
| 3 | first-name | Prénom |
| 4 | age | Âge, accès V1 réservé aux 18 ans et plus |
| 5 | safety | Sécurité et aptitude |
| 6 | equipment | Matériel sportif |
| 7 | assessment-introduction | Introduction au questionnaire |
| 8 à 16 | assessment-q1 à assessment-q9 | Questions du lot 3 |
| 17 | level-proposal | Proposition et choix du niveau |
| 18 | previous-experience | Expérience antérieure |
| 19 | stop-reason | Motif optionnel, si expérience stopped |
| 20 | finish | Première séance maintenant ou plus tard |

La condition `stopped` est une métadonnée ; le futur parcours implémentera le saut
de l'étape 19 lorsqu'elle n'est pas pertinente. Aucune question détaillée, évaluation,
collecte de données ou règle de matériel n'est exécutée par le conteneur actuel.
Le contenu d'une étape est isolé dans `PendingStep`, à remplacer par les futurs
composants d'étape. Pas de modification des séances ou de leurs durées.

## Erreurs et reprise

Les états `invalid`, `unsupported-version`, `unavailable` et `invalid-step`
affichent une explication et un bouton pour relire les données. Aucune suppression
ou réinitialisation n'est proposée. Une étape hors séquence n'est pas ramenée
silencieusement à zéro. Le profil complet conserve la validation existante.

Un profil absent commence à l'index 0 sans écriture. `isResuming` signifie qu'un
parcours commencé lors d'une utilisation précédente est repris : le profil doit
être incomplet et chargé à une étape strictement supérieure à 0. La présence
d'un profil seule ne suffit pas ; l'étape 0 n'est jamais une reprise.

Le provider mémorise cette décision en mémoire à la première lecture exploitable
(`absent` ou `valid`). Une sauvegarde, une mise à jour partielle ou le bouton de
relecture pendant la même utilisation ne change pas cette origine. Si un nouveau
profil est créé puis avancé à l'étape 5, `isResuming` reste faux ; après rechargement
de l'application, ce profil incomplet chargé à l'étape 5 donne vrai. Un parcours
chargé à l'étape 0 reste nouveau pendant cette utilisation, même après progression.
Un parcours réellement repris conserve son origine ; si son étape est ramenée à 0,
`isResuming` vaut néanmoins faux tant que l'étape actuelle reste 0.

La session désigne ici la durée de vie du provider (une ouverture/recharge de
l'application), sans nouveau stockage de session ni indicateur persistant.
Un échec initial de lecture ne fige pas de décision : celle-ci est prise seulement
quand la lecture réussit. Les données et l'étape du profil ne sont jamais modifiées
pour calculer la reprise. La fonction pure `getOnboardingState` interprète par
défaut une lecture de démarrage ; son second argument permet au provider de lui
transmettre la décision mémorisée.

Les clés historiques, poids, son, pauses et mémoire ne décident jamais de l'accès.
La lecture du réglage sonore au démarrage est protégée pour qu'un refus global
de localStorage n'empêche pas d'atteindre l'état d'erreur du profil.

## Contrôles

`node --test tests/*.test.js` couvre les lots 1, 3 et 4A. Les nouveaux tests vérifient
les états, les 21 indices de reprise, les pages protégées et accessibles, le
sous-chemin Vite, le rendu des erreurs, le splash neutre et les mises à jour du
contexte (dont échec de sauvegarde). La reprise est aussi testée pour une étape 0,
un nouveau profil sauvegardé dans la session, une nouvelle utilisation, les
relectures et un échec de sauvegarde. Les rendus React sont testés en mémoire ;
aucun profil réel du navigateur n'est modifié et aucune dépendance n'est installée.

Avant 4B : valider les textes et formulaires, le contrôle 18+, la sécurité, le saut
conditionnel et les conditions exactes de fin. Le lot 4A ne prend aucune nouvelle
décision sur le niveau, le sexe, le matériel ou la personnalisation des séances.
