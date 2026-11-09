# Écoute et validation locale des voix

Depuis la racine du projet :

```powershell
npm run valider-audio
```

Ouvrir **http://127.0.0.1:8787/** dans Edge, Chrome ou Firefox. Arrêter le
serveur avec `Ctrl+C`. Aucun navigateur n'est lancé automatiquement.

Alternative :

```powershell
node scripts/voix/validation/serveur.mjs
```

Si le port est occupé, aucun autre port n'est choisi automatiquement. Un port
explicite est possible : `npm run valider-audio -- --port 8788`. Les décisions
du navigateur sont propres à chaque origine : revenir à la même adresse, au
même port et au même profil de navigateur pour les retrouver.

## Utilisation

1. Le lot 03 est proposé au premier lancement : ses 21 fichiers sont présentés
   dans l'ordre des entrées 21 à 41 de l'inventaire. Aucun fichier n'est marqué
   validé automatiquement, y compris celui réutilisé des essais.
2. Choisir un dialogue dans la liste, puis utiliser le lecteur natif pour lire,
   mettre en pause ou se déplacer dans l'enregistrement. « Réécouter depuis le
   début » relance le même fichier sur une action explicite.
3. Choisir **Validé** ou **À corriger** et, si utile, saisir une remarque précise
   avec le moment du défaut. Les décisions sont modifiables ; une remarque seule
   laisse le dialogue « Non examiné ».
4. Utiliser **Dialogue suivant** ou **Précédent**. Le changement de dialogue ou
   de lot interrompt le lecteur. Aucune lecture n'est démarrée automatiquement.
5. Le récapitulatif indique les trois décomptes pour le lot courant.
6. Cliquer sur **Exporter le bilan JSON**. Le navigateur télécharge un fichier
   `validation-coach-antoine-lot-03-AAAA-MM-JJ.json`, contenant toutes les entrées
   du lot, leurs décisions, remarques, textes, chemins et empreintes SHA-256.
   Transmettre ce fichier à Codex pour demander les corrections précises.

## Persistance et versions

Les décisions et la position dans chaque lot sont enregistrées au fur et à
mesure dans `localStorage`, sous la clé distincte
`coach-antoine-validation-audio.v1`. Aucun profil de l'application n'est lu ou
modifié. Le serveur ne reçoit ni n'enregistre les décisions.

La navigation privée ou l'effacement des données du navigateur peuvent faire
perdre ce stockage : conserver un export. Si le stockage est indisponible,
plein ou illisible, l'outil le signale et permet d'exporter les décisions en
mémoire ; il n'efface pas silencieusement les données illisibles.

Une décision est liée au nom, au texte et aux octets du MP3. Après remplacement
d'un fichier ou changement du texte, recharger la page : l'ancienne validation
ne sera pas appliquée à cette nouvelle version. Le contrôle automatique ne
vaut jamais validation humaine.

## Réutilisation pour les prochains lots

Le menu reprend le découpage de `listerLots()` et les textes de
`selectionnerV1()`, sans copie des dialogues. Les fichiers disponibles sont
repérés à l'ouverture. Après une génération autorisée séparément, recharger la
page et sélectionner le lot voulu. Aucune interface supplémentaire à créer.

Les fichiers absents restent visibles, avec les décisions désactivées. Les
révisions corrigées déjà validées pour « Tu es » et la question de l'âge en
vouvoiement sont sélectionnées explicitement. Les lots 01/02 suivent
l'inventaire historique, qui peut différer des blocs complets actuellement lus
dans l'application ; cet outil n'en modifie pas l'intégration.

## Périmètre et tests

Page autonome, sans React et sans dépendance ajoutée, servie uniquement sur
`127.0.0.1`. Le serveur n'accepte que des consultations GET/HEAD, sert uniquement
les ressources de cet outil et les MP3 autorisés. Les requêtes partielles HTTP
sont prises en charge pour les commandes de recherche du lecteur.

Aucun appel ElevenLabs, aucune synthèse navigateur, aucune génération audio,
aucune modification des MP3, aucune validation ni intégration automatique.

```powershell
node --test tests/validationAudio.test.js
```

Les tests du serveur utilisent une connexion HTTP de boucle locale. Les tests
d'interface utilisent un stockage isolé, sans décision réelle de l'utilisateur.

## Mise à jour des lots et anciens essais

Après une modification du générateur ou du serveur, arrêter le serveur avec
Ctrl+C, puis relancer `npm run valider-audio` et recharger la page à la même
adresse. Node conserve les modules importés en mémoire : recharger uniquement
le navigateur ne suffit pas. Le découpage provient toujours de `listerLots()`.
Les lots 04, 05 et 06 contiennent 21, 20 et 6 fichiers ; 07 est une réserve vide.

Dans le menu, choisir **Anciens essais · 2 fichiers** pour écouter les essais
Escaliers TU R01 et Réaction-expérience TU R01 dans leur dossier d'origine.
Choisir **Validé pour réutilisation**, **À refaire** ou **Non examiné**, ajouter
une remarque puis exporter ce bilan séparément. Les décisions utilisent des
identifiants distincts des lots officiels et ne valent jamais intégration.
Aucun MP3 n'est copié, remplacé ou approuvé automatiquement.

## Corrections Équilibre du lot 04

Choisir **Corrections lot 04 · Équilibre TU/VOUS R02 · à valider** pour écouter
les deux découpes candidates. Le menu **Lot 04** conserve les R01 pour comparaison.
Les décisions des R02 sont indépendantes ; aucune validation R01 n'est héritée.
Le questionnaire de l'application n'est pas modifié.

Les éventuelles nouvelles synthèses R02 des entrées 71 et 73 TU du lot 05 sont
référencées dans **Corrections lot 05 · Présentation et accompagnement TU R02 ·
à valider**. Les fichiers absents restent désactivés. Le lot 05 officiel conserve
les R01 et ses décisions, dont les 18 validations existantes ; les R02 nécessitent
une écoute et une décision distinctes. Redémarrer le serveur après modification
de son code, puis recharger la page sans changer de navigateur ni d'origine.

## Lot 05 finalisé — validation explicite de l'utilisateur

Le lot 05 officiel retient Présentation TU R03 (entrée 71), Accompagnement TU
R02 (entrée 73) et les 18 autres R01 validés. Les anciens MP3 restent sur disque.
Le manifeste `validation-lot05.json` enregistre les 20 approbations humaines
avec leurs SHA-256 et identifiants de décision (liés au texte et au nom).
Il doit être conservé avec la sauvegarde de l'outil.

Au chargement, le serveur n'applique une approbation qu'au fichier exact,
présent et conforme. L'interface importe une seule fois cette confirmation
explicite dans son état local, sans changer les autres lots. Les décisions
ultérieures prises dans le navigateur restent prioritaires lors des rechargements.
Un fichier absent ou modifié ne bénéficie pas de la validation du manifeste.

Après redémarrage du serveur, recharger la même adresse et choisir **Lot 05** :
20 validés, 0 à corriger, 0 non examiné pour le manifeste final approuvé.
Cela n'intègre aucun audio dans les écrans React de Coach Antoine.
