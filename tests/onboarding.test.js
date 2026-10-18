import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ONBOARDING_STEPS } from "../src/onboarding/steps.js";
import { QUESTIONS } from "../src/onboarding/questions.js";
import { prepareCompletionStep } from "../src/onboarding/completionSteps.js";
import { getOnboardingState } from "../src/onboarding/onboardingState.js";
import * as profiles from "../src/utils/userProfile.js";

const require = createRequire(import.meta.url);

function storageWith(profile) {
  const data = new Map(profile === undefined ? [] : [[profiles.PROFILE_KEY, JSON.stringify(profile)]]);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function completedProfile() {
  return { ...profiles.createEmptyProfile(), firstName: "Alex", age: 40, sex: "female",
    addressMode: "vous", proposedLevel: "reprise", selectedLevel: "reprise", levelOrigin: "coach",
    assessmentAnswers: Array(9).fill("b"), assessmentDate: "2026-10-17T10:00:00Z",
    assessmentVersion: "1", previousProgramExperience: "never", onboardingCompleted: true };
}

const stateFrom = (storage) => getOnboardingState(profiles.readProfile(storage));

test("séquence V1 stable : sexe avant prénom, neuf questions, fin et abandon conditionnel", () => {
  assert.deepEqual(ONBOARDING_STEPS.map((step) => step.id), [
    "introduction", "getting-to-know", "sex", "first-name", "age", "safety", "equipment",
    "assessment-introduction", ...Array.from({ length: 9 }, (_, i) => `assessment-q${i + 1}`),
    "level-proposal", "previous-experience", "stop-reason", "finish",
  ]);
  assert.equal(ONBOARDING_STEPS.length, 21);
  ONBOARDING_STEPS.forEach((step, index) => {
    assert.equal(step.index, index);
    assert.ok(Object.isFrozen(step));
  });
  assert.equal(ONBOARDING_STEPS[19].condition, "stopped");
});

test("chargement, absence et brouillon : pas de profil créé automatiquement", () => {
  assert.equal(getOnboardingState({ status: "loading", profile: null }).status, "loading");
  const storage = storageWith();
  const absent = stateFrom(storage);
  assert.equal(absent.status, "absent");
  assert.equal(absent.isResuming, false);
  assert.equal(absent.step.index, 0);
  assert.equal(storage.data.size, 0);
  assert.equal(stateFrom(storageWith(profiles.createEmptyProfile())).status, "incomplete");
});

test("reprise de chaque étape enregistrée sans perte de réponses", () => {
  for (const step of ONBOARDING_STEPS) {
    const profile = { ...profiles.createEmptyProfile(), firstName: "Alex", onboardingCurrentStep: step.index,
      assessmentAnswers: ["a", "b", ...Array(7).fill(null)] };
    const storage = storageWith(profile);
    const before = storage.getItem(profiles.PROFILE_KEY);
    const state = stateFrom(storage);
    assert.equal(state.status, "incomplete");
    assert.equal(state.isResuming, step.index > 0);
    assert.equal(state.step.id, step.id);
    assert.deepEqual(state.profile, profile);
    assert.equal(storage.getItem(profiles.PROFILE_KEY), before);
  }
});

test("profil terminé : accès normal ; aucune dépendance aux anciennes clés", () => {
  const storage = storageWith(completedProfile());
  assert.equal(stateFrom(storage).status, "complete");
  const oldKeys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm",
    "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  for (const key of oldKeys) storage.data.set(key, "unchanged");
  storage.data.delete(profiles.PROFILE_KEY);
  assert.equal(stateFrom(storage).status, "absent");
  for (const key of oldKeys) assert.equal(storage.data.get(key), "unchanged");
});

for (const [name, raw, expected] of [
  ["JSON corrompu", "{bad", "invalid"],
  ["profil invalide", "{}", "invalid"],
  ["version incompatible", JSON.stringify({ ...profiles.createEmptyProfile(), profileVersion: 2 }), "unsupported-version"],
  ["étape inconnue", JSON.stringify({ ...profiles.createEmptyProfile(), onboardingCurrentStep: 99 }), "invalid-step"],
]) {
  test(`${name} : état explicite, données conservées`, () => {
    const storage = storageWith();
    storage.data.set(profiles.PROFILE_KEY, raw);
    assert.equal(stateFrom(storage).status, expected);
    assert.equal(storage.getItem(profiles.PROFILE_KEY), raw);
  });
}

test("stockage absent ou lecture refusée : indisponible", () => {
  assert.equal(stateFrom(null).status, "unavailable");
  assert.equal(stateFrom({ getItem() { throw Error("denied"); } }).status, "unavailable");
});

// Compilation des composants en mémoire : aucune dépendance de test ajoutée.
const uiCode = buildSync({
  stdin: { contents: 'export { AppRoutes } from "./src/App.jsx"; export { UserProfileContext } from "./src/context/UserProfileContext.jsx"; export { default as SplashScreen } from "./src/components/SplashScreen.jsx";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
  define: { "import.meta.env.BASE_URL": JSON.stringify("/Coach-Antoine-V8.0-Alpha-Build-004.11/") },
}).outputFiles[0].text;

function renderRoutes(state, route = "/", basename = "/") {
  const module = { exports: {} };
  vm.runInNewContext(uiCode, { module, require, localStorage: { getItem: () => null } });
  const { AppRoutes, UserProfileContext } = module.exports;
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [route], basename },
    React.createElement(UserProfileContext.Provider, { value: { onboarding: state, profile: state.profile, reloadProfile() {} } },
      React.createElement(AppRoutes, { soundEnabled: false, setSoundEnabled() {} }))));
}

for (const route of ["/", "/seances", "/progression", "/carnet", "/coach", "/garage", "/presence", "/onboarding"]) {
  test(`route ${route} bloquée sans onboarding terminé`, () => {
    const html = renderRoutes(stateFrom(storageWith()), route);
    assert.match(html, /Faisons connaissance/);
    assert.match(html, /data-onboarding-status="absent"/);
    assert.doesNotMatch(html, /bottom-nav|Commencer la séance|Comment vous sentez-vous/);
  });
}

test("le questionnaire reprend la question mémorisée sans afficher les étapes suivantes", () => {
  const html = renderRoutes(stateFrom(storageWith({ ...profiles.createEmptyProfile(), onboardingCurrentStep: 10 })), "/seances");
  assert.match(html, /data-onboarding-resuming="true"/);
  assert.ok(html.includes(QUESTIONS[2].text));
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /Question 3 sur 9/);
  assert.doesNotMatch(html, /<input|<select|Terminer/);
});

for (const status of ["loading", "invalid", "unsupported-version", "unavailable", "invalid-step"]) {
  test(`rendu explicite pour ${status}, sans accès aux pages normales`, () => {
    const html = renderRoutes({ status, profile: null }, "/seances");
    assert.match(html, new RegExp(`data-onboarding-status="${status}"`));
    assert.match(html, status === "loading" ? /Chargement du profil/ : /role="alert"/);
    assert.doesNotMatch(html, /bottom-nav/);
  });
}

for (const [route, expected] of [["/", "Programme du jour"], ["/seances", "Comment vous sentez-vous"],
  ["/progression", "Historique récent"], ["/carnet", "LE CARNET DU COACH"], ["/coach", "Réglages"]]) {
  test(`profil terminé : route ${route} préservée`, () => {
    const html = renderRoutes(stateFrom(storageWith(completedProfile())), route);
    assert.ok(html.includes(expected));
    assert.match(html, /bottom-nav/);
    assert.doesNotMatch(html, /Faisons connaissance/);
  });
}

test("garde compatible avec le sous-chemin Vite", () => {
  const base = "/Coach-Antoine-V8.0-Alpha-Build-004.11";
  assert.match(renderRoutes(stateFrom(storageWith()), `${base}/seances`, base), /Faisons connaissance/);
  assert.match(renderRoutes(stateFrom(storageWith(completedProfile())), `${base}/seances`, base), /Comment vous sentez-vous/);
});

for (const [choice, expected] of [["later", "Programme du jour"], ["now", "Comment vous sentez-vous"]]) {
  test(`sortie ${choice} : profil réellement finalisé, destination accessible après relecture`, () => {
    const profile = { ...completedProfile(), proposedLevel: "forme", selectedLevel: "forme",
      safetyConfirmed: true, onboardingCurrentStep: 20, onboardingCompleted: false };
    const storage = storageWith(profile);
    const result = prepareCompletionStep(profile, "finish", choice);
    assert.equal(result.ok, true);
    assert.equal(profiles.updateProfile(result.changes, storage).status, "saved");
    const state = stateFrom(storage);
    assert.equal(state.status, "complete");
    const html = renderRoutes(state, result.destination);
    assert.ok(html.includes(expected));
    assert.match(html, /bottom-nav/);
    assert.doesNotMatch(html, /Faisons connaissance/);
    if (choice === "now") {
      for (const text of ["Petite forme", "En forme", "Pleine forme"]) assert.ok(html.includes(text));
      assert.doesNotMatch(html, /Suivant/);
    }
    assert.match(renderRoutes(stateFrom(storage), "/"), /Programme du jour/);
  });
}

// Petit exécuteur de hooks pour vérifier les effets et mises à jour du provider.
// La validation/persistance réelle du lot 1 est injectée, pas réimplémentée.
function providerHarness(storage) {
  const hooks = [], effects = [];
  let index = 0, value;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    createContext: () => ({ Provider: "provider" }),
    createElement: (type, props) => ({ type, props }),
    useState(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (next) => { hooks[i] = next; }];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useCallback(fn, deps) {
      const i = index++;
      if (!hooks[i] || !same(hooks[i].deps, deps)) hooks[i] = { deps, fn };
      return hooks[i].fn;
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!hooks[i] || !same(hooks[i], deps)) { hooks[i] = deps; effects.push(fn); }
    },
  };
  const code = buildSync({ entryPoints: ["src/context/UserProfileContext.jsx"], bundle: true, write: false,
    platform: "node", format: "cjs", external: ["react", "../utils/userProfile", "../onboarding/onboardingState"] }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => name === "react" ? react :
    name.includes("userProfile") ? profiles : { getOnboardingState } });
  const render = () => {
    index = 0;
    value = module.exports.UserProfileProvider({ storage, children: null }).props.value;
    return value;
  };
  return { render, flush() { while (effects.length) effects.shift()(); return render(); } };
}

test("provider : chargement, création explicite, mise à jour partielle et relecture", () => {
  const storage = storageWith();
  const harness = providerHarness(storage);
  assert.equal(harness.render().onboarding.status, "loading");
  let context = harness.flush();
  assert.equal(context.onboarding.status, "absent");
  assert.equal(storage.data.size, 0);
  assert.equal(context.updateUserProfile({ firstName: "Alex", onboardingCurrentStep: 3 }).status, "saved");
  context = harness.render();
  assert.equal(context.profile.firstName, "Alex");
  assert.equal(context.onboarding.step.index, 3);
  assert.equal(context.onboarding.isResuming, false);
  context.updateUserProfile({ age: 40 });
  context = harness.render();
  assert.equal(context.profile.firstName, "Alex");
  assert.equal(context.profile.age, 40);
  context.reloadProfile();
  context = harness.render();
  assert.equal(context.onboarding.step.index, 3);
  assert.equal(context.onboarding.isResuming, false);
});

test("nouveau parcours sauvegardé : reprise seulement à l'utilisation suivante", () => {
  const storage = storageWith();
  const firstUse = providerHarness(storage);
  firstUse.render();
  let context = firstUse.flush();
  assert.equal(context.onboarding.isResuming, false);
  context.updateUserProfile({ firstName: "Alex", onboardingCurrentStep: 5 });
  context = firstUse.render();
  assert.equal(context.onboarding.isResuming, false);
  context.reloadProfile();
  assert.equal(firstUse.render().onboarding.isResuming, false);

  const nextUse = providerHarness(storage);
  nextUse.render();
  context = nextUse.flush();
  assert.equal(context.onboarding.step.index, 5);
  assert.equal(context.onboarding.isResuming, true);
  assert.equal(context.profile.firstName, "Alex");
});

test("profil chargé à l'étape 0 : avancer et relire ne constitue pas une reprise", () => {
  const storage = storageWith(profiles.createEmptyProfile());
  const harness = providerHarness(storage);
  harness.render();
  let context = harness.flush();
  assert.equal(context.onboarding.isResuming, false);
  context.updateUserProfile({ onboardingCurrentStep: 6 });
  context = harness.render();
  assert.equal(context.onboarding.isResuming, false);
  context.reloadProfile();
  assert.equal(harness.render().onboarding.isResuming, false);
});

test("reprise réelle conservée après mise à jour, échec et relecture ; jamais à l'étape 0", () => {
  const storage = storageWith({ ...profiles.createEmptyProfile(), onboardingCurrentStep: 3 });
  const harness = providerHarness(storage);
  harness.render();
  let context = harness.flush();
  assert.equal(context.onboarding.isResuming, true);
  context.updateUserProfile({ onboardingCurrentStep: 4 });
  context = harness.render();
  assert.equal(context.onboarding.isResuming, true);
  context.reloadProfile();
  context = harness.render();
  assert.equal(context.onboarding.isResuming, true);
  storage.setItem = () => { throw Error("quota"); };
  assert.equal(context.updateUserProfile({ age: 40 }).status, "unavailable");
  context = harness.render();
  assert.equal(context.onboarding.isResuming, true);
  storage.setItem = (key, value) => storage.data.set(key, value);
  context.updateUserProfile({ onboardingCurrentStep: 0 });
  context = harness.render();
  assert.equal(context.onboarding.isResuming, false);
  context.reloadProfile();
  assert.equal(harness.render().onboarding.isResuming, false);
});

test("provider : échec d'écriture signalé sans succès ni perte du brouillon", () => {
  const storage = storageWith({ ...profiles.createEmptyProfile(), firstName: "Alex" });
  const harness = providerHarness(storage);
  harness.render();
  let context = harness.flush();
  storage.setItem = () => { throw Error("quota"); };
  assert.equal(context.updateUserProfile({ age: 40 }).status, "unavailable");
  context = harness.render();
  assert.equal(context.saveError, "unavailable");
  assert.equal(context.profile.firstName, "Alex");
  assert.equal(context.profile.age, null);
  assert.equal(context.onboarding.status, "incomplete");
});

test("provider : un profil corrompu n'est jamais remplacé par un brouillon", () => {
  const storage = storageWith();
  storage.data.set(profiles.PROFILE_KEY, "{bad");
  const harness = providerHarness(storage);
  harness.render();
  const context = harness.flush();
  assert.equal(context.onboarding.status, "invalid");
  assert.equal(context.updateUserProfile({ firstName: "Alex" }).status, "invalid");
  assert.equal(storage.getItem(profiles.PROFILE_KEY), "{bad");
});

test("provider : profil terminé et nouvelle lecture reflétés immédiatement", () => {
  const storage = storageWith(profiles.createEmptyProfile());
  const harness = providerHarness(storage);
  harness.render();
  let context = harness.flush();
  assert.equal(context.updateUserProfile(completedProfile()).status, "saved");
  context = harness.render();
  assert.equal(context.onboarding.status, "complete");
  storage.data.set(profiles.PROFILE_KEY, "{bad");
  context.reloadProfile();
  assert.equal(harness.render().onboarding.status, "invalid");
  storage.data.set(profiles.PROFILE_KEY, JSON.stringify({ ...profiles.createEmptyProfile(), onboardingCurrentStep: 6 }));
  harness.render().reloadProfile();
  context = harness.render();
  assert.equal(context.onboarding.status, "incomplete");
  assert.equal(context.onboarding.step.id, "equipment");
});

test("splash neutre : aucun prénom supposé ni salutation genrée", () => {
  const module = { exports: {} };
  // Fige uniquement l'avancement visuel du splash à sa dernière ligne.
  const react = { ...React, useState: (initial) => [initial === 0 ? 2 : initial, () => {}] };
  vm.runInNewContext(uiCode, { module, require: (name) => name === "react" ? react : require(name) });
  const html = renderToStaticMarkup(React.createElement(module.exports.SplashScreen, { onDone() {}, soundEnabled: false }));
  assert.match(html, /Bienvenue !/);
  assert.match(html, /Un moment pour bouger/);
  assert.doesNotMatch(html, /Bonjour Antoine|Prêt/);
});
