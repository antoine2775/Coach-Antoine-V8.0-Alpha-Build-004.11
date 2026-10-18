export const FEEDBACK_KEY = "coachAntoineWorkoutFeedbackV1";
export const FEEDBACK_CATEGORIES = ["pauses", "duration", "difficulty"];
export const FEEDBACK_OPTIONS = {
  pauses: [["short", "Trop courte"], ["long", "Trop longue"]],
  duration: [["short", "Trop courte"], ["long", "Trop longue"]],
  difficulty: [["easy", "Trop facile"], ["hard", "Trop difficile"]],
};

export function validFeedbackChoice(category, value) {
  return FEEDBACK_CATEGORIES.includes(category) && FEEDBACK_OPTIONS[category].some(([choice]) => choice === value);
}

export function isFeedbackComplete(categories, answers) {
  return categories.length > 0 && categories.every((category) => validFeedbackChoice(category, answers[category]));
}

// Compatibilité avec les avis exclusifs des premiers essais locaux.
export function feedbackAnswers(response) {
  return response?.answers ?? (response?.category ? { [response.category]: response.value } : {});
}

function validResponse(response) {
  if (response === null) return true;
  if (!response || typeof response.adapted !== "boolean" || !Number.isFinite(Date.parse(response.date))) return false;
  const answers = feedbackAnswers(response);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const categories = Object.keys(answers);
  return (response.adapted ? categories.length === 0 : isFeedbackComplete(categories, answers)) &&
    (!answers.pauses || Number.isFinite(response.restDuration) && response.restDuration > 0);
}

function read(storage) {
  const raw = storage.getItem(FEEDBACK_KEY);
  if (raw === null) return { version: 1, sinceAsked: 0, lastLevel: null, pendingReason: null, sessions: [] };
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Number.isInteger(data.sinceAsked) || data.sinceAsked < 0 ||
      ![null, "reprise", "forme", "tonique"].includes(data.lastLevel) ||
      !(data.pendingReason === null || typeof data.pendingReason === "string") ||
      !Array.isArray(data.sessions) || data.sessions.some((item) => typeof item?.id !== "string" ||
        typeof item.ask !== "boolean" || !validResponse(item.response))) {
    throw new Error("Invalid feedback data");
  }
  return data;
}

// Point d'entrée pour les futurs événements significatifs. Aucune règle de
// tendance de forme du jour n'est inventée ; aucun niveau n'est modifié.
export function requestAdaptationCheck(storage, reason) {
  if (typeof reason !== "string" || !reason.trim()) return;
  const data = read(storage);
  data.pendingReason = reason;
  storage.setItem(FEEDBACK_KEY, JSON.stringify(data));
}

export function scheduleFeedback(storage, session, config) {
  const data = read(storage);
  const existing = data.sessions.find((item) => item.id === session.id);
  if (existing) return existing;
  const levelChanged = data.lastLevel !== null && session.level !== null && data.lastLevel !== session.level;
  const reason = data.pendingReason || (levelChanged ? "level-change" : null);
  const ask = Boolean(reason) || data.sinceAsked + 1 >= config.FEEDBACK_EVERY_N_SESSIONS;
  const entry = { id: session.id, ask, reason: reason || (ask ? "periodic" : null), response: null };
  data.sessions.push(entry);
  data.sinceAsked = ask ? 0 : data.sinceAsked + 1;
  data.lastLevel = session.level;
  if (ask) data.pendingReason = null;
  storage.setItem(FEEDBACK_KEY, JSON.stringify(data));
  return entry;
}

export function recordFeedback(storage, id, response) {
  const data = read(storage);
  const entry = data.sessions.find((item) => item.id === id);
  if (!entry?.ask) throw new Error("Feedback not scheduled");
  // Un retry réutilise la même réponse et la même durée absolue de pause.
  if (!entry.response) entry.response = response;
  storage.setItem(FEEDBACK_KEY, JSON.stringify(data));
  return entry.response;
}
