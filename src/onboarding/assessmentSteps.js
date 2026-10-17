import { QUESTIONS, QUESTIONNAIRE_VERSION } from "./questions.js";
import { evaluateLevel } from "./evaluateLevel.js";
import { ONBOARDING_STEPS } from "./steps.js";

export const EQUIPMENT_OPTIONS = Object.freeze([
  { value: "dumbbells", label: "Haltères" },
  { value: "longBar", label: "Barre longue" },
  { value: "resistanceBands", label: "Élastiques de résistance" },
].map(Object.freeze));
export const LEVEL_LABELS = Object.freeze({ reprise: "Reprise", forme: "Forme", tonique: "Tonique" });
const stepIndex = (id) => ONBOARDING_STEPS.find((step) => step.id === id).index;
const questionStart = stepIndex("assessment-q1");
const invalid = (error) => ({ ok: false, error });
const next = (id, fields = {}) => ({ ok: true, changes: {
  ...fields, onboardingCurrentStep: stepIndex(id), onboardingCompleted: false,
} });
const clearedAssessment = () => ({
  proposedLevel: null, selectedLevel: null, levelOrigin: null,
  assessmentDate: null, assessmentVersion: null,
});

export function toggleEquipment(equipment, value, checked) {
  if (value === "none") return [];
  if (!EQUIPMENT_OPTIONS.some((option) => option.value === value)) return null;
  return EQUIPMENT_OPTIONS.filter((option) => option.value === value
    ? checked : equipment.includes(option.value)).map((option) => option.value);
}

// Une proposition enregistrée n'est utilisable que si elle correspond toujours
// aux réponses et à la version actuelles. Aucun niveau par défaut.
export function getAssessmentProposal(profile) {
  try {
    const result = evaluateLevel(profile.assessmentAnswers);
    if (profile.assessmentVersion !== QUESTIONNAIRE_VERSION ||
        !Number.isFinite(Date.parse(profile.assessmentDate)) ||
        profile.proposedLevel !== result.proposedLevel) return null;
    return result;
  } catch { return null; }
}

// Retourne un patch sans l'écrire ; userProfile.js reste le seul stockage.
// Le temps est injectable pour les tests, et n'est utilisé qu'après Q9.
export function prepareAssessmentStep(profile, action, value, date = new Date().toISOString()) {
  if (action === "back") {
    const index = profile.onboardingCurrentStep;
    return Number.isInteger(index) && index >= stepIndex("safety") && index <= stepIndex("previous-experience")
      ? { ok: true, changes: { onboardingCurrentStep: index - 1, onboardingCompleted: false } }
      : invalid("step");
  }
  if (action === "safety") {
    if (!Number.isInteger(profile.age) || profile.age < 18) return invalid("age");
    return value === true ? next("equipment", { safetyConfirmed: true }) : invalid("safety");
  }
  if (profile.safetyConfirmed !== true) return invalid("safety");

  if (action === "equipmentDraft" || action === "equipment") {
    if (!Array.isArray(value) || new Set(value).size !== value.length ||
        !value.every((item) => EQUIPMENT_OPTIONS.some((option) => option.value === item))) return invalid("equipment");
    return next(action === "equipmentDraft" ? "equipment" : "assessment-introduction", { equipment: [...value] });
  }
  if (action === "assessmentIntroduction") return next("assessment-q1");
  if (action === "answer") {
    const index = QUESTIONS.findIndex((question) => question.id === value?.questionId);
    if (index < 0 || profile.onboardingCurrentStep !== questionStart + index ||
        !QUESTIONS[index].answers.some((answer) => answer.value === value.value) ||
        !Array.isArray(profile.assessmentAnswers) || profile.assessmentAnswers.length !== QUESTIONS.length) return invalid("answer");
    const answers = [...profile.assessmentAnswers];
    answers[index] = value.value;
    const fields = { ...clearedAssessment(), assessmentAnswers: answers };
    if (index < QUESTIONS.length - 1) return next(`assessment-q${index + 2}`, fields);
    try {
      const result = evaluateLevel(answers);
      if (!Number.isFinite(Date.parse(date))) return invalid("assessment");
      return next("level-proposal", { ...fields, proposedLevel: result.proposedLevel,
        assessmentDate: date, assessmentVersion: QUESTIONNAIRE_VERSION });
    } catch { return invalid("assessment"); }
  }
  if (action === "acceptCoach" || action === "manualLevel") {
    const proposal = getAssessmentProposal(profile);
    if (!proposal) return invalid("assessment");
    if (action === "manualLevel" && !Object.hasOwn(LEVEL_LABELS, value)) return invalid("level");
    return next("previous-experience", {
      selectedLevel: action === "acceptCoach" ? proposal.proposedLevel : value,
      levelOrigin: action === "acceptCoach" ? "coach" : "manual",
    });
  }
  return invalid("step");
}
