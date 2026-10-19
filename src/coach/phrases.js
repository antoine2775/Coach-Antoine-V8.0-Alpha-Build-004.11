import { COACH_CATEGORIES as C } from "./categories.js";
import { displayName } from "../utils/displayName.js";

// Catalogue éditorial V1 : ordre de validation, identifiants logiques indépendants
// du mode d'adresse, des accords et des contextes de sélection.
const phrase = (id, frequency, tu, vous = tu, extra = {}) => Object.freeze({ id, frequency, tu, vous, ...extra });
export const PHRASE_CATALOG = Object.freeze([
  phrase("welcome-reunion", "frequent", "Bonjour ! Je suis content de te retrouver.", "Bonjour ! Je suis content de vous retrouver."),
  phrase("welcome-ready", "occasional", "Bonjour ! Prêt pour une bonne séance ?", undefined,
    { tuFemale: "Bonjour ! Prête pour une bonne séance ?", vousFemale: "Bonjour ! Prête pour une bonne séance ?" }),
  phrase("movement-care", "occasional", "On prend son temps… et on privilégie vraiment la qualité du mouvement."),
  phrase("return-pleasure", "occasional", "Tu sais ce que j’aime ?… Te voir revenir pour une nouvelle séance !", "Vous savez ce que j’aime ?… Vous voir revenir pour une nouvelle séance !"),
  phrase("start-gently", "frequent", "On commence tranquillement."),
  phrase("today-pace", "frequent", "On va avancer à ton rythme.", "On va avancer à votre rythme."),
  phrase("quality-first", "frequent", "Prends ton temps… quelques mouvements bien faits, c’est ça qui compte.", "Prenez votre temps… quelques mouvements bien faits, c’est ça qui compte.", { contextRule: "quality" }),
  phrase("slow-movement", "rare", "Un mouvement lent et maîtrisé… c’est bien plus efficace.", undefined, { contextRule: "quality" }),
  phrase("gesture-first", "frequent", "On ne cherche pas la vitesse… ce qui compte, c’est de bien faire le mouvement.", undefined,
    { contextRule: "quality", voiceDirection: Object.freeze({ pauseAfter: "vitesse", emphasis: "bien faire" }) }),
  phrase("encouragement-good", "frequent", "C’est très bien.", undefined, { contextRule: "executionConfirmed" }),
  phrase("encouragement-continue", "frequent", "Continue comme ça.", "Continuez comme ça.", { contextRule: "executionConfirmed" }),
  phrase("keep-pace", "frequent", "Très bien, garde ce rythme.", "Très bien, gardez ce rythme.", { contextRule: "paceConfirmed" }),
  phrase("breathe-calmly", "frequent", "Respire tranquillement.", "Respirez tranquillement.", { contextRule: "calmBreathing" }),
  phrase("breathe-effort", "occasional", "Pense à bien respirer.", "Pensez à bien respirer.", { contextRule: "sustainedBreathing" }),
  phrase("breathe-nose", "occasional", "Si tu peux, respire tranquillement par le nez.", "Si vous pouvez, respirez tranquillement par le nez.", { contextRule: "nasalBreathing" }),
  phrase("breathe-naturally", "rare", "Respire calmement, comme d’habitude… et tu verras, le mouvement viendra naturellement. Ça deviendra une habitude.",
    "Respirez calmement, comme d’habitude… et vous verrez, le mouvement viendra naturellement. Ça deviendra une habitude.", { contextRule: "breathingLearning" }),
  phrase("water-habit", "occasional", "Mets une bouteille d’eau à côté de toi. Tu vas voir, ça va vite devenir une habitude.",
    "Mettez une bouteille d’eau à côté de vous. Vous allez voir, ça va vite devenir une habitude.", { contextRule: "beforeSession", establishedFrequency: "rare" }),
  phrase("dumbbells-feeling", "occasional", "Eh bien… on les sent quand même, à la fin de la série !", undefined, { contextRule: "demandingDumbbellsSet" }),
  phrase("dumbbells-character", "veryRare", "Eh bien dis donc… ces haltères ont du caractère !", undefined, { contextRule: "appropriateDumbbellsSet" }),
  phrase("dumbbells-muscles", "rare", "Ça va réchauffer les muscles, ça !", undefined, { contextRule: "strengthStart" }),
  phrase("chair-discovery", "occasional", "Avec une simple chaise, on peut déjà faire pas mal de choses !", undefined, { contextRule: "chair" }),
  phrase("finish-low", "occasional", "C’était une séance plus légère… mais tu gardes ton rythme d’entraînement, c’est bien.",
    "C’était une séance plus légère… mais vous gardez votre rythme d’entraînement, c’est bien.", { contextRule: "finishLow" }),
  phrase("finish-normal", "occasional", "C’était une bonne séance aujourd’hui, [Prénom] !", undefined, { contextRule: "finishNormal", usesName: true }),
  phrase("finish-high", "occasional", "Une séance un peu soutenue aujourd’hui. Bravo [Prénom] !", undefined, { contextRule: "finishHigh", usesName: true }),
  phrase("finish-satisfaction-long", "occasional", "Le plus dur, c’était de s’y mettre… mais après, on est vraiment content de l’avoir fait !", undefined,
    { contextRule: "finishSatisfactionLong", exclusiveGroup: "finish-satisfaction" }),
  phrase("finish-satisfaction-short", "occasional", "Et voilà… ça valait le coup de s’y mettre !", undefined,
    { contextRule: "finishSatisfactionShort", exclusiveGroup: "finish-satisfaction" }),
]);

export const COACH_PHRASE_IDS = Object.freeze({
  [C.WELCOME]: Object.freeze(["welcome-reunion", "welcome-ready", "movement-care"]),
  [C.RETURN]: Object.freeze(["return-pleasure"]),
  [C.START]: Object.freeze(["start-gently", "today-pace", "quality-first", "slow-movement", "gesture-first"]),
  [C.ENCOURAGEMENT]: Object.freeze(["encouragement-good", "encouragement-continue", "keep-pace", "breathe-calmly", "breathe-effort", "breathe-nose", "breathe-naturally"]),
  [C.WATER]: Object.freeze(["water-habit"]),
  [C.DUMBBELLS]: Object.freeze(["dumbbells-feeling", "dumbbells-character", "dumbbells-muscles"]),
  [C.CHAIR]: Object.freeze(["chair-discovery"]),
  [C.MAXIM]: Object.freeze(["quality-first", "slow-movement", "gesture-first"]),
  // Anciens points d'entrée conservés, avec la même exclusion par séance.
  [C.FINISH_FIRST]: Object.freeze(["finish-satisfaction-long"]),
  [C.FINISH_SECOND]: Object.freeze(["finish-satisfaction-short"]),
  [C.FINISH_DAY_FORM]: Object.freeze(["finish-low", "finish-normal", "finish-high"]),
  [C.FINISH_SATISFACTION]: Object.freeze(["finish-satisfaction-long", "finish-satisfaction-short"]),
});

export function renderCoachPhrase(phrase, profile) {
  const mode = profile?.addressMode === "vous" ? "vous" : "tu";
  const text = (profile?.sex === "female" && phrase[mode + "Female"]) || phrase[mode];
  if (!phrase.usesName) return text;
  const name = displayName(profile?.firstName);
  // Aucun texte de repli inventé : un prénom indisponible autorise le silence.
  return name ? text.replace("[Prénom]", name) : "";
}

// Vue de compatibilité / inspection : les gabarits ne sont pas des interventions.
export const COACH_PHRASES = Object.freeze(Object.fromEntries(
  Object.entries(COACH_PHRASE_IDS).map(([category, ids]) => [category, Object.freeze(
    ids.map(id => PHRASE_CATALOG.find(phrase => phrase.id === id).tu))])
));
