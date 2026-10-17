# Onboarding V1 — Lots 4A à 4D

Le lot 4A fournit le conteneur et le garde de navigation. Le lot 4B rend utilisables
les cinq premières étapes : introduction/tu-vous, explication, sexe, prénom et âge.
Le lot 4C ajoute sécurité, matériel, neuf questions et proposition/choix du niveau.
Le lot 4D ajoute expérience, raison facultative d'arrêt, conclusion et finalisation
explicite du profil. Le parcours V1 peut maintenant être terminé depuis l'interface.

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
Les transitions du lot 4C sont préparées dans `assessmentSteps.js`, sans nouvelle
clé de stockage ni modification du module de profil du lot 1.

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

La condition `stopped` détermine le passage par l'étape 19 ; elle est sautée pour
`current` et `never`. Les étapes 0 à 4 utilisent les
composants du registre `EarlySteps.jsx`, les étapes 5 à 17 ceux de `AssessmentSteps.jsx`.
Les étapes 18 à 20 utilisent `CompletionSteps.jsx`. Le bouton Retour de l'étape 18
permet de revoir le niveau. Aucune modification
des séances, durées ou règles de matériel dans la préparation des séances.

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
  et le parcours atteint Sécurité (index 5).
- En dessous de 18 ans, l'écran affiche le blocage, sans bouton Continuer. L'âge
  mineur n'est jamais passé à la persistance : `age` est remis à `null` (y compris
  après correction d'un ancien âge adulte), l'étape reste 4 et la complétion reste
  fausse. Le nombre saisi est également retiré du champ en mémoire. Aucun indicateur
  de blocage supplémentaire n'est stocké. Après rechargement, l'âge est redemandé.
  « Corriger l'âge » permet de rectifier une saisie ; Retour revient au prénom.
- Retour sauvegarde l'index précédent sans effacer les autres réponses. Dans la
  réaction au prénom, Retour rouvre simplement son champ. Sécurité permet de revenir
  à l'âge sans effacer les autres informations.
- Une erreur d'écriture ne produit ni avancée ni réaction de succès. Le blocage
  mineur reste affiché même si la sauvegarde de `age: null` échoue ; l'erreur de
  sauvegarde est alors visible et les données précédentes ne sont pas remplacées.

## Écrans du lot 4C

- Sécurité : le texte provisoire fourni est affiché dans les deux modes d'adresse.
  La case « J’ai lu et je confirme » est obligatoire, le bouton Continuer est sinon
  désactivé et la transition refuse aussi une confirmation autre que `true`.
  Seul `safetyConfirmed: true` est ajouté au profil comme extension JSON compatible
  avec le lot 1. Aucun diagnostic, limitation ou détail médical n'est demandé.
  La case n'est pas présentée comme une décharge. Le texte devra être revu
  juridiquement avant commercialisation. Il n'est pas rendu définitif par ce lot.
- Matériel : `equipment` reste une liste d'équipements sportifs. La sélection est
  sauvegardée immédiatement à l'étape 6, puis Continuer avance à l'introduction.
  Aucun matériel = `[]` ; sélectionner cette option vide les autres choix. Choisir
  un équipement annule « aucun ». Chaise, mur et support ordinaire ne figurent pas
  dans la liste du matériel sportif. Plusieurs équipements sont possibles.
- Introduction : textes explicites tu/vous, incluant « moins de 2 minutes ».
- Questionnaire : une question par écran, chargée exclusivement depuis `questions.js`.
  Ce fichier conserve les textes et points existants et ajoute `textVous` pour chaque
  question ; les réponses à la première personne ou neutres sont communes aux deux
  modes. Pas de remplacement automatique de pronoms, pas de lettres visibles, pas de
  barème dans l'interface. Une barre discrète expose aussi la progression accessible.
- Chaque réponse remplace seulement sa case dans `assessmentAnswers` (toujours neuf
  cases), puis la question suivante devient l'étape persistée. Retour conserve les
  réponses et leur sélection visible. Les démonstrations physiques ne sont pas créées.
- Après Q9, `evaluateLevel.js` calcule le niveau : barème et matrice du lot 3 inchangés,
  notamment 0–11 -> Reprise. Une seule sauvegarde contient les neuf réponses,
  `proposedLevel`, `assessmentDate` ISO et `assessmentVersion: "1"`, avec l'étape 17.
- Une réponse modifiée invalide la proposition précédente, sa date/version et toute
  ancienne acceptation. Après Q9, elle est recalculée. Une proposition incohérente ou
  incomplète n'est ni affichée comme valide ni acceptée silencieusement.
- Proposition : brève apparition en fondu, désactivée si réduction des animations.
  L'acceptation enregistre `selectedLevel = proposedLevel`, `levelOrigin = "coach"`.
  Le choix manuel enregistre `levelOrigin = "manual"`, même si identique au proposé.
  Aucun niveau n'est choisi avant validation explicite. Les deux chemins atteignent
  l'écran Expérience, toujours avec `onboardingCompleted: false`.
- `safetyConfirmed` est une confirmation de parcours, pas une évaluation médicale.
  Le contexte et la persistance du profil restent inchangés. La forme du jour, les
  pauses et l'historique ne sont jamais écrits par ces nouveaux écrans.

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

`node --test tests/*.test.js` couvre les lots 1, 3 et 4A à 4D. Les tests vérifient
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
6. Saisir 18 : âge enregistré et accès à Sécurité, onboarding toujours incomplet.
7. Recharger puis fermer le splash : reprise à l'étape enregistrée, mode d'adresse
   et réponses conservés. L'origine de reprise suit toujours les règles du lot 4A.
8. Recommencer dans une autre fenêtre privée (après fermeture des précédentes) pour
   tester l'autre mode d'adresse. Vérifier aussi une largeur mobile d'environ 390 px.

Les vérifications navigateur effectuées pendant le développement utilisent un
profil fictif sur 5174, jamais celui de l'adresse habituelle. Elles couvrent le
parcours jusqu'à l'écran Âge et la reprise. Les branches d'âge sont aussi testées
automatiquement sans sauvegarder d'âge mineur.

### Test visuel local du lot 4C

Même adresse interactive sur le port 5174. Utiliser une fenêtre privée pour un
nouveau parcours, ou reprendre le profil incomplet des tests précédents. Aucun profil
artificiellement terminé, aucune suppression de données nécessaire.

1. Après les étapes du lot 4B et un âge adulte, vérifier Sécurité : Continuer doit
   être désactivé sans la case, puis permettre le passage après confirmation.
2. Choisir Haltères et Élastiques, recharger, fermer le splash : les choix restent
   cochés à l'étape Matériel. Choisir « Non, pas de matériel » les décoche tous ;
   choisir Barre longue désactive « aucun ». Continuer.
3. Vérifier l'introduction « moins de 2 minutes », puis une seule question par écran,
   sans A/B/C visibles. Le Coach reste présent et la progression est discrète.
4. Répondre à trois questions, recharger puis fermer le splash : le parcours reprend
   à la prochaine question. Retour retrouve la réponse précédente, modifiable.
5. Pour des exemples reproductibles : les neuf premières réponses donnent Tonique ;
   les neuf deuxièmes donnent Forme ; les neuf troisièmes donnent Reprise.
6. Après Q9, recharger sur la proposition : le niveau proposé reste visible sans
   être accepté automatiquement. Retour vers Q9 permet de modifier la réponse :
   après neuf premières réponses, choisir la troisième à Q9 fait passer Tonique à Forme.
7. « Ça me convient » atteint l'écran Expérience. Retour permet de revoir la
   proposition, puis « Je préfère choisir mon niveau » propose les trois niveaux.
   Après choix et validation, même arrivée à l'écran Expérience. Un choix manuel
   identique au proposé garde l'origine manual.
8. Dans le profil, vérifier les neuf valeurs a/b/c, la date, la version, les niveaux
   proposé/sélectionné et l'origine. La complétion doit toujours être fausse.
9. Refaire le parcours dans l'autre mode d'adresse ; les textes doivent suivre ce
   choix, y compris les neuf questions et la proposition.

Les nouveaux tests automatisés exécutent les vrais composants et la persistance sur
un stockage fictif isolé, y compris les échecs d'écriture. Les contrôles visuels des
nouveaux écrans ont aussi utilisé une prévisualisation statique temporaire sur 5175,
avec données fictives uniquement en mémoire et aucun accès à localStorage. Ce serveur
et son onglet ont été arrêtés ; aucun outil de contournement n'est intégré au projet.

## Fin du parcours — lot 4D

`completionSteps.js` prépare les patches ; `completionMessages.js` contient les
textes tu/vous ; `CompletionSteps.jsx` affiche les trois derniers écrans.
Le contexte et `userProfile.js` restent les seuls responsables de la persistance.

- Expérience : `current` et `never` vont directement à la conclusion (20) ; `stopped`
  mène à la raison (19). Aucun nom d'application ni question supplémentaire.
- Les sept raisons ont des valeurs stables : `notSupportedEnough`, `lackOfMotivation`,
  `tooDifficult`, `tooLong`, `tooRepetitive`, `preferNotToSay`, `other`, dans cet ordre.
  « Passer cette question » sauvegarde `null`. Aucun texte libre pour `other`.
- Retour de la conclusion va à 19 si `stopped`, sinon 18. De 19, il revient à 18 ;
  de 18, à la proposition (17). La raison reste présente si l'expérience reste
  `stopped` ; elle est effacée si elle devient `current` ou `never`.
- Ni expérience ni raison ne modifient les niveaux. La conclusion affiche le vrai
  prénom et les textes fournis, sans déduire d'émotion ou de réaction personnalisée.
- La conclusion et ses boutons nécessitent un profil finalisable : validation
  `validateProfile({...profile, onboardingCompleted: true})` du lot 1, âge adulte,
  sécurité confirmée et proposition cohérente avec le questionnaire du lot 4C.
  Un profil incomplet affiche une erreur et Retour, sans finalisation.
- Aucun écran ni rechargement ne termine le profil automatiquement. Seul un clic
  sur l'un des deux choix finaux sauvegarde `onboardingCompleted: true`.
- Un verrou immédiat évite deux soumissions finales. La navigation n'a lieu qu'après
  le résultat `saved` ; un échec conserve le profil incomplet et autorise une tentative.
- « Pas maintenant » ouvre `/`. « Oui, c’est parti ! » ouvre `/seances` avec remplacement
  de la route. Le garde existant autorise alors ces pages. Le montage de Workout
  commence déjà par le choix Petite forme / En forme / Pleine forme : aucune modification
  de `Workout.jsx`, d'App, du contexte ou du moteur de séance n'est nécessaire.
- Après rechargement, le splash reste normal ; à l'accueil, il conduit à l'accueil.
  Une route directe comme `/seances` reste accessible et conserve sa destination.
  L'onboarding ne réapparaît plus pour un profil terminé valide.
- Aucune nouvelle clé localStorage, aucune migration, aucune écriture dans les
  réglages, la forme du jour ou l'historique des séances.

Le texte de conclusion demandé annonce des séances adaptées. Leur adaptation réelle
au niveau et au matériel reste un travail ultérieur : le lot 4D conserve le programme
actuel et n'implémente aucun nouveau moteur, rappel, son ou préférence d'exercice.

### Test visuel local du lot 4D

Ouvrir le serveur local sur le port 5174, chemin habituel `/onboarding`. Utiliser le
profil incomplet du lot 4C, ou un nouveau parcours dans une fenêtre privée. Ne jamais
forcer `onboardingCompleted` dans le stockage. Fermer toutes les fenêtres privées
avant un nouveau cas pour repartir avec un stockage privé indépendant.

1. **current** : choisir « Oui, et je l’utilise encore » ; vérifier l'arrivée directe
   à la conclusion. Recharger et fermer le splash : même conclusion, pas encore
   d'onboarding terminé. Choisir « Pas maintenant » : accueil. Recharger : splash,
   puis accueil sans onboarding.
2. **stopped** : dans un autre parcours privé, choisir « Oui, mais j’ai arrêté ».
   Recharger sur les raisons, vérifier la reprise. Choisir une raison, Retour :
   sélection conservée. Retour encore : expérience. Rechoisir stopped conserve la
   raison ; choisir current ou never l'efface et saute la question. Vérifier aussi
   « Passer cette question » et « Autre raison » sans champ de texte.
3. **never** : choisir « Non, jamais vraiment » : conclusion directe. Retour revient
   à l'expérience. Choisir à nouveau puis « Oui, c’est parti ! » : choix de forme du
   jour avant tout exercice. Aucun démarrage ou enregistrement de séance automatique.
4. **vous** : refaire le parcours en vouvoiement, vérifier expérience, raison et
   conclusion avec le prénom saisi. Les libellés des réponses restent identiques.

Les tests du lot 4D utilisent uniquement un stockage fictif isolé et finalisent via
les vraies transitions et fonctions du profil. Ils couvrent les branches, raisons,
retours, reprises, textes, refus de profil invalide, échec d'écriture, double clic et
navigation après sauvegarde. Les tests de routes vérifient aussi l'accès réel aux
pages d'accueil et de choix de forme après finalisation et relecture.
