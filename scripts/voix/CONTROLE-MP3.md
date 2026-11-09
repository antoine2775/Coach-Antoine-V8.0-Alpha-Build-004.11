# Contrôle qualité local des MP3 — première version

Ce contrôleur est indépendant de `generer-questionnaire.mjs`. Il ne charge ni
`.env.local` ni clé API, n'utilise aucune API réseau, n'installe rien et n'écrit
aucun fichier. Les MP3 ne sont jamais corrigés, découpés ou supprimés.
Le rapport est envoyé sur la sortie standard, en français ou en JSON.

L'écoute humaine de **tous** les fichiers reste obligatoire. Le code de sortie 0
ne signifie ni « exempt de répétition », ni « prêt à intégrer ».

## Outils déjà disponibles

- Node.js du projet.
- Blender installé localement, avec ses modules Python `aud` et `numpy`.

Blender est cherché dans le PATH puis dans les installations Windows présentes
sous `Program Files/Blender Foundation`. Aucun téléchargement n'est effectué.
On peut sélectionner un exécutable existant avec `--blender` ou la variable
`BLENDER_EXECUTABLE`. Sans décodeur utilisable, chaque entrée est classée
« Anomalie technique ou analyse impossible ».

## Commandes depuis la racine du projet

Un fichier :

```powershell
node scripts/voix/controler-mp3.mjs public/audio/voix/inscription/inscription-question-age--vous--hf--r02.mp3
```

Plusieurs fichiers :

```powershell
node scripts/voix/controler-mp3.mjs public/audio/voix/inscription/inscription-question-sexe--tu--hf--r01.mp3 public/audio/voix/inscription/inscription-question-sexe--tu--hf--r02.mp3
```

Sélection explicite du décodeur déjà installé :

```powershell
node scripts/voix/controler-mp3.mjs --blender "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" public/audio/voix/inscription/inscription-question-age--vous--hf--r02.mp3
```

Rapport JSON, sans créer de fichier : ajouter `--json`.

Pour un dossier : `node scripts/voix/controler-mp3.mjs --dossier CHEMIN`.
Le dossier est lu sans récursion, uniquement pour ses fichiers `.mp3`. Attention :
le dossier d'inscription contient les anciens R01 défectueux conservés ; ils
produiront légitimement des alertes. Préférer une sélection explicite par lot.
Les chemins en double sont dédoublonnés. Aucun joker n'est développé par le script.

### Lot 03 : commande exacte, après sa génération autorisée séparément

Cette commande contrôle uniquement les 21 noms prévus actuellement pour le lot
03 étendu (entrées 21 à 41). Elle ne génère aucun audio. Un fichier absent sera signalé comme impossible à
analyser ; aucun fichier de remplacement ne sera créé.

```powershell
$lot03 = @(
  'inscription-bilan-presentation--tu--hf--r01.mp3'
  'inscription-bilan-presentation--vous--hf--r01.mp3'
  'inscription-bilan-duree--tu--hf--r01.mp3'
  'inscription-bilan-duree--vous--hf--r01.mp3'
  'inscription-bilan-consigne-reponses--tu--hf--r01.mp3'
  'inscription-bilan-consigne-reponses--vous--hf--r01.mp3'
  'inscription-niveau-accord--tu--hf--r01.mp3'
  'inscription-niveau-accord--vous--hf--r01.mp3'
  'inscription-niveau-evolution--tu--hf--r01.mp3'
  'inscription-niveau-evolution--vous--hf--r01.mp3'
  'inscription-niveau-libre-decision--tu--hf--r01.mp3'
  'inscription-niveau-libre-decision--vous--hf--r01.mp3'
  'inscription-recommandation-niveau-reprise--tu--hf--r01.mp3'
  'inscription-recommandation-niveau-reprise--vous--hf--r01.mp3'
  'inscription-description-niveau-reprise--commun--hf--r01.mp3'
  'inscription-niveau-reprise-changement--tu--hf--r01.mp3'
  'inscription-niveau-reprise-changement--vous--hf--r01.mp3'
  'inscription-recommandation-niveau-equilibre--tu--hf--r01.mp3'
  'inscription-recommandation-niveau-equilibre--vous--hf--r01.mp3'
  'inscription-description-niveau-equilibre--tu--hf--r01.mp3'
  'inscription-description-niveau-equilibre--vous--hf--r01.mp3'
)
$fichiersLot03 = $lot03 | ForEach-Object { Join-Path 'public/audio/voix/inscription' $_ }
node scripts/voix/controler-mp3.mjs @fichiersLot03
```

## Lecture du rapport

Trois catégories :

1. **Contrôle technique réussi, aucune répétition suspecte détectée** : aucun
   signalement avec cette méthode ; ce n'est pas une garantie d'absence de défaut.
2. **Répétition suspecte : écoute prioritaire** : meilleur score, deux plages
   temporelles non chevauchantes à comparer à l'écoute. L'outil indique une seule
   paire maximale par fichier, pas toutes les répétitions possibles.
3. **Anomalie technique ou analyse impossible** : fichier absent, vide, invalide,
   tronqué, décodeur indisponible, analyse hors limites ou autre problème signalé.

Codes de sortie : `0` sans alerte, `2` répétition suspecte, `1` anomalie technique,
analyse impossible ou erreur de commande. Une anomalie prime sur une répétition
suspecte dans un lot mixte. Ces codes ne déclenchent aucune génération ni intégration.

## Contrôles techniques

Vérification des en-têtes et des limites de toutes les trames MPEG Layer III,
ID3v1/v2, taille, débit(s), fréquence et canaux ; décodage intégral en mémoire ;
contrôle des échantillons finis, durée, signal extrêmement faible, crête à 0 dBFS
ou au-delà et cohérence entre durée décodée et durée des trames. Les informations
Xing/délai d'encodage expliquent une petite différence entre ces durées.

Les empreintes SHA-256 avant/après signalent un changement concurrent du fichier.
Le contrôleur ne vérifie pas les CRC MPEG et ne garantit pas l'intégrité de tous
les contenus compressés. Une crête à 0 dBFS constitue une alerte de saturation
possible, pas une preuve. Les débits libres et les métadonnées non prises en
charge peuvent conduire à « analyse impossible », sans prouver une corruption.

Pour borner les ressources de cette première version : fichiers de 60 secondes
maximum et délai de 120 secondes pour un appel du décodeur traitant le lot entier.
Au-delà, le contrôle échoue explicitement ; il ne valide pas silencieusement.

## Méthode acoustique reproduite

- Enveloppe RMS par tranches de 10 ms, puissance des canaux en stéréo.
- Fenêtre nominale de 0,90 s, ainsi que 0,90 × 1,15 et 0,90 / 1,15 s.
- Décalage de 50 ms, au moins 55 % de tranches au-dessus de -45 dBFS.
- Interpolation à 64 points, centrage et normalisation ; exclusion des fenêtres
  dont la norme est inférieure à 0,015.
- Corrélation de toutes les paires admissibles, sans chevauchement, séparées d'au
  moins 80 ms ; conservation de la paire de score maximal.
- Alerte à partir de **0,94**, sans arrondir le score avant la décision.

Le seuil est **exploratoire, calibré sur les cas connus et non validé
indépendamment**. Les plages correspondent à des fenêtres acoustiques, pas à des
mots ni à des limites de découpe. Les durées sont exprimées sur l'audio décodé.

Cette méthode ne transcrit aucun mot. Elle peut manquer des répétitions courtes,
différemment accentuées ou éloignées en débit. Elle peut signaler à tort une cadence
semblable ou des répétitions légitimes prévues par le texte. Pour un fichier trop
court ou sans paire exploitable, le rapport affiche explicitement cette limite,
sans prétendre avoir contrôlé les répétitions plus courtes.

## Tests et résultats de référence

```powershell
node --test tests/controleMp3.test.js
```

Les tests utilisent 25 MP3 existants : trois R01 défectueux et les 22 témoins du
diagnostic, qui incluent les trois R02 corrigés. Aucun MP3 de test valide n'est
synthétisé. Des fixtures invalides sont créées uniquement dans un dossier temporaire,
puis retirées. Les tests d'intégration sont explicitement ignorés si Blender est
absent ; les tests de gestion de cette absence restent exécutés.

Résultat local attendu : trois alertes pour les trois R01 connus, aucune pour les
22 témoins. Ce corpus de calibration ne constitue pas une mesure indépendante de
fiabilité. Le témoin complet TU reste proche du seuil (environ 0,934).

Procédure : génération autorisée → contrôle technique → alertes acoustiques →
écoute humaine de tous les fichiers → validation explicite → intégration séparée.
Ne jamais utiliser un score pour décider automatiquement d'une découpe ou d'une
nouvelle tentative payante.
