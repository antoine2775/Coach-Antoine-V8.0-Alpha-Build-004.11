import { validateProfile } from "./userProfile.js";

export const LEVEL_OPTIONS = Object.freeze([
  { value: "reprise", label: "Reprise" },
  { value: "forme", label: "Forme" },
  { value: "tonique", label: "Tonique" },
].map(Object.freeze));
export const EQUIPMENT_OPTIONS = Object.freeze([
  { value: "dumbbells", label: "Haltères" },
  { value: "longBar", label: "Barre longue" },
  { value: "resistanceBands", label: "Élastiques de résistance" },
].map(Object.freeze));
export const ADDRESS_OPTIONS = Object.freeze([
  { value: "tu", label: "Tutoiement" },
  { value: "vous", label: "Vouvoiement" },
].map(Object.freeze));

export const PROFILE_SETTINGS_MESSAGES = {
  tu: {
    level: "Tu peux changer de niveau quand tu le souhaites. Coach Antoine pourra aussi te proposer d'en changer au fil du temps, mais ce sera toujours toi qui décideras.",
    equipment: "Coach Antoine tiendra compte de ton matériel pour te proposer les exercices adaptés.",
    error: "La modification du profil n’a pas pu être enregistrée. Tu peux réessayer.",
  },
  vous: {
    level: "Vous pouvez changer de niveau quand vous le souhaitez. Coach Antoine pourra aussi vous proposer d'en changer au fil du temps, mais ce sera toujours vous qui déciderez.",
    equipment: "Coach Antoine tiendra compte de votre matériel pour vous proposer les exercices adaptés.",
    error: "La modification du profil n’a pas pu être enregistrée. Vous pouvez réessayer.",
  },
};

export function toggleProfileEquipment(equipment, value, checked) {
  return EQUIPMENT_OPTIONS.filter((option) => option.value === value
    ? checked : equipment.includes(option.value)).map((option) => option.value);
}

// Liste fermée de champs : aucune transition d'onboarding ni réévaluation.
export function prepareProfileSetting(profile, field, value) {
  if (!validateProfile(profile) || !profile.onboardingCompleted) return null;
  let changes;
  if (field === "selectedLevel" && LEVEL_OPTIONS.some((option) => option.value === value)) {
    changes = { selectedLevel: value, levelOrigin: "manual" };
  } else if (field === "addressMode" && ADDRESS_OPTIONS.some((option) => option.value === value)) {
    changes = { addressMode: value };
  } else if (field === "equipment" && Array.isArray(value) &&
      value.every((item) => EQUIPMENT_OPTIONS.some((option) => option.value === item)) &&
      new Set(value).size === value.length) {
    changes = { equipment: [...value] };
  } else return null;
  return validateProfile({ ...profile, ...changes }) ? changes : null;
}
