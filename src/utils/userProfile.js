import { validLevelHistory, recordLevelChange } from "./levelHistory.js";

export const PROFILE_KEY = "coachAntoineProfile";
export const PROFILE_VERSION = 1;

const LEVELS = ["reprise", "forme", "tonique"];
const EQUIPMENT = ["dumbbells", "longBar", "resistanceBands"];
const EXPERIENCES = ["current", "stopped", "never"];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const optionalChoice = (value, choices) => value === null || choices.includes(value);
const optionalString = (value) => value === null || typeof value === "string";

export function createEmptyProfile() {
  return {
    profileVersion: PROFILE_VERSION,
    firstName: "",
    age: null,
    sex: null,
    addressMode: null,
    equipment: [],
    equipmentSelectionMade: false,
    proposedLevel: null,
    selectedLevel: null,
    levelOrigin: null,
    assessmentAnswers: Array(9).fill(null),
    assessmentDate: null,
    assessmentVersion: null,
    previousProgramExperience: null,
    previousProgramStopReason: null,
    onboardingCurrentStep: 0,
    onboardingCompleted: false,
  };
}

// Refuse les cycles et les valeurs que JSON supprimerait ou transformerait.
function isJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value).every((item) => isJsonValue(item, ancestors))
    : Reflect.ownKeys(value).every((key) => typeof key === "string" && isJsonValue(value[key], ancestors));
  ancestors.delete(value);
  return valid;
}

function completionReady(profile) {
  return profile.firstName.trim().length > 0 && profile.age !== null &&
    profile.sex !== null && profile.addressMode !== null &&
    profile.selectedLevel !== null && profile.levelOrigin !== null &&
    profile.previousProgramExperience !== null &&
    profile.proposedLevel !== null && profile.assessmentDate !== null &&
    Boolean(profile.assessmentVersion?.trim()) &&
    profile.assessmentAnswers.every((answer) => answer !== null && answer !== "") &&
    (profile.levelOrigin !== "coach" || profile.selectedLevel === profile.proposedLevel);
}

export function validateProfile(profile) {
  try {
    if (!object(profile) || !isJsonValue(profile)) return false;
    if (!Object.keys(createEmptyProfile()).filter((key) => key !== "equipmentSelectionMade")
      .every((key) => Object.hasOwn(profile, key))) return false;
    const valid = profile.profileVersion === PROFILE_VERSION &&
      typeof profile.firstName === "string" &&
      (profile.age === null || (Number.isInteger(profile.age) && profile.age >= 0)) &&
      optionalChoice(profile.sex, ["female", "male"]) &&
      optionalChoice(profile.addressMode, ["tu", "vous"]) &&
      Array.isArray(profile.equipment) && profile.equipment.every((item) => EQUIPMENT.includes(item)) &&
      new Set(profile.equipment).size === profile.equipment.length &&
      (!Object.hasOwn(profile, "equipmentSelectionMade") || typeof profile.equipmentSelectionMade === "boolean") &&
      optionalChoice(profile.proposedLevel, LEVELS) && optionalChoice(profile.selectedLevel, LEVELS) &&
      optionalChoice(profile.levelOrigin, ["coach", "manual"]) &&
      (!Object.hasOwn(profile, "levelHistory") || validLevelHistory(profile.levelHistory)) &&
      Array.isArray(profile.assessmentAnswers) && profile.assessmentAnswers.length === 9 &&
      (profile.assessmentDate === null || (typeof profile.assessmentDate === "string" && Number.isFinite(Date.parse(profile.assessmentDate)))) &&
      optionalString(profile.assessmentVersion) &&
      optionalChoice(profile.previousProgramExperience, EXPERIENCES) &&
      optionalString(profile.previousProgramStopReason) &&
      (!Object.hasOwn(profile, "currentProgramMissing") || optionalChoice(profile.currentProgramMissing,
        ["personalizedSupport", "adaptedSessions", "variety", "progressTracking", "unsure"])) &&
      (!Object.hasOwn(profile, "onboardingCompletionStage") || optionalChoice(profile.onboardingCompletionStage,
        ["transition", "experience", "question", "reaction"])) &&
      Number.isInteger(profile.onboardingCurrentStep) && profile.onboardingCurrentStep >= 0 &&
      typeof profile.onboardingCompleted === "boolean";
    return valid && (!profile.onboardingCompleted || completionReady(profile));
  } catch { return false; }
}

function result(status, profile = null) {
  return { status, profile };
}

// Résout localStorage à l'intérieur du try : l'accès lui-même peut être refusé.
function getStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function readProfile(storage) {
  let raw;
  try {
    const target = getStorage(storage);
    if (!target || typeof target.getItem !== "function") return result("unavailable");
    raw = target.getItem(PROFILE_KEY);
  } catch { return result("unavailable"); }
  if (raw === null) return result("absent");
  if (typeof raw !== "string" || !raw.trim()) return result("invalid");
  try {
    const profile = JSON.parse(raw);
    if (!object(profile)) return result("invalid");
    if (Number.isInteger(profile.profileVersion) && profile.profileVersion !== PROFILE_VERSION) {
      return result("unsupported-version");
    }
    return validateProfile(profile) ? result("valid", profile) : result("invalid");
  } catch { return result("invalid"); }
}

export function saveProfile(profile, storage, now = new Date().toISOString()) {
  if (!validateProfile(profile)) return result("invalid");
  const current = readProfile(storage);
  // Aucun remplacement silencieux d'un profil corrompu ou d'une autre version.
  if (current.status !== "absent" && current.status !== "valid") return current;
  try {
    const target = getStorage(storage);
    const next = recordLevelChange(profile, current.profile, now);
    if (!validateProfile(next)) return result("invalid");
    const serialized = JSON.stringify(next);
    target.setItem(PROFILE_KEY, serialized);
    return result("saved", JSON.parse(serialized));
  } catch { return result("unavailable"); }
}

export function updateProfile(changes, storage, now = new Date().toISOString()) {
  const current = readProfile(storage);
  if (current.status !== "absent" && current.status !== "valid") return current;
  try {
    if (!object(changes) || !isJsonValue(changes)) return result("invalid");
    return saveProfile({ ...(current.profile || createEmptyProfile()), ...changes }, storage, now);
  } catch { return result("invalid"); }
}

export function profileExists(storage) {
  return readProfile(storage).status === "valid";
}

export function isOnboardingCompleted(storage) {
  const current = readProfile(storage);
  return current.status === "valid" && current.profile.onboardingCompleted;
}
