# Découverte des exercices et remise à zéro — 29 octobre 2026

## Diagnostic avant ce lot

Le contrôleur `src/workout/session.js` ne mémorisait aucun exercice découvert et
n'ouvrait aucune présentation initiale. Il pilotait seulement exercice, récupération,
interruption et fin de séance. `src/pages/Workout.jsx` affichait la consigne courte
`note` / `noteVous` et l'objectif, sans animation d'exercice ni démonstration.
La mémoire `coachAntoineBrainV1` concerne les paroles du Coach, pas les exercices.
Il n'existait donc pas de condition de première découverte à corriger dans ce code.

## Fonctionnement ajouté

- `coachAntoineExerciseDiscoveryV1` contient les identifiants des exercices découverts.
  Une liste absente signifie qu'aucun exercice n'est connu. Une liste illisible est
  signalée, sans remplacement silencieux ni passage automatique à l'exercice.
- Après le choix explicite de la forme du jour, puis à chaque entrée dans un exercice
  inconnu, la consigne existante, l'objectif et l'animation sont affichés automatiquement.
- Le temps d'exercice ne démarre qu'au clic « Commencer l’exercice ». Ce clic mémorise
  l'identifiant ; un exercice déjà connu ne réimpose plus sa présentation automatique.
- Les douze exercices ont un schéma SVG articulé défini dans `exerciseMotions.js`.
  Le même composant `ExerciseAnimation` sert à la présentation et à l'exercice.
  La boucle de démonstration dure six secondes, indépendamment de la durée d'effort ;
  l'utilisateur peut la regarder autant que nécessaire avant de commencer.
- Les instructions réutilisent les textes déjà présents dans `data.js`, sans inventer
  de nouvelles consignes techniques. Les schémas et leur lisibilité doivent être
  validés visuellement, notamment pour les mouvements qui se font en profondeur.
- « Consigne et démo » règle d'abord le temps écoulé, met le chrono en pause et ouvre
  la même présentation. Le chrono ne reprend qu'au clic « Reprendre l’exercice ».
- L'état de consultation est inclus dans le brouillon de séance. Après interruption
  ou rechargement, reprendre la séance ne relance pas le chrono pendant la consultation.
- Les présentations ne comptent ni dans le temps actif ni dans l'historique d'effort.

## Pourquoi un test peut ne pas être celui d'un utilisateur neuf

Supprimer seulement `coachAntoineProfile` ne supprime pas la mémoire de découverte
ni le brouillon. Revenir au début des écrans n'est donc pas une remise à zéro complète.
Le choix « Recommencer pour une autre personne » de l'écran bloquant des mineurs
utilise maintenant `resetOnboardingProfile` : il supprime le profil entier, la mémoire
de découverte, le brouillon et la forme du jour. Le provider revient à l'état absent,
sans reprise, au premier écran. Une erreur empêche d'annoncer la réinitialisation comme
réussie et provoque une tentative de restauration des anciennes données.

L'historique des séances terminées et les réglages existants sont conservés. Ce bouton
réinitialise le parcours et la découverte, pas l'intégralité du stockage du navigateur.

## Navigation vérifiée

« Pas maintenant » finalise le profil et ouvre `/`, sans création de séance.
« Oui, c’est parti ! » ouvre `/seances`, avec choix explicite de la forme du jour.
Le bouton « À BIENTÔT » pointe vers `/` et retire le brouillon terminé, après
l'enregistrement de la séance. Si cet enregistrement a échoué, la sortie est bloquée
pour laisser la possibilité de réessayer ; l'historique ne reçoit aucun doublon.

## Validation

Les anciens tests de chrono et de feedback utilisent désormais une mémoire d'exercices
déjà connus, pour continuer à tester ces fonctions indépendamment de la découverte.
Des tests supplémentaires partent d'un stockage réellement vierge pour vérifier la
présentation initiale, son absence aux utilisations suivantes, la pause, la reprise,
les erreurs de stockage et la réinitialisation. Aucun build de production n'est requis.

## Complément : navigation intégrée, variantes et durée libre

L'accueil général est `Home` sur `/` : « Bonjour… », bouton « Commencer la séance »,
programme du jour et statistiques. La préparation de séance est `Workout` sur
`/seances`. Un parcours navigateur neuf en vouvoiement a confirmé les deux sorties
vers l'accueil général ; le renvoi durable vers `/seances` décrit manuellement n'a
pas été reproduit dans cet essai.

Les tests avec le vrai BrowserRouter, ReactDOM et les effets du provider ont révélé
une concurrence auparavant invisible aux tests unitaires : finaliser le profil peut
rendre immédiatement la route `/onboarding` avec un profil terminé, alors que le
`navigate` de la conclusion est encore en transition. Le `<Navigate>` de cette route
imposait `/`, et pouvait écraser le choix de sortie. Dans le test, c'est le choix
« Oui, c’est parti ! » qui aboutissait à l'accueil, et non le cas inverse signalé.
Le provider conserve désormais la destination explicite en mémoire avant de publier
le profil terminé. Les deux chemins de navigation utilisent cette même destination ;
elle est oubliée après la sortie. Elle n'est pas ajoutée au profil sauvegardé.

La sortie de séance appelait `abandon`, qui remettait immédiatement le contrôleur en
état vierge avant le changement de route : la préparation pouvait ainsi être rendue
pendant la transition. `closeFinished` conserve désormais l'écran terminé, supprime
seulement le brouillon et empêche sa réécriture au démontage. Le lien rejoint `/`
avec remplacement de route et conserve l'historique. La destination `/` n'a pas été
changée : c'était déjà celle de l'accueil général.

`tests/navigation.integration.test.js` parcourt les vrais formulaires, sauvegardes,
provider, routeur et effets, en tu/vous, avec et sans brouillon préexistant. Il
contrôle le contenu de Home, l'absence de préparation/découverte d'exercice, le
profil finalisé, l'absence de création de séance pour « Pas maintenant », puis la
conservation de l'historique après une séance complète et sa fermeture. `jsdom`
est ajouté uniquement comme dépendance de développement ; aucune version de
 dépendance existante n'est changée.

La présentation n'a aucune durée maximale et aucune sortie automatique. Les six
secondes de l'animation désignent uniquement la durée d'un cycle SVG, répété à
l'infini ; elles ne limitent pas la consultation. Les tests attendent une heure
simulée en première découverte puis en revue et vérifient l'absence de fermeture,
de reprise du chrono ou de consommation du temps d'exercice.

La clé de découverte est `exercise.discoveryId` quand il existe, sinon `exercise.id`.
Elle ne contient jamais l'identifiant de séance. Une variante de mouvement, matériel,
position ou consigne technique doit définir un identifiant distinct. Une différence
de durée, répétitions ou intensité conserve l'identité si la technique ne change pas.
Les anciens identifiants simples restent lisibles. Les animations provisoires n'ont
pas été perfectionnées dans ce complément.
