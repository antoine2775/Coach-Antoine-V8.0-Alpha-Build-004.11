# Préparation audio du questionnaire V1

Le générateur n'est pas importé par l'application. Il lit les dialogues existants,
conserve l'inventaire de 91 textes et sélectionne les 88 textes validés. Il ne
régénère ni l'introduction historique ni le titre « Faisons connaissance. ».

## Simulation locale (mode par défaut)

Depuis la racine du projet :

    node scripts/voix/generer-questionnaire.mjs
    node scripts/voix/generer-questionnaire.mjs --lot 01 --dry-run

Le plan affiche les chemins absolus, textes, paramètres R02, caractères, provision
à 1 crédit/caractère, fichiers existants et empreinte de confirmation. Aucun accès
réseau, chargement de clé ou fichier créé. Les lots 01 et 02 conservent leurs dix
entrées. Le lot 03 couvre les entrées 21 à 41 incluses (21 cibles). Le lot 04 couvre
42–62 (21 cibles), le lot 05 couvre 63–82 (20), le lot 06 couvre 83–88 (6),
et le lot 07 reste en réserve (0). Aucun chevauchement ni lot 08. Le plafond de confirmation
est de 25 cibles par lot ; le plan global reste interdit en production.

La sortie prévue est public/audio/voix/inscription ; --sortie permet de choisir
explicitement un dossier de préparation différent, sans changer les noms r01.
La sortie fait partie de l'empreinte du plan. Aucun branchement du lecteur React
n'est ajouté. Les essais dans essais-audio restent séparés et ne sont pas promus
automatiquement en fichiers officiels R02.

## Production future, uniquement après validation utilisateur

Ne pas exécuter pendant la préparation. Pour un seul lot, il faudra reprendre
l'empreinte accordPaiement de sa simulation exacte, puis utiliser --generer avec
--lot, --accord-paiement et --accepter-direction-experimentale. Un changement de
texte, de paramètres, de chemin ou d'existence des fichiers invalide le plan.
Un plan global ne peut pas être généré en une commande.

Les fichiers existants bloquent le lot avant tout appel réseau. Il n'existe aucune
option d'écrasement : une éventuelle substitution doit faire l'objet d'une décision
séparée. Les sorties sont réservées avec ouverture exclusive avant connexion.
En cas d'échec, les fichiers terminés sont conservés ; les réservations inachevées
sont retirées. Aucune reprise automatique : après une erreur réseau ou disque,
vérifier l'historique fournisseur et le disque avant une nouvelle autorisation.

Les seules requêtes réelles, après confirmation, vérifieront la voix par nom ET
empreinte historique, le modèle exact eleven_v4, le français et les réglages
50 % / 75 %. Tout désaccord bloque la production sans modèle de remplacement.
Le plan local ne certifie pas la disponibilité actuelle des identifiants API.

## Secrets et tests

La clé ELEVENLABS_API_KEY est lue uniquement dans .env.local ; aucun repli sur une
variable publique VITE_ ou une clé passée en argument. Avant production, le script
vérifie que .env.local est ignoré et non suivi par Git. La règle portable du .gitignore
partagé protège les fichiers .env et .env.* à la racine et dans les sous-dossiers
(exception .env.example sans secret). Aucun secret n'est journalisé.

    node --test tests/generationQuestionnaire.test.js

Les tests de production utilisent un fournisseur factice et un stockage en
mémoire : aucun appel ElevenLabs et aucun MP3 généré sur disque.


## Prévisualisation du lot 03 étendu, sans API ni copie

    node scripts/voix/generer-questionnaire.mjs --lot 03 --dry-run

La sortie JSON affiche les 21 numéros d'inventaire, textes exacts, variantes,
noms, chemins cibles, existence des destinations et action prévue. L'inventaire
historique des 88 entrées reste inchangé ; seul le découpage des lots futurs est
adapté. L'ordre des fichiers du plan n'est pas une consigne d'ordre de lecture UI.

- 20 fichiers portent l'action synthetiser ; provision de 3 603 crédits à
  1 crédit par caractère transmis (hypothèse, pas un coût fournisseur garanti).
- L'entrée 35 porte l'action reutiliser et coûte zéro crédit de synthèse. Source :
  essais-audio/coach-antoine-questionnaire/inscription-description-niveau-reprise--commun--hf--r01.mp3.
- Cette source a été validée à l'écoute par l'utilisateur et contrôlée avec
  controler-mp3.mjs : code 0, 6,40 s, 103 278 octets, mono 44,1 kHz / 128 kbit/s.
  Son empreinte SHA-256 est figée dans REUTILISATION_REPRISE : la prévisualisation
  vérifie les mêmes octets. Elle ne relance pas Blender à chaque affichage.
- Une source absente ou différente bloque le plan. Aucun repli vers une nouvelle
  synthèse n'est autorisé. La destination existante bloque aussi tout écrasement.
- La simulation ne copie rien et ne produit aucun audio. Après autorisation de
  production distincte, le générateur réserverait les 21 cibles, relirait la source
  avant tout accès réseau, effectuerait uniquement 20 synthèses et recopierait
  exactement le MP3 validé à la destination. Le fichier d'essai resterait intact.

Le nombre caracteresDialogues comprend les textes des 21 cibles. Les champs
caracteresInstructions, caracteresSeparateurs, caracteresTransmis et creditsEstimes
ne concernent que les 20 nouvelles synthèses. Pour la réutilisation, texteEnvoye
est null et caracteresTransmis vaut 0. L'empreinte de confirmation lie le plan,
les destinations et l'empreinte du fichier réutilisé.

Le code source de l'application n'est pas modifié et aucun lecteur n'est branché
par cette préparation. Les paramètres de voix, modèle, langue et direction R02
restent identiques aux lots précédents.

## Lot 05 — préparation validée, production soumise à autorisation

Le lot 05 conserve les entrées 63 à 82 : 20 cibles, 19 synthèses et la
réutilisation de Réaction-expérience TU R01 (entrée 81). Le fichier d'essai
reste intact ; sa copie est réservée à la production explicitement autorisée.
L'empreinte SHA-256 attendue est :
`0e412dcf1b6a167713fb21d234f7ca5db240aff3fa08bbb69d2ec8c097162d70`.
Aucune synthèse de remplacement n'est autorisée si la source manque ou change.

Simulation locale sans appel API ni copie :

```powershell
node scripts/voix/generer-questionnaire.mjs --lot 05 --dry-run
```

Attendus : 20 cibles, 19 synthèses, 1 réutilisation conforme, aucun blocage,
provision de 3 178 crédits (1 411 caractères de dialogue + 1 748 d'instructions
+ 19 espaces). Les formulations 71/72 sont conservées sans modification.
Avant toute production autorisée : confirmer voix/modèle/réglages, solde et
budget, puis refaire le plan exact et vérifier toutes les destinations.

Après production : vérifier les 20 fichiers, l'égalité SHA-256 source/copie
pour l'entrée 81, puis lancer le contrôleur local sur les 20 cibles du lot.
Recharger l'interface de validation sur la même origine et choisir le lot 05.
L'approbation de l'essai reste distincte de la validation du fichier officiel.
Aucune intégration dans l'application et aucune correction payante automatique.

## Corrections ciblées du lot 05 — préparation R02

Mode fermé aux entrées 71 et 73 TU uniquement, sans changement des dialogues,
paramètres ou lots normaux :

```powershell
node scripts/voix/generer-questionnaire.mjs --lot 05 --corrections-r02 --dry-run
```

Deux cibles R02 distinctes des R01, deux synthèses au maximum sans relance,
346 caractères transmis et provision prudente de 346 crédits. Une destination
existante bloque toute production. Une confirmation de paiement du lot normal
ne vaut pas confirmation du plan de correction. Toute production reste soumise
à une nouvelle autorisation explicite après validation de cette adaptation.

Après production autorisée, contrôler les deux R02 avec le contrôleur local,
puis redémarrer le serveur de validation et recharger la même adresse. Le menu
« Corrections lot 05 » présente les R02 ; le lot 05 conserve ses R01 et ses
propres décisions. Aucune intégration dans l'application ni validation automatique.
