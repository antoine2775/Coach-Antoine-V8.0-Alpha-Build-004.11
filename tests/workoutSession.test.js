import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutSession, attachWorkoutSession, DRAFT_KEY } from "../src/workout/session.js";
import { WORKOUT_CONFIG } from "../src/workout/config.js";
import { FEEDBACK_KEY, requestAdaptationCheck } from "../src/workout/feedback.js";
import { HISTORY_KEY, readHistory, getStatistics } from "../src/utils/workoutHistory.js";
import { workoutSteps } from "../src/data.js";

function setup({ data = new Map(), config = {}, steps = workoutSteps } = {}) {
  let clock = 0, wall = Date.parse("2026-10-18T10:00:00Z"), sequence = 0;
  const failures = new Set(), sounds = [];
  const storage = {
    getItem(key) { if (failures.has(`read:${key}`)) throw Error("read"); return data.get(key) ?? null; },
    setItem(key, value) { if (failures.has(key)) throw Error("quota"); data.set(key, value); },
    removeItem(key) { if (failures.has(key)) throw Error("remove"); data.delete(key); },
  };
  const options = { storage, now: () => clock, wallNow: () => wall, uuid: () => `session-${++sequence}`,
    sound: (value) => sounds.push(value), steps, config: { ...WORKOUT_CONFIG, ...config } };
  let session = createWorkoutSession(options);
  return {
    data, failures, storage, sounds, get session() { return session; },
    state: () => session.getState(),
    advance(ms, tick = true) { clock += ms; wall += ms; if (tick) session.tick(); },
    start(form = "normal", level = "forme") { session.chooseDayForm(form, level); session.toggle(); },
    next() { clock += WORKOUT_CONFIG.NEXT_GUARD_MS + 1; wall += WORKOUT_CONFIG.NEXT_GUARD_MS + 1; session.next(); },
    finish() { while (!session.getState().finished) this.next(); },
    reopen() { session = createWorkoutSession(options); session.activate(); },
    fresh() { assert.equal(session.abandon(), true); session = createWorkoutSession(options); },
  };
}

test("fin naturelle, récupération de 15 s incluant 3/2/1, exercice suivant automatique", () => {
  const h = setup(); h.start();
  h.advance(60_000);
  assert.equal(h.state().phase, "rest");
  assert.equal(h.state().remaining, 15);
  assert.equal(h.state().activeSeconds, 60);
  h.advance(11_000); assert.equal(h.state().countdown, false);
  for (const value of [3, 2, 1]) {
    h.advance(1000);
    assert.equal(h.state().countdown, true);
    assert.equal(h.state().displayedRemaining, value);
    assert.equal(h.state().activeSeconds, 60);
  }
  h.advance(1000);
  assert.equal(h.state().step, 1);
  assert.equal(h.state().phase, "exercise");
  assert.equal(h.state().remaining, 75);
  assert.equal(h.state().running, true);
  assert.deepEqual(h.sounds, []);
});

test("dérive des callbacks : calcul écoulé, fractions et dépassement conservés", () => {
  const h = setup(); h.start();
  h.advance(60_450);
  assert.equal(h.state().phase, "rest");
  assert.ok(Math.abs(h.state().remaining - 14.55) < 1e-7);
  h.advance(16_000);
  assert.equal(h.state().step, 1);
  assert.ok(Math.abs(h.state().activeSeconds - 61.45) < 1e-7);
});

for (const phase of ["exercise", "rest"]) test(`Pause/Reprendre exacte en ${phase}`, () => {
  const h = setup(); h.start();
  h.advance(phase === "rest" ? 72_200 : 2_200);
  h.session.toggle();
  const before = h.state();
  h.advance(600_000);
  assert.equal(h.state().remaining, before.remaining);
  assert.equal(h.state().activeSeconds, before.activeSeconds);
  h.session.toggle(); h.advance(500);
  assert.ok(Math.abs(h.state().remaining - (before.remaining - 0.5)) < 1e-7);
});

test("séance entièrement automatique : 915 s actives, 11 récupérations, sauvegarde avant avis", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } }); h.start();
  h.advance((915 + 11 * 15) * 1000);
  assert.equal(h.state().phase, "finished");
  assert.equal(h.state().activeSeconds, 915);
  assert.equal(h.state().feedbackScreen, "general");
  assert.equal(readHistory(h.storage).history[0].activeSeconds, 915);
  assert.equal(getStatistics(readHistory(h.storage)).cards[0].value, 1);
  assert.deepEqual(h.sounds, ["finish"]);
  h.session.tick(); h.session.next(); h.session.save(); h.session.save();
  assert.equal(readHistory(h.storage).history.length, 1);
  assert.deepEqual(h.sounds, ["finish"]);
});

for (const [elapsed, expected] of [[49_000, 1], [49_500, 1], [50_000, 0], [55_000, 0]]) {
  test(`Suivant après ${elapsed / 1000}s : seuil des secondes affichées`, () => {
    const h = setup(); h.start(); h.advance(elapsed);
    h.session.next();
    assert.equal(h.state().earlyCount, expected);
    assert.equal(h.state().activeSeconds, elapsed / 1000);
  });
}

test("trois exercices anticipés, aucun rappel au quatrième/cinquième, réarmement après fin normale", () => {
  const h = setup(); h.session.chooseDayForm("normal");
  for (let count = 1; count <= 5; count++) {
    h.next();
    assert.equal(h.state().earlyCount, count);
    assert.equal(h.state().reminder, count === 3);
    h.next(); // récupération ignorée par le compteur
    assert.equal(h.state().earlyCount, count);
  }
  h.session.toggle(); h.advance(workoutSteps[5].seconds * 1000);
  assert.equal(h.state().earlyCount, 0);
  h.next();
  for (let count = 1; count <= 3; count++) {
    h.next(); assert.equal(h.state().reminder, count === 3); h.next();
  }
});

test("sortie à 10 secondes réinitialise une série ; paramètres du rappel modifiables", () => {
  const h = setup({ config: { EARLY_SKIP_REMAINING_SECONDS: 20, EARLY_SKIP_CONSECUTIVE_COUNT: 2 } });
  h.session.chooseDayForm("normal");
  h.next(); h.next(); h.next();
  assert.equal(h.state().reminder, true);
  h.next(); h.session.toggle(); h.advance(65_000);
  h.session.next();
  assert.equal(h.state().earlyCount, 0);
  assert.equal(h.state().reminder, false);
});

test("double clic et collision timer/Suivant ne traversent pas deux phases", () => {
  const h = setup(); h.start(); h.advance(1000);
  h.session.next(); h.session.next();
  assert.equal(h.state().phase, "rest"); assert.equal(h.state().step, 0);
  h.advance(15_000, false); h.session.next();
  assert.equal(h.state().phase, "exercise"); assert.equal(h.state().step, 1);
  h.session.next(); assert.equal(h.state().phase, "exercise");
  h.advance(75_000); h.session.next();
  assert.equal(h.state().phase, "rest"); assert.equal(h.state().step, 1);
});

test("Suivant pendant suspension reste suspendu ; seuls les temps exercés sont comptés", () => {
  const h = setup(); h.start(); h.advance(2500); h.session.toggle();
  h.next(); h.next();
  assert.equal(h.state().step, 1); assert.equal(h.state().running, false);
  h.advance(300_000); assert.equal(h.state().activeSeconds, 2.5);
  h.session.toggle(); h.advance(1750); h.next();
  assert.ok(Math.abs(h.state().activeSeconds - 4.601) < 1e-7);
});

for (const phase of ["exercise", "rest"]) test(`interruption/rechargement/reprise exacte en ${phase}`, () => {
  const h = setup(); h.start(); h.advance(phase === "rest" ? 72_500 : 2500);
  h.session.interrupt(); const before = h.state();
  h.advance(24 * 60 * 60 * 1000); h.reopen();
  assert.equal(h.state().interrupted, true); assert.equal(h.state().running, false);
  assert.equal(h.state().remaining, before.remaining); assert.equal(h.state().activeSeconds, before.activeSeconds);
  h.session.resume(); h.advance(250);
  assert.ok(Math.abs(h.state().remaining - (before.remaining - 0.25)) < 1e-7);
  assert.equal(h.state().id, before.id);
});

test("restauration après arrêt sans événement : dernier point sauvegardé, aucun rattrapage", () => {
  const h = setup(); h.start(); h.advance(3200);
  const before = h.state(); h.advance(90_000, false); h.reopen();
  assert.equal(h.state().remaining, before.remaining);
  assert.equal(h.state().activeSeconds, before.activeSeconds);
  assert.equal(h.state().interrupted, true);
});

test("nouvelle séance après interruption : brouillon supprimé, aucun historique ni cadence modifiés", () => {
  const h = setup(); h.start(); h.advance(5000); h.session.interrupt(); h.session.abandon();
  assert.equal(h.data.has(DRAFT_KEY), false); assert.equal(h.data.has(HISTORY_KEY), false);
  assert.equal(h.data.has(FEEDBACK_KEY), false); assert.equal(h.state().dayForm, null);
  h.session.chooseDayForm("low"); assert.equal(h.state().id, "session-2");
});

function environment() {
  const docListeners = new Map(), winListeners = new Map(), timers = new Map();
  let nextId = 0;
  return {
    document: { visibilityState: "visible", addEventListener: (key, fn) => docListeners.set(key, fn),
      removeEventListener: (key) => docListeners.delete(key) },
    window: { addEventListener: (key, fn) => winListeners.set(key, fn), removeEventListener: (key) => winListeners.delete(key) },
    setInterval(fn) { timers.set(++nextId, fn); return nextId; }, clearInterval(id) { timers.delete(id); },
    visibility(value) { this.document.visibilityState = value; docListeners.get("visibilitychange")?.(); },
    pagehide() { winListeners.get("pagehide")?.(); },
    timers, docListeners, winListeners,
  };
}

test("événements réels du raccord : arrière-plan, verrouillage/pagehide, retour et sortie de page", () => {
  const h = setup(), env = environment();
  const detach = attachWorkoutSession(h.session, env, () => {});
  h.start(); h.advance(1250, false); env.visibility("hidden");
  assert.equal(h.state().interrupted, true);
  const before = h.state(); h.advance(600_000); env.visibility("visible");
  assert.equal(h.state().remaining, before.remaining); assert.equal(h.state().running, false);
  h.session.resume(); h.advance(500, false); env.pagehide();
  assert.equal(h.state().interrupted, true);
  h.session.resume(); h.advance(250, false); detach();
  assert.equal(h.state().running, false); assert.equal(h.state().interrupted, true);
  assert.equal(env.timers.size + env.docListeners.size + env.winListeners.size, 0);
  h.reopen(); assert.equal(h.state().activeSeconds, 2);
});

test("raccord nettoyé/réactivé comme en StrictMode : un seul intervalle, pas de séance fantôme", () => {
  const h = setup(), env = environment();
  attachWorkoutSession(h.session, env, () => {})();
  const detach = attachWorkoutSession(h.session, env, () => {});
  assert.equal(h.state().dayForm, null); assert.equal(env.timers.size, 1); detach();
});

test("feedback seulement toutes les N séances ; refus, timeout et réouverture ne décalent pas le compteur", () => {
  const h = setup();
  for (let count = 1; count <= 6; count++) {
    h.session.chooseDayForm("normal", "forme"); h.finish();
    assert.equal(h.state().feedbackScreen, count % 3 === 0 ? "general" : "close");
    h.reopen();
    assert.equal(h.state().feedbackScreen, count % 3 === 0 ? "general" : "close");
    if (count % 3 === 0) h.advance(WORKOUT_CONFIG.END_FEEDBACK_TIMEOUT);
    assert.equal(h.state().feedbackScreen, "close");
    h.fresh();
  }
  const data = JSON.parse(h.data.get(FEEDBACK_KEY));
  assert.equal(data.sinceAsked, 0); assert.equal(data.sessions.length, 6);
  assert.ok(data.sessions.every((entry) => entry.response === null));
});

test("événement significatif et niveau changé : question anticipée, compteur réinitialisé sans changer le profil", () => {
  const h = setup(); h.data.set("coachAntoineProfile", "profil intact");
  h.session.chooseDayForm("normal", "forme"); h.finish(); h.fresh();
  requestAdaptationCheck(h.storage, "future-significant-event");
  h.session.chooseDayForm("low", "forme"); h.finish();
  assert.equal(h.state().feedbackScreen, "general");
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sinceAsked, 0);
  h.session.answer("yes"); h.fresh();
  h.session.chooseDayForm("high", "tonique"); h.finish();
  assert.equal(h.state().feedbackScreen, "general");
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions.at(-1).reason, "level-change");
  assert.equal(h.data.get("coachAntoineProfile"), "profil intact");
});

test("aucune règle inventée sur les tendances de forme du jour", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 20 } });
  for (const form of ["normal", "low", "low", "low", "high", "high"]) {
    h.session.chooseDayForm(form, "forme"); h.finish();
    assert.equal(h.state().feedbackScreen, "close"); h.fresh();
  }
});

test("OUI : réponse liée à l'id, aucun autre écran, aucun réglage modifié", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("yes");
  assert.equal(h.state().feedbackScreen, "close");
  const entry = JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0];
  assert.equal(entry.id, h.state().id); assert.equal(entry.response.adapted, true);
  assert.equal(h.data.has("coachAntoineRestDuration"), false);
  h.session.answer("no"); assert.equal(h.state().feedbackScreen, "close");
});

for (const [category, value, expected] of [["pauses", "short", 20], ["pauses", "long", 10],
  ["duration", "short", null], ["duration", "long", null], ["difficulty", "easy", null], ["difficulty", "hard", null]]) {
  test(`NON → ${category} → ${value} : réponse conservée, seul réglage autorisé`, () => {
    const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
    h.data.set("coachAntoineProfile", "inchangé");
    h.session.chooseDayForm("normal"); h.finish();
    const history = h.data.get(HISTORY_KEY);
    h.session.answer("no"); assert.equal(h.state().feedbackScreen, "category");
    h.session.toggleFeedbackCategory(category); h.session.continueFeedback(); assert.equal(h.state().feedbackScreen, "detail");
    h.session.setFeedbackDetail(category, value); h.session.submitFeedback(); assert.equal(h.state().feedbackScreen, "acknowledgement");
    const response = JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0].response;
    assert.equal(response.answers[category], value); assert.equal(response.adapted, false);
    assert.equal(h.data.get("coachAntoineRestDuration") ?? null, expected === null ? null : String(expected));
    assert.equal(h.data.get("coachAntoineProfile"), "inchangé"); assert.equal(h.data.get(HISTORY_KEY), history);
    h.reopen(); assert.equal(h.state().feedbackScreen, "acknowledgement");
  });
}

for (const [initial, value, expected] of [[30, "short", 30], [10, "long", 10]]) {
  test(`bornes existantes des récupérations : ${initial}/${value}`, () => {
    const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
    h.data.set("coachAntoineRestDuration", String(initial)); h.fresh();
    h.session.chooseDayForm("normal"); h.finish();
    h.session.answer("no"); h.session.toggleFeedbackCategory("pauses"); h.session.continueFeedback(); h.session.setFeedbackDetail("pauses", value); h.session.submitFeedback();
    assert.equal(h.state().restDuration, expected);
  });
}

for (const screen of ["general", "category", "detail"]) test(`timeout indépendant de 5 min sur ${screen} : aucun choix ni réglage implicite`, () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish();
  h.advance(299_000);
  if (screen !== "general") h.session.answer("no");
  if (screen === "detail") { h.advance(299_000); h.session.toggleFeedbackCategory("pauses"); h.session.continueFeedback(); }
  const screenStart = h.state().feedbackDeadline;
  if (screen === "general") h.advance(999);
  else h.advance(299_999);
  assert.equal(h.state().feedbackScreen, screen);
  h.advance(1);
  assert.equal(h.state().feedbackScreen, "close"); assert.ok(screenStart);
  assert.equal(h.data.has("coachAntoineRestDuration"), false);
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0].response, null);
  assert.equal(readHistory(h.storage).history.length, 1);
});

test("réponse exactement à l'expiration ignorée ; fermeture au feedback conserve la séance terminée", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1, END_FEEDBACK_TIMEOUT: 1000 } });
  h.session.chooseDayForm("normal"); h.finish();
  h.advance(1000, false); h.session.answer("yes");
  assert.equal(h.state().feedbackScreen, "close");
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0].response, null);
  h.reopen();
  assert.equal(readHistory(h.storage).history.length, 1); assert.deepEqual(h.sounds, ["finish"]);
});

test("réouverture pendant feedback : délai initial conservé et timeout hors application", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  const deadline = h.state().feedbackDeadline;
  h.advance(100_000, false); h.reopen();
  assert.equal(h.state().feedbackScreen, "category"); assert.equal(h.state().feedbackDeadline, deadline);
  h.advance(200_000, false); h.reopen();
  assert.equal(h.state().feedbackScreen, "close"); assert.equal(readHistory(h.storage).history.length, 1);
});

test("retry après quota : outbox restaurée, même id, même durée, aucun son rejoué ni doublon", () => {
  const h = setup(); h.failures.add(HISTORY_KEY); h.start(); h.advance(2000); h.finish();
  assert.equal(h.state().saveStatus, "error"); assert.equal(h.data.has(HISTORY_KEY), false);
  const finished = h.state().finished;
  assert.equal(h.session.abandon(), false);
  h.reopen(); assert.equal(h.state().saveStatus, "error");
  h.failures.delete(HISTORY_KEY); h.session.save(); h.session.save();
  assert.deepEqual(readHistory(h.storage).history, [finished]);
  assert.equal(h.state().saveStatus, "saved"); assert.deepEqual(h.sounds, ["finish"]);
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions.length, 1);
});

test("ancien historique compatible et historique corrompu jamais écrasé", () => {
  const h = setup();
  const old = { label: "Ancienne séance", date: "2025-01-01T00:00:00Z" };
  h.data.set(HISTORY_KEY, JSON.stringify([old])); h.session.chooseDayForm("normal"); h.finish();
  assert.deepEqual(readHistory(h.storage).history[1], old);
  h.fresh(); h.data.set(HISTORY_KEY, "{broken"); h.session.chooseDayForm("normal"); h.finish();
  assert.equal(h.state().saveStatus, "error"); assert.equal(h.data.get(HISTORY_KEY), "{broken");
});

test("échec de suivi/feedback : retry sans perdre la séance ni changer le réglage prématurément", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.failures.add(FEEDBACK_KEY); h.session.chooseDayForm("normal"); h.finish();
  assert.equal(h.state().saveStatus, "saved"); assert.ok(h.state().feedbackError);
  h.failures.delete(FEEDBACK_KEY); h.session.save();
  assert.equal(h.state().feedbackScreen, "general");
  h.session.answer("no"); h.session.toggleFeedbackCategory("pauses"); h.session.continueFeedback(); h.failures.add(FEEDBACK_KEY);
  h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback(); assert.equal(h.state().feedbackScreen, "detail");
  assert.equal(h.data.has("coachAntoineRestDuration"), false);
  h.failures.delete(FEEDBACK_KEY); h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback();
  assert.equal(h.state().restDuration, 20); assert.equal(readHistory(h.storage).history.length, 1);
});

test("retry d'un ajustement de pause ne l'applique pas deux fois", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no"); h.session.toggleFeedbackCategory("pauses"); h.session.continueFeedback();
  h.failures.add("coachAntoineRestDuration"); h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback();
  assert.equal(h.state().feedbackScreen, "detail");
  h.failures.delete("coachAntoineRestDuration"); h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback(); h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback();
  assert.equal(h.data.get("coachAntoineRestDuration"), "20");
});

test("brouillon invalide conservé jusqu'à abandon explicite", () => {
  const h = setup({ data: new Map([[DRAFT_KEY, "{broken"]]) });
  assert.ok(h.state().draftError); h.session.chooseDayForm("normal");
  assert.equal(h.data.get(DRAFT_KEY), "{broken"); assert.equal(h.state().id, null);
  h.session.abandon(); h.session.chooseDayForm("normal"); assert.ok(h.state().id);
});

test("réouverture après réponse enregistrée mais réglage non écrit : application unique de la réponse explicite", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no"); h.session.toggleFeedbackCategory("pauses"); h.session.continueFeedback();
  h.failures.add("coachAntoineRestDuration"); h.session.setFeedbackDetail("pauses", "short"); h.session.submitFeedback();
  assert.equal(h.state().feedbackScreen, "detail");
  h.failures.delete("coachAntoineRestDuration"); h.reopen();
  assert.equal(h.state().feedbackScreen, "acknowledgement"); assert.equal(h.state().restDuration, 20);
  h.reopen(); assert.equal(h.state().restDuration, 20);
  assert.equal(readHistory(h.storage).history.length, 1);
});

test("brouillon temporairement non inscriptible : avis durable réconcilié après réouverture", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish();
  h.failures.add(DRAFT_KEY); h.session.answer("yes");
  assert.ok(h.state().draftError); assert.equal(h.state().feedbackScreen, "close");
  h.failures.delete(DRAFT_KEY); h.reopen();
  assert.equal(h.state().feedbackScreen, "close"); assert.equal(h.state().feedbackReply.adapted, true);
});

test("son désactivé et erreurs audio : aucune influence sur la finalisation", () => {
  const h = setup(); h.data.set("coachAntoineSound", "off");
  h.session.chooseDayForm("normal"); h.finish(); h.session.save();
  assert.deepEqual(h.sounds, []); assert.equal(readHistory(h.storage).history.length, 1);
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const session = createWorkoutSession({ storage, steps: [{ seconds: 1 }], uuid: () => "audio-failure",
    sound: () => { throw Error("audio"); } });
  session.chooseDayForm("normal"); session.next();
  assert.equal(session.getState().saveStatus, "saved"); assert.equal(readHistory(storage).history.length, 1);
});

test("troisième sortie anticipée au dernier exercice : rappel disponible à la clôture", () => {
  const h = setup({ steps: [{ seconds: 60 }, { seconds: 60 }, { seconds: 60 }] });
  h.session.chooseDayForm("normal"); h.finish();
  assert.equal(h.state().earlyCount, 3); assert.equal(h.state().reminder, true);
  assert.equal(h.state().phase, "finished");
});

test("métadonnées feedback corrompues : historique protégé, réglages inchangés et erreur accessible", () => {
  const h = setup(); h.data.set(FEEDBACK_KEY, "{broken");
  h.session.chooseDayForm("normal"); h.finish();
  assert.equal(h.state().saveStatus, "saved"); assert.ok(h.state().feedbackError);
  assert.equal(h.data.get(FEEDBACK_KEY), "{broken");
  assert.equal(h.data.has("coachAntoineRestDuration"), false);
});

const combinations = [["pauses"], ["duration"], ["difficulty"], ["pauses", "duration"],
  ["pauses", "difficulty"], ["duration", "difficulty"], ["pauses", "duration", "difficulty"]];
for (const categories of combinations) test(`avis multiple ${categories.join(" + ")} : validation complète, conservation et réglages ciblés`, () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.data.set("coachAntoineProfile", "niveau et profil inchangés");
  h.session.chooseDayForm("normal", "forme"); h.finish();
  const history = h.data.get(HISTORY_KEY);
  h.session.answer("no");
  h.session.continueFeedback(); assert.equal(h.state().feedbackScreen, "category");
  for (const category of categories) h.session.toggleFeedbackCategory(category);
  h.session.continueFeedback(); assert.equal(h.state().feedbackScreen, "detail");
  const answers = {};
  for (const category of categories) {
    h.session.submitFeedback(); assert.equal(h.state().feedbackScreen, "detail");
    assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0].response, null);
    assert.equal(h.data.has("coachAntoineRestDuration"), false);
    answers[category] = { pauses: "short", duration: "long", difficulty: "hard" }[category];
    h.session.setFeedbackDetail(category, answers[category]);
  }
  h.session.submitFeedback(); assert.equal(h.state().feedbackScreen, "acknowledgement");
  const entries = JSON.parse(h.data.get(FEEDBACK_KEY)).sessions;
  assert.equal(entries.length, 1); assert.equal(entries[0].id, h.state().id);
  assert.deepEqual(entries[0].response.answers, answers);
  assert.equal(h.data.get("coachAntoineRestDuration") ?? null, categories.includes("pauses") ? "20" : null);
  assert.equal(h.data.get("coachAntoineProfile"), "niveau et profil inchangés");
  assert.equal(h.data.get(HISTORY_KEY), history);
  h.reopen(); assert.deepEqual(h.state().feedbackReply.answers, answers);
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sinceAsked, 0);
});

test("cases à cocher : désélection possible, aucune précision hors sélection", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.session.toggleFeedbackCategory("pauses"); h.session.toggleFeedbackCategory("duration");
  h.session.toggleFeedbackCategory("pauses");
  assert.deepEqual(h.state().feedbackCategories, ["duration"]);
  h.session.toggleFeedbackCategory("duration"); h.session.continueFeedback();
  assert.equal(h.state().feedbackScreen, "category");
  h.session.toggleFeedbackCategory("difficulty"); h.session.continueFeedback();
  h.session.setFeedbackDetail("pauses", "short"); h.session.setFeedbackDetail("difficulty", "long");
  h.session.submitFeedback(); assert.equal(h.state().feedbackScreen, "detail");
  h.session.setFeedbackDetail("difficulty", "easy"); h.session.setFeedbackDetail("difficulty", "hard");
  h.session.submitFeedback();
  assert.deepEqual(h.state().feedbackReply.answers, { difficulty: "hard" });
});

for (const screen of ["category", "detail"]) test(`timeout ${screen} après choix partiels : aucune réponse ni adaptation automatique`, () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.advance(299_000); h.session.toggleFeedbackCategory("pauses"); h.session.toggleFeedbackCategory("duration");
  if (screen === "detail") { h.session.continueFeedback(); h.advance(299_000); h.session.setFeedbackDetail("pauses", "short"); }
  h.advance(299_999); assert.equal(h.state().feedbackScreen, screen);
  h.advance(1); assert.equal(h.state().feedbackScreen, "close");
  assert.equal(h.state().feedbackReply, null); assert.equal(h.data.has("coachAntoineRestDuration"), false);
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions[0].response, null);
  assert.equal(readHistory(h.storage).history.length, 1);
});

test("sélections et précisions multiples retrouvées après réouverture sans changer le timeout", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.session.toggleFeedbackCategory("pauses"); h.session.toggleFeedbackCategory("difficulty");
  h.reopen(); assert.deepEqual(h.state().feedbackCategories, ["pauses", "difficulty"]);
  h.session.continueFeedback(); h.session.setFeedbackDetail("pauses", "short");
  const deadline = h.state().feedbackDeadline; h.advance(1000, false); h.reopen();
  assert.equal(h.state().feedbackDeadline, deadline); assert.equal(h.state().feedbackScreen, "detail");
  assert.deepEqual(h.state().feedbackDetails, { pauses: "short" });
  h.session.setFeedbackDetail("difficulty", "hard"); h.session.submitFeedback();
  assert.deepEqual(h.state().feedbackReply.answers, { pauses: "short", difficulty: "hard" });
});

test("retry d'un avis multiple : toutes les réponses conservées, un seul ajustement", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  for (const category of ["pauses", "duration", "difficulty"]) h.session.toggleFeedbackCategory(category);
  h.session.continueFeedback();
  h.session.setFeedbackDetail("pauses", "short"); h.session.setFeedbackDetail("duration", "long");
  h.session.setFeedbackDetail("difficulty", "hard");
  h.failures.add("coachAntoineRestDuration"); h.session.submitFeedback();
  assert.equal(h.state().feedbackScreen, "detail");
  h.failures.delete("coachAntoineRestDuration"); h.reopen(); h.session.save();
  assert.equal(h.state().restDuration, 20);
  assert.deepEqual(h.state().feedbackReply.answers, { pauses: "short", duration: "long", difficulty: "hard" });
  assert.equal(readHistory(h.storage).history.length, 1);
});

test("compatibilité : ancien avis exclusif et ancien écran de précision conservés", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  const draft = JSON.parse(h.data.get(DRAFT_KEY));
  delete draft.feedbackCategories; delete draft.feedbackDetails;
  draft.feedbackScreen = "detail"; draft.feedbackCategory = "duration";
  h.data.set(DRAFT_KEY, JSON.stringify(draft)); h.reopen();
  assert.equal(h.state().feedbackScreen, "detail"); assert.deepEqual(h.state().feedbackCategories, ["duration"]);
  const meta = JSON.parse(h.data.get(FEEDBACK_KEY));
  meta.sessions[0].response = { adapted: false, category: "pauses", value: "short", restDuration: 20, date: "2026-10-18T10:00:00Z" };
  h.data.set(FEEDBACK_KEY, JSON.stringify(meta)); h.reopen();
  assert.equal(h.state().feedbackScreen, "acknowledgement"); assert.equal(h.state().restDuration, 20);
  assert.equal(JSON.parse(h.data.get(FEEDBACK_KEY)).sessions.length, 1);
});

test("réponse du Coach : délai distinct de 7 secondes, sans transition prématurée ni réécriture", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.session.toggleFeedbackCategory("pauses"); h.session.toggleFeedbackCategory("duration");
  h.session.continueFeedback(); h.session.setFeedbackDetail("pauses", "short");
  h.session.setFeedbackDetail("duration", "long"); h.session.submitFeedback();
  assert.equal(h.state().feedbackScreen, "acknowledgement");
  assert.equal(h.state().feedbackDeadline, null);
  assert.ok(h.state().acknowledgementDeadline);
  const history = h.data.get(HISTORY_KEY), feedback = h.data.get(FEEDBACK_KEY);
  h.advance(6999); assert.equal(h.state().feedbackScreen, "acknowledgement");
  h.advance(1); assert.equal(h.state().feedbackScreen, "close");
  assert.equal(h.state().acknowledgementDeadline, null);
  assert.equal(h.data.get(HISTORY_KEY), history); assert.equal(h.data.get(FEEDBACK_KEY), feedback);
  assert.equal(h.data.get("coachAntoineRestDuration"), "20"); assert.deepEqual(h.sounds, ["finish"]);
});

test("délai de réponse paramétrable, indépendant du timeout de questionnaire", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1, END_FEEDBACK_TIMEOUT: 1000, FEEDBACK_ACKNOWLEDGEMENT_SECONDS: 2 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.session.toggleFeedbackCategory("difficulty"); h.session.continueFeedback();
  h.session.setFeedbackDetail("difficulty", "hard"); h.session.submitFeedback();
  h.advance(1000); assert.equal(h.state().feedbackScreen, "acknowledgement");
  h.advance(999); assert.equal(h.state().feedbackScreen, "acknowledgement");
  h.advance(1); assert.equal(h.state().feedbackScreen, "close");
});

test("réouverture pendant la réponse : échéance conservée, aucun nouveau délai ni doublon", () => {
  const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: 1 } });
  h.session.chooseDayForm("normal"); h.finish(); h.session.answer("no");
  h.session.toggleFeedbackCategory("duration"); h.session.continueFeedback();
  h.session.setFeedbackDetail("duration", "long"); h.session.submitFeedback();
  const deadline = h.state().acknowledgementDeadline;
  h.advance(2000, false); h.reopen();
  assert.equal(h.state().feedbackScreen, "acknowledgement"); assert.equal(h.state().acknowledgementDeadline, deadline);
  h.advance(5000, false); h.reopen();
  assert.equal(h.state().feedbackScreen, "close"); assert.equal(readHistory(h.storage).history.length, 1);
  assert.deepEqual(h.sounds, ["finish"]);
});

test("absence de feedback, OUI et timeout : congé directement sans attente de réponse", () => {
  for (const path of ["no-feedback", "yes", "timeout"]) {
    const h = setup({ config: { FEEDBACK_EVERY_N_SESSIONS: path === "no-feedback" ? 3 : 1 } });
    h.session.chooseDayForm("normal"); h.finish();
    if (path === "yes") h.session.answer("yes");
    if (path === "timeout") h.advance(WORKOUT_CONFIG.END_FEEDBACK_TIMEOUT);
    assert.equal(h.state().feedbackScreen, "close"); assert.equal(h.state().acknowledgementDeadline, null);
    assert.equal(readHistory(h.storage).history.length, 1);
    assert.equal(h.data.has("coachAntoineRestDuration"), false);
  }
});
