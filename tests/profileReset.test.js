import test from "node:test";
import assert from "node:assert/strict";
import { resetOnboardingProfile } from "../src/utils/profileReset.js";
import { createEmptyProfile, PROFILE_KEY, readProfile } from "../src/utils/userProfile.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import { createWorkoutSession, DRAFT_KEY } from "../src/workout/session.js";
import { HISTORY_KEY } from "../src/utils/workoutHistory.js";
import { workoutSteps } from "../src/data.js";

function setup() {
  const profile = { ...createEmptyProfile(), firstName: "Mineur", sex: "male", addressMode: "vous", onboardingCurrentStep: 4,
    previousProgramExperience: "current", currentProgramMissing: "variety", equipment: ["dumbbells"] };
  const data = new Map([[PROFILE_KEY, JSON.stringify(profile)], [DISCOVERY_KEY, JSON.stringify(workoutSteps.map((step) => step.id))],
    [DRAFT_KEY, "old draft"], ["coachAntoineDayForm", "high"], [HISTORY_KEY, "[]"], ["coachAntoineSound", "off"]]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  return { storage, data };
}

test("autre personne : effacer profil entier, brouillon, forme et découverte ; conserver historique et réglages", () => {
  const { storage, data } = setup();
  assert.equal(resetOnboardingProfile(storage).status, "reset");
  assert.equal(readProfile(storage).status, "absent");
  for (const key of [PROFILE_KEY, DISCOVERY_KEY, DRAFT_KEY, "coachAntoineDayForm"]) assert.equal(data.has(key), false);
  assert.equal(data.get(HISTORY_KEY), "[]");
  assert.equal(data.get("coachAntoineSound"), "off");
  const session = createWorkoutSession({ storage, uuid: () => "new-user" });
  session.chooseDayForm("normal", "forme");
  assert.equal(session.getState().instructionsOpen, true);
  assert.equal(session.getState().firstDiscovery, true);
});

test("suppression refusée : aucun succès annoncé, données précédentes restaurées", () => {
  const { storage, data } = setup(), previous = new Map(data);
  storage.removeItem = (key) => { if (key === DISCOVERY_KEY) throw Error("denied"); data.delete(key); };
  assert.equal(resetOnboardingProfile(storage).status, "unavailable");
  assert.deepEqual(data, previous);
});
