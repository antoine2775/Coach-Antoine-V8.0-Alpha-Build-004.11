// Ces informations sont des faits fournis par l'appelant, jamais des déductions
// du minuteur, du nombre de répétitions ou du simple choix d'un exercice.
const calmKinds = ["mobility", "stretching", "cooldown", "breathing"];
const demandingEffort = context => ["sustained", "intense"].includes(context.effort);
const safeDumbbells = context => context.equipment === "dumbbells"
  && context.appropriateSet === true && context.physicalDifficulty === false;
const isFinish = context => context.phase === "sessionEnd";

export const COACH_CONTEXT_RULES = Object.freeze({
  quality: c => c.qualityGuidanceRelevant === true,
  executionConfirmed: c => c.executionQualityConfirmed === true,
  paceConfirmed: c => c.expectedPaceConfirmed === true,
  calmBreathing: c => calmKinds.includes(c.exerciseKind) && !demandingEffort(c),
  sustainedBreathing: c => demandingEffort(c),
  nasalBreathing: c => c.effort === "moderate" && c.controlledExercise === true && c.nasalBreathingAppropriate === true,
  breathingLearning: c => c.breathingGuidanceRelevant === true && !demandingEffort(c),
  beforeSession: c => c.phase === "beforeSession",
  demandingDumbbellsSet: c => c.phase === "afterSet" && safeDumbbells(c) && c.sufficientlyDemanding === true,
  appropriateDumbbellsSet: c => c.phase === "afterSet" && safeDumbbells(c),
  strengthStart: c => c.physicalDifficulty === false && (c.phase === "strengthStart"
    || (c.phase === "firstDumbbellExercise" && c.equipment === "dumbbells")),
  chair: c => c.equipment === "chair",
  finishLow: c => isFinish(c) && c.dayForm === "low",
  finishNormal: c => isFinish(c) && c.dayForm === "normal",
  finishHigh: c => isFinish(c) && c.dayForm === "high",
  finishSatisfactionLong: c => isFinish(c) || c.phase === "cooldown",
  finishSatisfactionShort: c => isFinish(c),
});

export function isPhraseCompatible(phrase, context = {}) {
  return !phrase.contextRule || COACH_CONTEXT_RULES[phrase.contextRule]?.(context) === true;
}
