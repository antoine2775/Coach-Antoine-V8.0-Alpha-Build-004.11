import { validateProfile } from "../utils/userProfile.js";
import { getAssessmentProposal } from "./assessmentSteps.js";

export const EXPERIENCE_OPTIONS = Object.freeze([
  { value: "current", label: "Oui, et je l’utilise encore" },
  { value: "stopped", label: "Oui, mais j’ai arrêté" },
  { value: "never", label: "Non, jamais vraiment" },
].map(Object.freeze));

export const STOP_REASON_OPTIONS = Object.freeze([
  { value: "notSupportedEnough", label: "Je ne me sentais pas assez accompagné" },
  { value: "lackOfMotivation", label: "Je manquais de motivation" },
  { value: "tooDifficult", label: "C’était trop difficile" },
  { value: "tooLong", label: "C’était trop long" },
  { value: "tooRepetitive", label: "C’était trop répétitif" },
  { value: "preferNotToSay", label: "Je préfère ne pas répondre" },
  { value: "other", label: "Autre raison" },
].map(Object.freeze));

export function canCompleteOnboarding(profile) {
  return Boolean(profile && Number.isInteger(profile.age) && profile.age >= 18 &&
    profile.safetyConfirmed === true && getAssessmentProposal(profile) &&
    validateProfile({ ...profile, onboardingCompleted: true }));
}

// Patch uniquement : la persistance et sa validation restent celles du Lot 1.
export function prepareCompletionStep(profile, action, value) {
  const index = profile?.onboardingCurrentStep;
  const patch = (fields) => ({ ok: true, changes: { ...fields, onboardingCompleted: false } });
  if (action === "back") {
    if (index === 18 || index === 19) return patch({ onboardingCurrentStep: index - 1 });
    if (index === 20) return patch({ onboardingCurrentStep: profile.previousProgramExperience === "stopped" ? 19 : 18 });
  }
  if (action === "experience" && index === 18 && EXPERIENCE_OPTIONS.some((option) => option.value === value)) {
    return patch({ previousProgramExperience: value,
      previousProgramStopReason: value === "stopped" ? profile.previousProgramStopReason : null,
      onboardingCurrentStep: value === "stopped" ? 19 : 20 });
  }
  if ((action === "reason" || action === "reasonDraft") && index === 19 && profile.previousProgramExperience === "stopped" &&
      (action !== "reasonDraft" || value !== null) &&
      (value === null || STOP_REASON_OPTIONS.some((option) => option.value === value))) {
    return patch({ previousProgramStopReason: value, onboardingCurrentStep: action === "reasonDraft" ? 19 : 20 });
  }
  if (action === "finish" && index === 20 && ["now", "later"].includes(value) && canCompleteOnboarding(profile)) {
    return { ok: true, changes: { onboardingCompleted: true }, destination: value === "now" ? "/seances" : "/" };
  }
  return { ok: false };
}
