import test from "node:test";
import assert from "node:assert/strict";
import { workoutSteps } from "../src/data.js";
import { createWorkoutSession, DRAFT_KEY } from "../src/workout/session.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import { WORKOUT_TRANSITIONS, TRANSITION_SECONDS, getWorkoutTransition } from "../src/workout/transitions.js";
import { isHydrationBreak } from "../src/workout/hydration.js";

function setup(steps, rest = 15, discoverNext = false, start = true) {
  let clock = 0;
  const data = new Map([["coachAntoineRestDuration", String(rest)],
    [DISCOVERY_KEY, JSON.stringify((discoverNext ? steps.slice(0, 1) : steps).map((step) => step.id))]]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const notes = [], sounds = [];
  const options = { storage, steps, now: () => clock, uuid: () => "transition-test",
    countdownSound: () => notes.push([session.getState().phase, session.getState().displayedRemaining]), sound: (kind) => sounds.push(kind) };
  let session = createWorkoutSession(options);
  session.chooseDayForm("normal", "forme"); if (start) session.toggle();
  return { notes, sounds, data, get session() { return session; }, state: () => session.getState(),
    advance(ms) { clock += ms; session.tick(); },
    reopen() { session = createWorkoutSession(options); },
  };
}

test("exactement quatre paires explicites de 7 secondes, aucun autre passage", () => {
  assert.equal(TRANSITION_SECONDS, 7);
  assert.equal(WORKOUT_TRANSITIONS.length, 4);
  const actual = workoutSteps.slice(0, -1).flatMap((step, index) => getWorkoutTransition(workoutSteps, index) ? [[step.id, workoutSteps[index + 1].id]] : []);
  assert.deepEqual(actual, [
    ["marche-active", "assis-debout-chaise"], ["assis-debout-chaise", "pompes-mur"],
    ["equilibre", "extension-jambes-assis"], ["extension-jambes-assis", "montees-pointe-pieds"],
  ]);
  assert.equal(getWorkoutTransition([...workoutSteps].reverse(), 0), null);
});

for (const rest of [10, 15, 30]) for (let index = 0; index < workoutSteps.length - 1; index++) {
  test(`passage ${index + 1}, récupération ${rest}s : ordre, durée exacte, silence et départ automatique`, () => {
    const steps = workoutSteps.slice(index, index + 2), transition = getWorkoutTransition(steps, 0);
    const h = setup(steps, rest);
    h.advance(steps[0].seconds * 1000);
    assert.equal(h.state().phase, "rest");
    assert.equal(h.state().remaining, rest);
    assert.deepEqual(h.notes, []);
    for (let second = 1; second <= rest; second++) h.advance(1000);
    assert.deepEqual(h.notes, [["rest", 3], ["rest", 2], ["rest", 1]]);
    if (transition) {
      assert.equal(h.state().phase, "transition");
      assert.equal(h.state().remaining, 7);
      assert.equal(h.state().transitionMessage, transition.message);
      const active = h.state().activeSeconds, progress = h.state().progress;
      h.session.next(); h.session.next();
      assert.equal(h.state().remaining, 7); // Suivant ne court-circuite pas la préparation.
      h.advance(6999);
      assert.equal(h.state().phase, "transition");
      assert.equal(h.state().countdown, false);
      assert.equal(h.state().activeSeconds, active);
      assert.equal(h.state().progress, progress);
      assert.equal(h.notes.length, 3);
      assert.deepEqual(h.sounds, []);
      h.advance(1);
    }
    if (isHydrationBreak(steps, 0)) {
      assert.equal(h.state().phase, "hydration");
      assert.equal(h.state().remaining, 10);
      h.advance(10_000);
    }
    assert.equal(h.state().phase, "exercise");
    assert.equal(h.state().step, 1);
    assert.equal(h.state().remaining, steps[1].seconds);
    assert.equal(h.state().running, true);
    assert.equal(h.state().activeSeconds, steps[0].seconds);
    assert.equal(h.notes.length, 3);
    assert.deepEqual(h.sounds, []);
  });
}

for (const transition of WORKOUT_TRANSITIONS) test(`préparation avant démarrage et pause réelle : ${transition.from}`, () => {
  const index = workoutSteps.findIndex((step) => step.id === transition.from);
  const steps = workoutSteps.slice(index, index + 2);
  for (const paused of [false, true]) {
    const h = setup(steps, 15, false, paused);
    if (paused) h.session.toggle();
    h.session.next(); h.advance(400); h.session.next();
    assert.equal(h.state().phase, "transition");
    assert.equal(h.state().remaining, 7);
    assert.equal(h.state().running, !paused);
    if (paused) {
      h.advance(60_000);
      assert.equal(h.state().remaining, 7);
      h.session.toggle();
    }
    h.advance(6999); assert.equal(h.state().phase, "transition");
    h.advance(1); assert.equal(h.state().phase, "exercise");
    assert.equal(h.state().step, 1); assert.equal(h.state().running, true);
  }
});

for (const transition of WORKOUT_TRANSITIONS) for (const automatic of [false, true]) test(`pause ${automatic ? "automatique" : "volontaire"} et reprise sans réinitialisation : ${transition.from}`, () => {
  const index = workoutSteps.findIndex((step) => step.id === transition.from);
  const steps = workoutSteps.slice(index, index + 2), h = setup(steps);
  h.advance((steps[0].seconds + 15) * 1000); h.advance(2250);
  if (automatic) h.session.interrupt(); else h.session.toggle();
  assert.equal(h.state().running, false);
  assert.equal(h.state().remaining, 4.75);
  h.advance(60_000);
  assert.equal(h.state().remaining, 4.75);
  if (automatic) h.session.resume(); else h.session.toggle();
  assert.equal(h.state().running, true);
  assert.equal(h.state().remaining, 4.75);
  h.advance(4749);
  assert.equal(h.state().phase, "transition");
  assert.equal(h.state().countdown, false);
  h.advance(1);
  assert.equal(h.state().phase, "exercise");
  assert.equal(h.state().step, 1);
  assert.equal(h.state().remaining, steps[1].seconds);
  assert.equal(h.state().running, true);
  assert.deepEqual(h.notes, []); assert.deepEqual(h.sounds, []);
});

for (const transition of WORKOUT_TRANSITIONS) test(`pause/reprise et restauration exactes : ${transition.from}`, () => {
  const index = workoutSteps.findIndex((step) => step.id === transition.from);
  const steps = workoutSteps.slice(index, index + 2), h = setup(steps);
  h.advance((steps[0].seconds + 15) * 1000); h.advance(2250);
  h.session.toggle();
  const before = h.state();
  h.advance(60_000); h.session.next();
  assert.equal(h.state().remaining, before.remaining);
  h.reopen();
  assert.equal(h.state().phase, "transition");
  assert.equal(h.state().remaining, 4.75);
  assert.equal(h.state().interrupted, true);
  h.session.resume(); h.advance(4749);
  assert.equal(h.state().phase, "transition");
  h.advance(1);
  assert.equal(h.state().phase, "exercise"); assert.equal(h.state().step, 1);
  assert.equal(h.state().remaining, steps[1].seconds);
  assert.deepEqual(h.sounds, []);
});

test("séance entière : 28 secondes de transitions et 10 d’hydratation, statistiques inchangées", () => {
  const h = setup(workoutSteps);
  h.advance((915 + 11 * 15) * 1000);
  assert.equal(h.state().finished, null);
  h.advance(37_999); assert.equal(h.state().finished, null);
  h.advance(1);
  assert.equal(h.state().phase, "finished");
  assert.equal(h.state().activeSeconds, 915);
  assert.deepEqual(h.sounds, ["finish"]);
});

test("première démo conservée, présentée seulement après la transition complète", () => {
  const steps = workoutSteps.slice(1, 3), h = setup(steps, 15, true);
  h.advance((steps[0].seconds + 15) * 1000);
  assert.equal(h.state().phase, "transition"); assert.equal(h.state().instructionsOpen, false);
  h.advance(7000);
  assert.equal(h.state().instructionsOpen, true); assert.equal(h.state().firstDiscovery, true);
  assert.equal(h.state().running, false); assert.equal(h.state().remaining, steps[1].seconds);
  h.session.closeInstructions(); assert.equal(h.state().running, true);
});

for (const transition of WORKOUT_TRANSITIONS) test(`Suivant de développement : démo et collision préservées, ${transition.from}`, () => {
  const index = workoutSteps.findIndex(s => s.id === transition.from);
  const steps = workoutSteps.slice(index, index + 2);
  const h = setup(steps, 15, true);
  h.advance((steps[0].seconds + 15) * 1000);
  h.session.skipTimedPhase();
  assert.equal(h.state().phase, "exercise"); assert.equal(h.state().step, 1);
  assert.equal(h.state().instructionsOpen, true); assert.equal(h.state().running, false);
  assert.equal(h.state().remaining, steps[1].seconds);
  h.session.skipTimedPhase(); assert.equal(h.state().remaining, steps[1].seconds);
  assert.deepEqual(h.notes, []); assert.deepEqual(h.sounds, []);
  const other = setup(steps);
  other.advance((steps[0].seconds + 15) * 1000);
  other.session.interrupt(); other.session.skipTimedPhase();
  assert.equal(other.state().phase, "transition"); assert.equal(other.state().remaining, 7);
  other.session.resume(); other.advance(7000); other.session.skipTimedPhase();
  assert.equal(other.state().phase, "exercise"); assert.equal(other.state().remaining, steps[1].seconds);
});

test("brouillon de transition invalide refusé si la paire ne correspond pas", () => {
  const h = setup(workoutSteps.slice(0, 2));
  const draft = JSON.parse(h.data.get(DRAFT_KEY));
  h.data.set(DRAFT_KEY, JSON.stringify({ ...draft, phase: "transition", remaining: 7 }));
  h.reopen(); assert.ok(h.state().draftError); assert.equal(h.state().id, null);
});
