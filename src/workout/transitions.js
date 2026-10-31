export const TRANSITION_SECONDS = 7;

// Paires explicites : aucun changement de position n'est déduit automatiquement.
export const WORKOUT_TRANSITIONS = Object.freeze([
  { from: "marche-active", to: "assis-debout-chaise", message: "sit" },
  { from: "assis-debout-chaise", to: "pompes-mur", message: "wall" },
  { from: "equilibre", to: "extension-jambes-assis", message: "sitDown" },
  { from: "extension-jambes-assis", to: "montees-pointe-pieds", message: "stand" },
].map(Object.freeze));

export function getWorkoutTransition(steps, step) {
  return WORKOUT_TRANSITIONS.find(({ from, to }) => steps[step]?.id === from && steps[step + 1]?.id === to) ?? null;
}
