// Registre descriptif uniquement : aucun branchement au lecteur ni changement
// des dialogues. Les références pointent vers les textes existants, sans copie.
// Chemins relatifs à public/, compatibles avec le sous-chemin Vite du projet.
// Un chemin prévu ne désigne jamais un MP3 déjà disponible.
// revision concerne le fichier officiel : null si absent ou historique inconnu.
const reference = (fichier, cle) => Object.freeze({ fichier, cle });
const entree = valeur => Object.freeze({ ...valeur,
  referencesTechniques: Object.freeze(valeur.referencesTechniques),
});

export const REGISTRE_VOIX = Object.freeze([
  entree({
    identifiantAudio: "inscription-presentation-coach",
    referencesTechniques: [
      reference("src/components/onboarding/EarlySteps.jsx", "Introduction > h2"),
      reference("src/onboarding/earlyMessages.js", "EARLY_MESSAGES.tu.introduction"),
    ],
    momentUtilisation: "Inscription : présentation initiale avant le choix du mode d’adresse",
    adresse: "commun",
    genre: "hf",
    cheminMp3Officiel: "audio/intro-coach-antoine.mp3",
    cheminMp3Prevu: null,
    revision: null,
    voixProvisoire: null,
    verificationCorrespondance: "a-verifier",
    exceptionHistorique: true,
    precisionHistorique: "Nom et emplacement conservés ; révision non documentée. Le MP3 couvre le bloc de présentation, dont la correspondance exacte reste à vérifier par écoute.",
  }),
  ...[
    ["low", "petite-forme"],
    ["normal", "en-forme"],
    ["high", "pleine-forme"],
  ].map(([cle, contexte]) => entree({
    identifiantAudio: `forme-du-jour-reponse-${contexte}`,
    referencesTechniques: [
      reference("src/utils/personalizedTexts.js", `getPersonalizedTexts().dayFormReply.${cle}`),
    ],
    momentUtilisation: `Nouvelle séance : réponse au choix de forme du jour (${contexte})`,
    adresse: "commun",
    genre: "hf",
    cheminMp3Officiel: null,
    cheminMp3Prevu: `audio/voix/seance/forme-du-jour/forme-du-jour-reponse-${contexte}--commun--hf--r01.mp3`,
    revision: null,
    voixProvisoire: "navigateur",
    verificationCorrespondance: "sans-audio-officiel",
    exceptionHistorique: false,
    precisionHistorique: null,
  })),
]);

// Inventaires utilisables sans navigateur, sans lecture audio et sans écriture.
export function listerVoixSansAudioOfficiel() {
  return REGISTRE_VOIX.filter(entree => entree.cheminMp3Officiel === null);
}

export function listerVoixProvisoires() {
  return REGISTRE_VOIX.filter(entree => entree.voixProvisoire !== null);
}
