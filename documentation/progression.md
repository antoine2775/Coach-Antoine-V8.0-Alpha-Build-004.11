# Progression — historique et compatibilité

La page conserve les trois statistiques d'activité existantes et supprime le bloc
poids. La clé historique `coachAntoineWeight` n'est ni lue par la page ni supprimée.
Aucun indicateur de remplacement n'est ajouté.

## Périodes de niveau

Le profil V1 accepte l'extension optionnelle `levelHistory` :

```json
[
  { "level": "reprise", "startedAt": "2026-11-03T12:00:00Z" },
  { "level": "forme", "startedAt": "2026-12-16T12:00:00Z" },
  { "level": "reprise", "startedAt": "2027-02-04T12:00:00Z" }
]
```

Le niveau initial est daté lors de la finalisation de l'onboarding. Chaque changement
validé du niveau choisi ajoute une période. Valider le même niveau ou modifier le
matériel/le mode d'adresse n'ajoute aucune période. Un retour à un ancien niveau est
un nouveau changement, sans jugement ni notion de régression.

L'historique et le niveau sont écrits ensemble dans `coachAntoineProfile`, avec la
validation et les règles d'échec existantes. La version du profil et les valeurs
techniques reprise/forme/tonique sont conservées ; forme s'affiche Équilibré.

Un ancien profil sans historique reste valide. La lecture affiche son niveau actuel
sans l’afficher dans la liste tant que sa date de début est inconnue, sans écrire ni
utiliser la date du questionnaire comme date de début supposée. À son prochain changement réel, cette période ancienne
sans date et le nouveau changement daté sont persistés. Les anciens changements qui
n'ont jamais été enregistrés ne sont pas reconstitués.

## Séances terminées

Les nouveaux enregistrements de `coachAntoineHistory` conservent également `level`,
pris dans la séance au choix de la forme du jour. Ce niveau reste celui utilisé même
si le profil change ensuite. `activeSeconds` garde son calcul existant : temps réel
d'exercice, hors démonstrations, pauses et récupérations.

Les anciens historiques et brouillons restent lisibles sans migration. Une séance
sans date exploitable, niveau connu, forme connue ou temps mesuré est masquée dans
l’historique récent. Les données disponibles continuent d’alimenter les compteurs et
la répartition des formes. Le niveau actuel du profil ne sert jamais à reconstituer
celui d’une ancienne séance.
Les entrées existantes ne sont pas réécrites lors de l'affichage.

## Quatre dernières semaines

La répartition utilise les séances datées entre maintenant moins 28 jours et maintenant,
bornes incluses, en excluant les dates futures. Il s'agit d'une fenêtre glissante,
indépendante du mois civil. Chaque forme a le même traitement visuel, y compris Petite
forme. Une forme inconnue n'est attribuée à aucune catégorie et son absence est signalée.
Aucun score, moyenne, pourcentage, objectif ou indicateur supplémentaire n'est calculé.

## Validation

`tests/progression.test.js` vérifie les statistiques, les bornes temporelles, le pluriel,
les périodes de niveau, les retours, la persistance, les données anciennes, les erreurs
d'écriture et le rendu tu/vous. Les tests de profil et réglages continuent de vérifier
la conservation des autres champs et clés. À vérifier visuellement : lecture des listes
et retours à la ligne sur PC, iPhone et iPad.

## Présentation finale validée pour implémentation

La liste des séances individuelles (« Historique récent ») est retirée de la page.
Les données de ces séances, les statistiques d'activité et la répartition des formes
restent conservées et calculées comme auparavant.

Le titre de l'historique est « Historique de tes niveaux » ou « Historique de vos
niveaux », obtenu par le mécanisme de textes personnalisés existant. Seules les
périodes datées sont affichées, avec « depuis le » suivi de la date de début. Rester
longtemps au même niveau ne produit aucune nouvelle entrée ni appréciation négative.

L'affichage commence par les trois périodes datées les plus récentes, dans l'ordre
décroissant des dates. Au-delà de trois périodes, « Voir tout l’historique » déplie
la liste et « Réduire l’historique » la replie. Cette limite est uniquement visuelle :
tout l'historique reste persisté. Les rubriques vides et les catégories de forme à
zéro restent entièrement masquées. Aucun score ni niveau jamais utilisé n'est ajouté.
