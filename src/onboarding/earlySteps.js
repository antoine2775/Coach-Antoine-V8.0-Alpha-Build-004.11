import { ONBOARDING_STEPS } from "./steps.js";

const indexOf = (id) => ONBOARDING_STEPS.find((step) => step.id === id).index;
const next = (id, fields = {}) => ({
  ok: true,
  changes: { ...fields, onboardingCurrentStep: indexOf(id), onboardingCompleted: false },
});

// Prépare seulement une mise à jour. La persistance reste dans userProfile.js,
// appelée par le contexte ; aucun âge mineur n'est placé dans changes.
export function prepareEarlyStep(action, value) {
  switch (action) {
    case "addressMode":
      return ["tu", "vous"].includes(value)
        ? next("getting-to-know", { addressMode: value }) : { ok: false, error: "choice" };
    case "explanation": return next("sex");
    case "sex":
      return ["female", "male"].includes(value)
        ? next("first-name", { sex: value }) : { ok: false, error: "choice" };
    case "firstName":
      return typeof value === "string" && value.trim()
        ? next("first-name", { firstName: value.trim() }) : { ok: false, error: "firstName" };
    case "confirmFirstName": return next("age");
    case "age": {
      const text = typeof value === "string" ? value.trim() : "";
      const age = Number(text);
      if (!/^\d+$/.test(text) || !Number.isSafeInteger(age) || age <= 0) return { ok: false, error: "age" };
      if (age < 18) return { ...next("age", { age: null }), blocked: true };
      return next("safety", { age });
    }
    case "back":
      return Number.isInteger(value) && value >= 1 && value <= indexOf("safety")
        ? { ok: true, changes: { onboardingCurrentStep: value - 1, onboardingCompleted: false } }
        : { ok: false, error: "step" };
    default: return { ok: false, error: "step" };
  }
}
