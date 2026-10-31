export const HYDRATION_SECONDS = 10;

export function isHydrationBreak(steps, step) {
  return steps[step]?.id === "rotations-buste" && steps[step + 1]?.id === "ouverture-poitrine";
}
