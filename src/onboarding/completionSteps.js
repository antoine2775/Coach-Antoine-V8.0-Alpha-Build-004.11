import { validateProfile } from "../utils/userProfile.js";
import { getAssessmentProposal } from "./assessmentSteps.js";

export const EXPERIENCE_OPTIONS = Object.freeze([
  { value: "current", label: "Oui, et encore actuellement." },
  { value: "stopped", label: "Oui, mais j’ai arrêté." },
  { value: "never", label: "Non, jamais." },
].map(Object.freeze));
export const CURRENT_PROGRAM_MISSING_OPTIONS = Object.freeze([
  { value: "personalizedSupport", label: "Un accompagnement plus personnalisé et plus motivant" },
  { value: "adaptedSessions", label: "Des séances mieux adaptées à mon niveau" },
  { value: "variety", label: "Plus de variété" },
  { value: "progressTracking", label: "Un meilleur suivi de mes progrès" },
  { value: "unsure", label: "Je ne sais pas vraiment" },
].map(Object.freeze));
export const STOP_REASON_OPTIONS = Object.freeze([
  { value: "notSupportedOrMotivated", label: "Je ne me sentais pas assez accompagné ni assez motivé" },
  { value: "tooDifficult", label: "C’était trop difficile" },
  { value: "tooLong", label: "Les séances étaient trop longues" },
  { value: "tooRepetitive", label: "C’était trop répétitif" },
  { value: "unsure", label: "Je ne sais pas vraiment" },
].map(Object.freeze));
const includes = (options, value) => options.some((option) => option.value === value);
export function hasCompletionAnswer(profile) {
  if (profile?.previousProgramExperience === "never") return true;
  if (profile?.previousProgramExperience === "current") return includes(CURRENT_PROGRAM_MISSING_OPTIONS, profile.currentProgramMissing);
  if (profile?.previousProgramExperience === "stopped") return includes(STOP_REASON_OPTIONS, profile.previousProgramStopReason);
  return false;
}
// Extensions optionnelles : les profils V1 sans ces champs restent lisibles.
export function getCompletionStage(profile) {
  if (profile.onboardingCurrentStep === 18) return profile.onboardingCompletionStage === "transition" ? "transition" : "experience";
  if (profile.onboardingCurrentStep === 19) return profile.onboardingCompletionStage === "reaction" && hasCompletionAnswer(profile) ? "reaction" : "question";
  return "conclusion";
}
export function canCompleteOnboarding(profile) {
  return Boolean(profile && Number.isInteger(profile.age) && profile.age >= 18 &&
    profile.safetyConfirmed === true && getAssessmentProposal(profile) && hasCompletionAnswer(profile) &&
    validateProfile({ ...profile, onboardingCompleted: true }));
}
export function prepareCompletionStep(profile, action, value) {
  const index = profile?.onboardingCurrentStep;
  if (!profile) return { ok: false };
  const stage = getCompletionStage(profile);
  const patch = (fields) => ({ ok: true, changes: { ...fields, onboardingCompleted: false } });
  if (action === "back") {
    if (index === 18) return patch(stage === "experience"
      ? { onboardingCompletionStage: "transition" }
      : { onboardingCurrentStep: 17, onboardingCompletionStage: null });
    if (index === 19) return patch(stage === "reaction"
      ? { onboardingCompletionStage: "question" }
      : { onboardingCurrentStep: 18, onboardingCompletionStage: "experience" });
    if (index === 20) return patch(profile.previousProgramExperience === "never"
      ? { onboardingCurrentStep: 18, onboardingCompletionStage: "experience" }
      : { onboardingCurrentStep: 19, onboardingCompletionStage: hasCompletionAnswer(profile) ? "reaction" : "question" });
  }
  if (action === "transition" && index === 18 && stage === "transition") {
    return patch({ onboardingCompletionStage: "experience" });
  }
  if (action === "experience" && index === 18 && stage === "experience" && includes(EXPERIENCE_OPTIONS, value)) {
    return patch({ previousProgramExperience: value,
      previousProgramStopReason: value === "stopped" ? profile.previousProgramStopReason : null,
      currentProgramMissing: value === "current" ? profile.currentProgramMissing ?? null : null,
      onboardingCurrentStep: value === "never" ? 20 : 19,
      onboardingCompletionStage: value === "never" ? null : "question" });
  }
  if (action === "answer" && index === 19 && stage === "question") {
    if (profile.previousProgramExperience === "current" && includes(CURRENT_PROGRAM_MISSING_OPTIONS, value)) {
      return patch({ currentProgramMissing: value, onboardingCompletionStage: "reaction" });
    }
    if (profile.previousProgramExperience === "stopped" && includes(STOP_REASON_OPTIONS, value)) {
      return patch({ previousProgramStopReason: value, onboardingCompletionStage: "reaction" });
    }
  }
  if (action === "continue" && index === 19 && stage === "reaction" && hasCompletionAnswer(profile)) {
    return patch({ onboardingCurrentStep: 20, onboardingCompletionStage: null });
  }
  if (action === "finish" && index === 20 && ["now", "later"].includes(value) && canCompleteOnboarding(profile)) {
    return { ok: true, changes: { onboardingCompleted: true }, destination: value === "now" ? "/seances" : "/" };
  }
  return { ok: false };
}
