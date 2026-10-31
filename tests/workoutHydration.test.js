import test from "node:test";
import assert from "node:assert/strict";
import { workoutSteps } from "../src/data.js";
import { createWorkoutSession, DRAFT_KEY } from "../src/workout/session.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import { HYDRATION_SECONDS, isHydrationBreak } from "../src/workout/hydration.js";

function setup(discovered = true) {
  let clock = 0;
  const steps = workoutSteps.slice(8, 10);
  const data = new Map([[DISCOVERY_KEY, JSON.stringify((discovered ? steps : steps.slice(0, 1)).map(s => s.id))]]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const sounds = [];
  const options = { storage, steps, now: () => clock, uuid: () => "hydration-test",
    sound: () => sounds.push("sound"), countdownSound: () => sounds.push("countdown") };
  let session = createWorkoutSession(options);
  session.chooseDayForm("normal", "forme"); session.toggle();
  return { steps, data, sounds, get session() { return session; }, state: () => session.getState(),
    advance(ms) { clock += ms; session.tick(); },
    reopen() { session = createWorkoutSession(options); },
    enter() { this.advance(steps[0].seconds * 1000); this.advance(15_000); },
  };
}

test("hydratation : uniquement après rotations-buste et avant ouverture-poitrine", () => {
  assert.equal(HYDRATION_SECONDS, 10);
  assert.deepEqual(workoutSteps.flatMap((s, i) => isHydrationBreak(workoutSteps, i) ? [i] : []), [8]);
  assert.equal(isHydrationBreak([...workoutSteps].reverse(), 2), false);
  const h = setup();
  h.advance(h.steps[0].seconds * 1000);
  assert.equal(h.state().phase, "rest"); assert.equal(h.state().remaining, 15);
  h.advance(14_999); assert.equal(h.state().phase, "rest");
  h.advance(1); assert.equal(h.state().phase, "hydration"); assert.equal(h.state().remaining, 10);
  assert.deepEqual(h.sounds, ["countdown"]); // Dernière seconde de récupération, avant le rituel.
  h.sounds.length = 0;
  const before = h.state();
  h.session.next(); h.advance(9999);
  assert.equal(h.state().phase, "hydration"); assert.equal(h.state().countdown, false);
  assert.equal(h.state().progress, before.progress);
  assert.equal(h.state().activeSeconds, before.activeSeconds); assert.deepEqual(h.sounds, []);
  h.advance(1); assert.equal(h.state().phase, "exercise"); assert.equal(h.state().step, 1);
  assert.equal(h.state().remaining, h.steps[1].seconds); assert.equal(h.state().running, true);
});

for (const kind of ["volontaire", "automatique", "restauration"]) test(`hydratation : pause ${kind}, reprise exacte`, () => {
  const h = setup(); h.enter(); h.advance(2250);
  if (kind === "volontaire") h.session.toggle(); else h.session.interrupt();
  h.advance(60_000); assert.equal(h.state().remaining, 7.75);
  if (kind === "restauration") h.reopen();
  assert.equal(h.state().phase, "hydration"); assert.equal(h.state().remaining, 7.75);
  if (kind === "volontaire") h.session.toggle(); else h.session.resume();
  h.advance(7749); assert.equal(h.state().phase, "hydration");
  h.advance(1); assert.equal(h.state().phase, "exercise"); assert.equal(h.state().running, true);
  assert.deepEqual(h.sounds, []);
});

test("hydratation : découverte de l’exercice suivant après les dix secondes seulement", () => {
  const h = setup(false); h.enter();
  assert.equal(h.state().instructionsOpen, false);
  h.advance(9999); assert.equal(h.state().instructionsOpen, false);
  h.advance(1); assert.equal(h.state().firstDiscovery, true); assert.equal(h.state().running, false);
  h.session.closeInstructions(); assert.equal(h.state().running, true);
});

test("hydratation : Suivant de développement préserve la découverte et les interruptions", () => {
  const h = setup(false); h.enter(); h.session.skipTimedPhase();
  assert.equal(h.state().phase, "exercise"); assert.equal(h.state().firstDiscovery, true);
  assert.equal(h.state().remaining, h.steps[1].seconds); assert.equal(h.state().running, false);
  assert.deepEqual(h.sounds, []);
  const other = setup(); other.enter(); other.session.interrupt(); other.session.skipTimedPhase();
  assert.equal(other.state().phase, "hydration"); assert.equal(other.state().remaining, 10);
  other.session.resume(); other.advance(10_000); other.session.skipTimedPhase();
  assert.equal(other.state().phase, "exercise"); assert.equal(other.state().remaining, other.steps[1].seconds);
});

test("hydratation : brouillon sur une autre paire ou durée supérieure à dix refusés", () => {
  for (const change of [{ step: 1 }, { remaining: 10.01 }]) {
    const h = setup(); h.enter();
    h.data.set(DRAFT_KEY, JSON.stringify({ ...JSON.parse(h.data.get(DRAFT_KEY)), ...change }));
    h.reopen(); assert.ok(h.state().draftError);
  }
});
