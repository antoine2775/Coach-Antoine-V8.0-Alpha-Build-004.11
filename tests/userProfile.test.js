import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_KEY, PROFILE_VERSION, createEmptyProfile, validateProfile,
  readProfile, saveProfile, updateProfile, profileExists, isOnboardingCompleted,
} from "../src/utils/userProfile.js";

function memoryStorage(entries = []) {
  const data = new Map(entries);
  return {
    data,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
  };
}

function completeProfile() {
  return {
    ...createEmptyProfile(), firstName: "Camille", age: 48, sex: "female",
    addressMode: "vous", equipment: ["dumbbells", "resistanceBands"],
    proposedLevel: "reprise", selectedLevel: "reprise", levelOrigin: "coach",
    assessmentAnswers: [0, false, "a", 1, 2, 3, 4, ["a", "b"], { answer: "a" }],
    assessmentDate: "2026-10-17T10:00:00.000Z", assessmentVersion: "1",
    previousProgramExperience: "never", onboardingCurrentStep: 7,
    onboardingCompleted: true,
  };
}

test("profil absent : aucune écriture et aucun onboarding terminé", () => {
  const storage = memoryStorage();
  assert.deepEqual(readProfile(storage), { status: "absent", profile: null });
  assert.equal(profileExists(storage), false);
  assert.equal(isOnboardingCompleted(storage), false);
  assert.equal(storage.data.size, 0);
});

test("valeurs par défaut indépendantes, brouillon valide", () => {
  const a = createEmptyProfile(), b = createEmptyProfile();
  assert.equal(a.profileVersion, PROFILE_VERSION);
  assert.equal(a.sex, null);
  assert.equal(a.selectedLevel, null);
  assert.equal(validateProfile(a), true);
  a.equipment.push("dumbbells");
  a.assessmentAnswers[0] = "a";
  assert.deepEqual(b.equipment, []);
  assert.deepEqual(b.assessmentAnswers, Array(9).fill(null));
});

test("sauvegarde et relecture d'un profil complet", () => {
  const storage = memoryStorage(), profile = completeProfile();
  const date = "2026-10-29T12:00:00Z";
  assert.equal(saveProfile(profile, storage, date).status, "saved");
  assert.deepEqual(readProfile(storage), { status: "valid", profile: { ...profile, levelHistory: [{ level: profile.selectedLevel, startedAt: date }] } });
  assert.equal(profileExists(storage), true);
  assert.equal(isOnboardingCompleted(storage), true);
  profile.equipment.push("longBar");
  assert.equal(readProfile(storage).profile.equipment.includes("longBar"), false);
});

test("mise à jour partielle et reprise : champs non modifiés conservés", () => {
  const storage = memoryStorage();
  const initial = { ...createEmptyProfile(), firstName: "Alex", sex: "male",
    assessmentAnswers: ["a", ...Array(8).fill(null)], extension: { future: true } };
  saveProfile(initial, storage);
  assert.equal(updateProfile({ onboardingCurrentStep: 3, age: 35 }, storage).status, "saved");
  assert.deepEqual(readProfile(storage).profile, { ...initial, onboardingCurrentStep: 3, age: 35 });
  assert.equal(isOnboardingCompleted(storage), false);
});

test("mise à jour d'un profil absent : création explicite d'un brouillon", () => {
  const storage = memoryStorage();
  const result = updateProfile({ firstName: "Alex" }, storage);
  assert.equal(result.status, "saved");
  assert.equal(result.profile.onboardingCompleted, false);
});

test("JSON vide, corrompu, structure invalide : jamais écrasés", () => {
  for (const raw of ["", " ", "{bad", "null", "[]", "{}", JSON.stringify({ ...createEmptyProfile(), sex: "other" })]) {
    const storage = memoryStorage([[PROFILE_KEY, raw]]);
    assert.equal(readProfile(storage).status, "invalid");
    assert.equal(saveProfile(createEmptyProfile(), storage).status, "invalid");
    assert.equal(updateProfile({ firstName: "Alex" }, storage).status, "invalid");
    assert.equal(storage.getItem(PROFILE_KEY), raw);
    assert.equal(isOnboardingCompleted(storage), false);
  }
});

test("version inconnue : pas de migration ni remplacement", () => {
  for (const version of [0, 2]) {
    const raw = JSON.stringify({ ...createEmptyProfile(), profileVersion: version });
    const storage = memoryStorage([[PROFILE_KEY, raw]]);
    assert.equal(readProfile(storage).status, "unsupported-version");
    assert.equal(updateProfile({ age: 45 }, storage).status, "unsupported-version");
    assert.equal(saveProfile(createEmptyProfile(), storage).status, "unsupported-version");
    assert.equal(storage.getItem(PROFILE_KEY), raw);
  }
});

test("stockage absent, accès refusé, quota : résultats explicites sans exception", () => {
  for (const storage of [null, {}, { getItem() { throw Error("denied"); } }]) {
    assert.equal(readProfile(storage).status, "unavailable");
    assert.equal(saveProfile(createEmptyProfile(), storage).status, "unavailable");
    assert.equal(updateProfile({ age: 40 }, storage).status, "unavailable");
  }
  const storage = { getItem: () => null, setItem() { throw Error("quota"); } };
  assert.equal(saveProfile(completeProfile(), storage).status, "unavailable");
  assert.equal(isOnboardingCompleted(storage), false);
});

test("accès global à localStorage protégé, y compris getter refusé", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("denied"); } });
    assert.equal(readProfile().status, "unavailable");
    assert.equal(saveProfile(createEmptyProfile()).status, "unavailable");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    assert.equal(readProfile().status, "unavailable");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("contrôles des champs : enums, types et mise à jour invalide sans perte", () => {
  const invalidChanges = [
    { sex: "unknown" }, { addressMode: "other" }, { age: "40" }, { age: -1 }, { age: 2.5 },
    { firstName: null }, { equipment: ["chair"] }, { equipment: ["none"] },
    { equipment: ["dumbbells", "dumbbells"] }, { selectedLevel: "expert" },
    { equipmentSelectionMade: "true" }, { equipmentSelectionMade: null },
    { levelOrigin: "auto" }, { assessmentAnswers: [] }, { assessmentDate: "invalid" },
    { previousProgramExperience: "unknown" }, { previousProgramStopReason: 1 },
    { currentProgramMissing: "unknown" }, { currentProgramMissing: ["variety"] },
    { onboardingCompletionStage: "unknown" }, { onboardingCompletionStage: true },
    { onboardingCurrentStep: -1 }, { onboardingCompleted: "true" },
    { profileVersion: 2 }, { extra: undefined }, { extra: NaN },
  ];
  const storage = memoryStorage();
  saveProfile(createEmptyProfile(), storage);
  const original = storage.getItem(PROFILE_KEY);
  for (const changes of invalidChanges) {
    assert.equal(updateProfile(changes, storage).status, "invalid");
    assert.equal(storage.getItem(PROFILE_KEY), original);
  }
});

test("onboarding terminé refusé si données obligatoires incomplètes", () => {
  assert.equal(validateProfile({ ...createEmptyProfile(), onboardingCompleted: true }), false);
  const complete = completeProfile();
  for (const [key, value] of Object.entries({ firstName: " ", age: null, sex: null,
    addressMode: null, selectedLevel: null, levelOrigin: null, previousProgramExperience: null,
    proposedLevel: null, assessmentDate: null, assessmentVersion: "", assessmentAnswers: Array(9).fill(null) })) {
    assert.equal(validateProfile({ ...complete, [key]: value }), false, key);
  }
});

test("origine du niveau explicite, aucun calcul automatique", () => {
  const storage = memoryStorage();
  saveProfile(completeProfile(), storage);
  assert.equal(updateProfile({ selectedLevel: "tonique" }, storage).status, "invalid");
  const result = updateProfile({ selectedLevel: "tonique", levelOrigin: "manual" }, storage);
  assert.equal(result.status, "saved");
  assert.equal(result.profile.proposedLevel, "reprise");
  assert.equal(result.profile.selectedLevel, "tonique");
});

test("âge mineur stockable : le contrôle 18+ appartient au futur onboarding", () => {
  assert.equal(validateProfile({ ...createEmptyProfile(), age: 17 }), true);
});

test("sexe, prénom et abandon ne modifient ni niveau ni données existantes", () => {
  const keys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm",
    "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  const storage = memoryStorage(keys.map((key) => [key, "unchanged"]));
  saveProfile(completeProfile(), storage);
  const result = updateProfile({ sex: "male", firstName: "Dominique", previousProgramStopReason: "Trop long" }, storage);
  assert.equal(result.profile.selectedLevel, "reprise");
  assert.equal(result.profile.proposedLevel, "reprise");
  for (const key of keys) assert.equal(storage.getItem(key), "unchanged");
});

test("cycles et objets non JSON refusés sans exception", () => {
  const cyclic = createEmptyProfile();
  cyclic.extra = cyclic;
  assert.equal(validateProfile(cyclic), false);
  assert.equal(saveProfile(cyclic, memoryStorage()).status, "invalid");
  assert.equal(validateProfile({ ...createEmptyProfile(), extra: new Date() }), false);
});
