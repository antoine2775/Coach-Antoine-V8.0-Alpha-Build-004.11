import { ONBOARDING_STEPS } from "./steps.js";

// Interprète uniquement le résultat de userProfile.js ; ne revalide pas le profil.
// Aucun accès au stockage et aucune écriture/réparation automatique.
// Sans second argument, interprète une lecture au démarrage. Le provider fournit
// ensuite la décision mémorisée pour ne pas confondre sauvegarde et reprise.
export function getOnboardingState(result, resumedOnLoad = true) {
  const { status, profile } = result;
  if (status === "valid") {
    if (profile.onboardingCompleted) return { status: "complete", profile };
    const step = ONBOARDING_STEPS[profile.onboardingCurrentStep];
    if (!step) return { status: "invalid-step", profile };
    return { status: "incomplete", profile, step, isResuming: step.index > 0 && resumedOnLoad };
  }
  if (status === "absent") {
    return { status, profile: null, step: ONBOARDING_STEPS[0], isResuming: false };
  }
  return { status, profile: null };
}
