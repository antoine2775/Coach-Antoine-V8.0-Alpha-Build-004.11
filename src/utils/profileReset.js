import { PROFILE_KEY, readProfile } from "./userProfile.js";
import { DISCOVERY_KEY } from "./exerciseDiscovery.js";

// Réinitialisation explicite du parcours et de la séance en cours uniquement.
// Les historiques de séances terminées et les réglages restent conservés.
export function resetOnboardingProfile(storage) {
  const keys = [PROFILE_KEY, DISCOVERY_KEY, "coachAntoineWorkoutDraftV1", "coachAntoineDayForm"];
  const previous = new Map();
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    for (const key of keys) previous.set(key, storage.getItem(key));
    for (const key of keys) storage.removeItem(key);
    return { status: "reset", profile: null };
  } catch {
    // Restaurer le parcours si une suppression échoue ; ne jamais annoncer un succès partiel.
    for (const [key, value] of previous) {
      try { if (value !== null) storage.setItem(key, value); } catch { /* erreur toujours signalée */ }
    }
    return { status: "unavailable", profile: readProfile(storage).profile };
  }
}
