# Onboarding V1 — Lots 4A et 4B

Le lot 4A fournit le conteneur et le garde de navigation. Le lot 4B rend utilisables
les cinq premières étapes : introduction/tu-vous, explication, sexe, prénom et âge.
La suite reste un conteneur : un onboarding ne peut pas encore être terminé depuis
l'interface. Aucun contournement ni complétion automatique n'est ajouté.

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
et `onboardingCurrentStep` à `updateUserProfile`. Le lot 4B prépare ces mises à jour
dans `earlySteps.js`, sans réimplémenter le stockage ni relâcher la garde de
complétion du lot 1. Les écrans n'avancent qu'après une sauvegarde réussie.

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
de l'étape 19 lorsqu'elle n'est pas pertinente. Les étapes 0 à 4 utilisent les
composants séparés du registre `EarlySteps.jsx`. À partir de l'étape 5, `PendingStep`
reste un conteneur : ni validation sécurité, ni questionnaire, ni évaluation, ni
règle de matériel ne sont construits. Pas de modification des séances ou durées.

## Écrans du lot 4B

- Le Coach est visible avec l'avatar existant. Les styles ajoutés sont limités aux
  classes `onboarding-*` : textes de 16 px, champs de 18 px, boutons d'au moins
  52 px de haut et une colonne sur téléphone. Aucun nouvel asset graphique.
- À l'introduction, le choix `tu`/`vous` est enregistré avec l'étape 1.
- L'explication dispose de deux variantes écrites explicitement dans
  `earlyMessages.js` ; le choix d'adresse s'applique aussi aux questions, erreurs,
  réaction au prénom et blocage des mineurs. Pas de remplacement de mots.
- Femme/Homme est demandé avant le prénom et écrit `female`/`male`, sans calcul
  de niveau ni déduction à partir du prénom.
- Le prénom est obligatoire et enregistré après suppression des espaces en début
  et fin. La réaction « Enchanté … » est au masculin car c'est le Coach qui parle.
  Elle reste à l'étape 3 jusqu'au bouton Continuer. Après rechargement à cet endroit,
  le prénom est prérempli et peut être validé à nouveau.
- L'âge est un entier strictement positif. À partir de 18 ans, il est enregistré
  et le parcours atteint le conteneur Sécurité (index 5), sans pouvoir avancer.
- En dessous de 18 ans, l'écran affiche le blocage, sans bouton Continuer. L'âge
  mineur n'est jamais passé à la persistance : `age` est remis à `null` (y compris
  après correction d'un ancien âge adulte), l'étape reste 4 et la complétion reste
  fausse. Le nombre saisi est également retiré du champ en mémoire. Aucun indicateur
  de blocage supplémentaire n'est stocké. Après rechargement, l'âge est redemandé.
  « Corriger l'âge » permet de rectifier une saisie ; Retour revient au prénom.
- Retour sauvegarde l'index précédent sans effacer les autres réponses. Dans la
  réaction au prénom, Retour rouvre simplement son champ. Depuis le conteneur
  Sécurité, seul Retour vers l'âge est disponible ; aucun écran suivant n'est créé.
- Une erreur d'écriture ne produit ni avancée ni réaction de succès. Le blocage
  mineur reste affiché même si la sauvegarde de `age: null` échoue ; l'erreur de
  sauvegarde est alors visible et les données précédentes ne sont pas remplacées.

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

`node --test tests/*.test.js` couvre les lots 1, 3, 4A et 4B. Les tests vérifient
les états, les 21 indices de reprise, les pages protégées et accessibles, le
sous-chemin Vite, le rendu des erreurs, le splash neutre et les mises à jour du
contexte (dont échec de sauvegarde). La reprise est aussi testée pour une étape 0,
un nouveau profil sauvegardé dans la session, une nouvelle utilisation, les
relectures et un échec de sauvegarde. Les rendus React sont testés en mémoire ;
aucun profil réel du navigateur n'est modifié et aucune dépendance n'est installée.

`earlyOnboarding.test.js` exécute les composants des premières étapes et le module
de profil réel sur un stockage isolé : choix d'adresse et sexe, prénom obligatoire
et normalisé, réaction, âge adulte, refus des valeurs invalides, blocage sans
stockage d'âge mineur, Retour, modification, rechargement et erreurs d'écriture.

### Test visuel local du lot 4B

Le serveur de test utilise `http://127.0.0.1:5174/Coach-Antoine-V8.0-Alpha-Build-004.11/`.
Ce port est une origine différente de l'adresse habituelle sur 5173 et ne partage
pas ses données. Si le serveur est arrêté :

```text
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Ouvrir cette adresse dans une fenêtre privée pour un parcours vierge, sans effacer
aucune donnée existante. Ne pas utiliser `localStorage.clear()` ou ajouter de profil
artificiellement terminé. Aucun mécanisme de test n'est intégré à l'application.

1. Fermer le splash avec « C'est parti ! » ; choisir tu ou vous.
2. Lire l'explication, continuer et choisir Femme ou Homme avant le prénom.
3. Soumettre un prénom vide, puis un prénom entouré d'espaces ; vérifier la réaction.
4. Tester Retour et une modification ; les autres réponses doivent rester présentes.
5. À l'âge, saisir 17 : blocage sans Continuer. Après rechargement, saisie de l'âge
   à nouveau ; en inspectant le profil, `age` doit être `null`, jamais 17.
6. Saisir 18 : arrêt au conteneur Sécurité, onboarding toujours incomplet.
7. Recharger puis fermer le splash : reprise à l'étape enregistrée, mode d'adresse
   et réponses conservés. L'origine de reprise suit toujours les règles du lot 4A.
8. Recommencer dans une autre fenêtre privée (après fermeture des précédentes) pour
   tester l'autre mode d'adresse. Vérifier aussi une largeur mobile d'environ 390 px.

Les vérifications navigateur effectuées pendant le développement utilisent un
profil fictif sur 5174, jamais celui de l'adresse habituelle. Elles couvrent le
parcours jusqu'à l'écran Âge et la reprise. Les branches d'âge sont aussi testées
automatiquement sans sauvegarder d'âge mineur.

Avant la suite : valider visuellement ces premiers écrans, puis définir la sécurité,
le saut conditionnel et les conditions exactes de fin. Le lot 4B ne prend aucune
nouvelle décision sur le niveau, le matériel ou la personnalisation des séances.
