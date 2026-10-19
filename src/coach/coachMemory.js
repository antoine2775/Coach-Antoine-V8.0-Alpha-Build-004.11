import { PHRASE_CATALOG } from "./phrases.js";
import { LEGACY_PHRASE_IDS, LEGACY_ID_ALIASES } from "./legacyPhraseIds.js";

const K = "coachAntoineBrainV1";
const defaults = () => ({ lastPhraseByCategory: {}, lastPhraseGlobal: "", recentPhraseIds: [], sessionSpeechGroups: {},
  lastVisitAt: null, lastWorkoutAt: null, sessionCount: 0, lastSpokenAt: 0, silenceUntil: 0 });
const knownIds = new Set([...PHRASE_CATALOG.map(p => p.id), ...Object.values(LEGACY_PHRASE_IDS), ...Object.keys(LEGACY_ID_ALIASES)]);
const canonicalId = id => LEGACY_ID_ALIASES[id] || id;
function legacyId(text) {
  if (typeof text !== "string" || !text) return undefined;
  return (Object.hasOwn(LEGACY_PHRASE_IDS, text) ? LEGACY_PHRASE_IDS[text] : undefined) || PHRASE_CATALOG.find(p => [p.tu, p.vous, p.tuFemale, p.vousFemale].includes(text))?.id;
}

// Migration en lecture seule : l'ancien format reste conservé à la sauvegarde.
// L'ordre ancien entre catégories est inconnu ; on protège toutes les dernières
// phrases connues et on place la dernière phrase globale en fin de mémoire.
export function loadCoachMemory() {
  try {
    const value = JSON.parse(localStorage.getItem(K) || "{}");
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const categories = raw.lastPhraseByCategory && typeof raw.lastPhraseByCategory === "object"
      && !Array.isArray(raw.lastPhraseByCategory) ? raw.lastPhraseByCategory : {};
    const recent = Array.isArray(raw.recentPhraseIds)
      ? raw.recentPhraseIds.filter(id => knownIds.has(id)).map(canonicalId)
      : [...new Set([...Object.values(categories), raw.lastPhraseGlobal].map(legacyId).filter(Boolean))];
    const last = legacyId(raw.lastPhraseGlobal);
    if (!Array.isArray(raw.recentPhraseIds) && last) {
      recent.splice(recent.indexOf(last), 1);
      recent.push(last);
    }
    const groups = raw.sessionSpeechGroups && typeof raw.sessionSpeechGroups === "object"
      && !Array.isArray(raw.sessionSpeechGroups) ? raw.sessionSpeechGroups : {};
    return { ...defaults(), ...raw, lastPhraseByCategory: categories, recentPhraseIds: recent, sessionSpeechGroups: groups };
  } catch { return defaults(); }
}
export function saveCoachMemory(memory) {
  try { localStorage.setItem(K, JSON.stringify(memory)); return true; }
  catch { return false; }
}
export function updateCoachMemory(patch) {
  const next = { ...loadCoachMemory(), ...patch };
  saveCoachMemory(next);
  return next;
}
export function rememberPhrase(category, id, text, { now = Date.now(), historyLimit = 40, sessionId, exclusiveGroup } = {}) {
  const memory = loadCoachMemory();
  const sessionKey = typeof sessionId === "string" ? sessionId.trim() : "";
  if (exclusiveGroup && (!sessionKey || hasSessionSpeechGroup(memory, sessionKey, exclusiveGroup))) return false;
  return saveCoachMemory({ ...memory,
    sessionSpeechGroups: exclusiveGroup ? { ...memory.sessionSpeechGroups,
      [sessionKey]: [...(Object.hasOwn(memory.sessionSpeechGroups, sessionKey)
        && Array.isArray(memory.sessionSpeechGroups[sessionKey]) ? memory.sessionSpeechGroups[sessionKey] : []), exclusiveGroup],
    } : memory.sessionSpeechGroups,
    lastPhraseByCategory: { ...memory.lastPhraseByCategory, [category]: text },
    lastPhraseGlobal: text,
    recentPhraseIds: [...memory.recentPhraseIds, id].slice(-Math.max(1, historyLimit)),
    lastSpokenAt: now,
  });
}
export function hasSessionSpeechGroup(memory, sessionId, group) {
  return Object.hasOwn(memory.sessionSpeechGroups, sessionId)
    && Array.isArray(memory.sessionSpeechGroups[sessionId]) && memory.sessionSpeechGroups[sessionId].includes(group);
}
export function markVisit() { updateCoachMemory({ lastVisitAt: new Date().toISOString() }); }
export function markWorkoutComplete() {
  const memory = loadCoachMemory();
  updateCoachMemory({ lastWorkoutAt: new Date().toISOString(), sessionCount: Number(memory.sessionCount || 0) + 1 });
}
export function daysSince(value) {
  if (!value) return null;
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}
export function resetCoachMemory() {
  try { localStorage.removeItem(K); } catch { /* Stockage indisponible. */ }
}
