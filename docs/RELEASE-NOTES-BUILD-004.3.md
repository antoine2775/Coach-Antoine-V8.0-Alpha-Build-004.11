# Coach Antoine V8 — Build 004.3

## Correction

Le Build 004.2 utilisait par erreur `@mui/material` dans `CoachAvatar.jsx`,
alors que cette dépendance n'était pas installée dans le projet.

Build 004.3 supprime totalement cette dépendance du composant CoachAvatar.

## Résultat

- Aucun besoin d'installer Material UI.
- Les trois images originales V6.5 restent inchangées.
- `coach-start.png`
- `coach-active.png`
- `coach-finish.png`
- La page `/presence` doit maintenant fonctionner directement après `npm install`.
