import { COACH_PHRASE_IDS, PHRASE_CATALOG, renderCoachPhrase } from "./phrases.js";
import { COACH_CATEGORIES as C } from "./categories.js";
import { isPhraseCompatible } from "./phraseContexts.js";
import { daysSince, loadCoachMemory, markVisit, rememberPhrase, updateCoachMemory, hasSessionSpeechGroup } from "./coachMemory.js";

// Réglages initiaux provisoires, ajustables après les essais réels.
// recentWindow compte les dernières interventions, pas les séances écoulées.
export const DEFAULT_COACH_POLICY = Object.freeze({
  frequent: Object.freeze({ probability: 0.65, recentWindow: 3 }),
  occasional: Object.freeze({ probability: 0.35, recentWindow: 8 }),
  rare: Object.freeze({ probability: 0.12, recentWindow: 16 }),
  veryRare: Object.freeze({ probability: 0.04, recentWindow: 32 }),
});
export const DEFAULT_SELECTION_POLICY = Object.freeze({ satisfactionLongRatio: 0.5 });
function ruleFor(phrase, policy) {
  const rule = { ...DEFAULT_COACH_POLICY[phrase.frequency], ...policy?.[phrase.frequency] };
  return { probability: Number.isFinite(rule.probability) ? Math.max(0, Math.min(0.95, rule.probability)) : 0,
    recentWindow: Number.isFinite(rule.recentWindow) ? Math.max(1, Math.floor(rule.recentWindow)) : 1 };
}
export function listPhraseEntries(category, profile) {
  return (COACH_PHRASE_IDS[category] || []).map(id => {
    const phrase = PHRASE_CATALOG.find(p => p.id === id);
    return { ...phrase, text: renderCoachPhrase(phrase, profile) };
  });
}
function frequencyFactor(phrase, selectionPolicy) {
  if (phrase.id !== "finish-satisfaction-long") return 1;
  const ratio = selectionPolicy?.satisfactionLongRatio ?? DEFAULT_SELECTION_POLICY.satisfactionLongRatio;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(0.95, ratio)) : DEFAULT_SELECTION_POLICY.satisfactionLongRatio;
}
function pick(pool, random) {
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}

// La catégorie désigne le contexte général ; les faits explicites du contexte
// filtrent ensuite les phrases sensibles. Aucun déclenchement autonome.
// Seule l'inspection forcée en preview/noWrite contourne ces filtres.
export function getCoachPhrase(category, { profile, context = {}, preview = false, noWrite = false,
  force = false, policy = DEFAULT_COACH_POLICY, selectionPolicy = DEFAULT_SELECTION_POLICY,
  random = Math.random, now = Date.now(), silenceChance = 0, minimumGapMs = 0 } = {}) {
  const entries = listPhraseEntries(category, profile);
  if (!entries.length) return "";
  const inspecting = preview || noWrite;
  const inspectionForced = inspecting && force;
  const memory = loadCoachMemory();
  const sessionId = typeof context.sessionId === "string" ? context.sessionId.trim() : "";
  if (!inspectionForced && (Number(memory.silenceUntil || 0) > now
    || now - Number(memory.lastSpokenAt || 0) < minimumGapMs
    || (silenceChance > 0 && random() < silenceChance))) return "";
  const compatible = entries.filter(entry => entry.text && (inspectionForced || isPhraseCompatible(entry, context)))
    .map(entry => entry.establishedFrequency && context.hydrationHabitEstablished === true
      ? { ...entry, frequency: entry.establishedFrequency } : entry);
  const pool = compatible.filter(entry => inspectionForced || (
    (!entry.exclusiveGroup || (sessionId && !hasSessionSpeechGroup(memory, sessionId, entry.exclusiveGroup)))
    && !memory.recentPhraseIds.slice(-ruleFor(entry, policy).recentWindow).includes(entry.id)));
  if (!pool.length) return "";
  const selected = pick(pool, random);
  if (!selected) return "";
  // Le facteur porte sur la probabilité de parler, même si A est seule candidate
  // (finishFirst, retour au calme, B exclue par la mémoire récente, etc.).
  const probability = ruleFor(selected, policy).probability * frequencyFactor(selected, selectionPolicy);
  if (!inspectionForced && random() >= probability) return "";
  if (!inspecting) {
    const historyLimit = Math.max(...Object.keys(DEFAULT_COACH_POLICY)
      .map(frequency => ruleFor({ frequency }, policy).recentWindow));
    const saved = rememberPhrase(category, selected.id, selected.text,
      { now, historyLimit, sessionId, exclusiveGroup: selected.exclusiveGroup });
    // Sans écriture fiable, impossible de garantir A OU B après réouverture.
    if (selected.exclusiveGroup && !saved) return "";
  }
  return selected.text;
}
export function getWelcomePhrase(options = {}) {
  const memory = loadCoachMemory();
  const days = daysSince(memory.lastVisitAt);
  if (!options.preview && !options.noWrite) markVisit();
  return getCoachPhrase(days !== null && days >= 3 ? C.RETURN : C.WELCOME, options);
}
export function getFinishRitual(options = {}) {
  // Une seule sélection parmi les alternatives, jamais deux interventions.
  const text = getCoachPhrase(C.FINISH_SATISFACTION, options);
  return text ? [text] : [];
}
export function listCoachCategories() { return Object.values(C); }
export function listPhrases(category, profile) { return listPhraseEntries(category, profile).map(p => p.text); }
export function setCoachSilence(ms = 0) { updateCoachMemory({ silenceUntil: Date.now() + Math.max(0, ms) }); }
