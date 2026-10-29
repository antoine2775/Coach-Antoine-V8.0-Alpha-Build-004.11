// TEMPORAIRE : suppression ciblée pour les tests de développement uniquement.
export const DEVELOPMENT_RESET_KEYS = Object.freeze([
  "coachAntoineProfile",
  "coachAntoineWorkoutDraftV1",
  "coachAntoineHistory",
  "coachAntoineExerciseDiscoveryV1",
  "coachAntoineWorkoutFeedbackV1",
  "coachAntoineBrainV1",
  "coachAntoineRestDuration",
  "coachAntoineDayForm",
  "coachAntoineSound",
  "coachAntoineWeight",
]);

export function resetDevelopmentData({ confirmed = false, storage } = {}) {
  if (confirmed !== true) return { status: "confirmation-required" };
  const previous = new Map();
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    for (const key of DEVELOPMENT_RESET_KEYS) previous.set(key, storage.getItem(key));
    for (const key of DEVELOPMENT_RESET_KEYS) storage.removeItem(key);
    return { status: "reset" };
  } catch {
    // Ne pas annoncer un succès partiel ; restaurer ce qui peut l'être en cas d'échec.
    for (const [key, value] of previous) {
      try { if (value !== null) storage.setItem(key, value); } catch { /* erreur signalée au demandeur */ }
    }
    return { status: "unavailable" };
  }
}
