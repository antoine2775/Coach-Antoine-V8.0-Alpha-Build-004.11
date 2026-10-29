import { LEVEL_LABELS } from "../onboarding/assessmentSteps.js";
import { formatDuration } from "./workoutHistory.js";

export const DAY_FORM_LABELS = Object.freeze({ low: "Petite forme", normal: "En forme", high: "Pleine forme" });
export const sessionCountLabel = (count) => `${count} séance${count > 1 ? "s" : ""}`;
export const levelLabel = (level) => LEVEL_LABELS[level] || "Niveau non renseigné";
export const dayFormLabel = (form) => DAY_FORM_LABELS[form] || "Forme non renseignée";
export const sessionDurationLabel = (entry) => typeof entry.activeSeconds === "number" && Number.isFinite(entry.activeSeconds) && entry.activeSeconds >= 0
  ? entry.activeSeconds < 60 ? `${Math.floor(entry.activeSeconds)} s` : formatDuration(entry.activeSeconds) : "Durée inconnue";

// Ce filtre concerne uniquement la présentation détaillée, jamais les compteurs.
export function isCompleteSession(entry) {
  return typeof entry.date === "string" && Number.isFinite(Date.parse(entry.date)) &&
    Object.hasOwn(LEVEL_LABELS, entry.level) && Object.hasOwn(DAY_FORM_LABELS, entry.dayForm) &&
    typeof entry.activeSeconds === "number" && Number.isFinite(entry.activeSeconds) && entry.activeSeconds >= 0;
}

export function getRecentForms(history, now = new Date()) {
  const end = now.getTime(), start = end - 28 * 24 * 60 * 60 * 1000;
  const counts = { low: 0, normal: 0, high: 0 };
  let unknown = 0;
  for (const entry of history) {
    const date = Date.parse(entry.date);
    if (date < start || date > end || !Number.isFinite(date)) continue;
    if (Object.hasOwn(counts, entry.dayForm)) counts[entry.dayForm]++;
    else unknown++;
  }
  return { counts, unknown };
}
