import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import * as completion from "../src/onboarding/completionSteps.js";
import { COMPLETION_MESSAGES } from "../src/onboarding/completionMessages.js";
import { getStopReasonLabel } from "../src/utils/personalizedTexts.js";
import { evaluateLevel } from "../src/onboarding/evaluateLevel.js";
import { getOnboardingState } from "../src/onboarding/onboardingState.js";
import { ONBOARDING_STEPS } from "../src/onboarding/steps.js";
import { createEmptyProfile, readProfile, updateProfile, PROFILE_KEY } from "../src/utils/userProfile.js";

const draft = (step = 18, mode = "tu") => ({ ...createEmptyProfile(), firstName: "Camille", age: 40,
  sex: "female", addressMode: mode, safetyConfirmed: true, assessmentAnswers: Array(9).fill("b"),
  assessmentDate: "2026-10-17T12:00:00Z", assessmentVersion: "1",
  proposedLevel: evaluateLevel(Array(9).fill("b")).proposedLevel,
  selectedLevel: "reprise", levelOrigin: "manual", onboardingCurrentStep: step,
  previousProgramExperience: step === 19 ? "stopped" : step === 20 ? "never" : null });
function storageWith(profile) {
  const data = new Map([[PROFILE_KEY, JSON.stringify(profile)]]);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function apply(profile, action, value) {
  const prepared = completion.prepareCompletionStep(profile, action, value);
  assert.equal(prepared.ok, true);
  const saved = updateProfile(prepared.changes, storageWith(profile));
  assert.equal(saved.status, "saved");
  return saved.profile;
}

for (const experience of ["current", "stopped", "never"]) {
  test(`expérience ${experience} : stockage, branche, niveaux inchangés et reprise`, () => {
    const profile = apply(draft(), "experience", experience);
    assert.equal(profile.previousProgramExperience, experience);
    assert.equal(profile.onboardingCurrentStep, experience === "stopped" ? 19 : 20);
    assert.equal(profile.onboardingCompleted, false);
    for (const key of ["selectedLevel", "proposedLevel", "levelOrigin", "assessmentAnswers", "assessmentDate"]) {
      assert.deepEqual(profile[key], draft()[key]);
    }
    const loaded = readProfile(storageWith(profile));
    assert.deepEqual(loaded.profile, profile);
    assert.equal(getOnboardingState(loaded).step.index, profile.onboardingCurrentStep);
  });
}

test("sept raisons : ordre et valeurs stables", () => {
  assert.deepEqual(completion.STOP_REASON_OPTIONS.map(({ value, label }) => [value, label]), [
    ["notSupportedEnough", "Je ne me sentais pas assez accompagné"],
    ["lackOfMotivation", "Je manquais de motivation"], ["tooDifficult", "C’était trop difficile"],
    ["tooLong", "C’était trop long"], ["tooRepetitive", "C’était trop répétitif"],
    ["preferNotToSay", "Je préfère ne pas répondre"], ["other", "Autre raison"],
  ]);
});

for (const reason of [...completion.STOP_REASON_OPTIONS.map((option) => option.value), null]) {
  test(`raison ${reason ?? "facultative"} : sauvegarde sans modifier le niveau`, () => {
    const profile = apply(draft(19), "reason", reason);
    assert.equal(profile.previousProgramStopReason, reason);
    assert.equal(profile.onboardingCurrentStep, 20);
    assert.equal(profile.selectedLevel, draft().selectedLevel);
    assert.equal(profile.proposedLevel, draft().proposedLevel);
    assert.equal(profile.onboardingCompleted, false);
  });
}

test("Retour conditionnel, conservation si stopped, effacement si current ou never", () => {
  const conclusion = apply(draft(19), "reason", "other");
  const reason = apply(conclusion, "back");
  assert.equal(reason.onboardingCurrentStep, 19);
  assert.equal(reason.previousProgramStopReason, "other");
  const experience = apply(reason, "back");
  assert.equal(experience.onboardingCurrentStep, 18);
  assert.equal(apply(experience, "experience", "stopped").previousProgramStopReason, "other");
  assert.equal(apply(experience, "back").onboardingCurrentStep, 17);
  for (const value of ["current", "never"]) {
    const changed = apply(experience, "experience", value);
    assert.equal(changed.previousProgramStopReason, null);
    assert.equal(apply(changed, "back").onboardingCurrentStep, 18);
  }
});

for (const step of [18, 19, 20]) {
  test(`interruption à l’étape ${step} : reprise exacte, aucune finalisation`, () => {
    const profile = { ...draft(step), previousProgramStopReason: step === 19 ? "tooLong" : null };
    const loaded = readProfile(storageWith(profile));
    const state = getOnboardingState(loaded);
    assert.deepEqual(loaded.profile, profile);
    assert.equal(state.step.index, step);
    assert.equal(state.isResuming, true);
    assert.equal(state.status, "incomplete");
  });
}

test("finalisation : validation Lot 1, âge adulte, confirmation et bilan cohérent obligatoires", () => {
  const invalid = [
    { firstName: " " }, { age: null }, { age: 17 }, { sex: null }, { addressMode: null },
    { equipment: ["chair"] }, { assessmentAnswers: Array(9).fill(null) },
    { assessmentAnswers: Array(9).fill("invalid") }, { assessmentDate: null },
    { assessmentVersion: "unknown" }, { proposedLevel: null }, { proposedLevel: "tonique" },
    { selectedLevel: null }, { levelOrigin: null }, { previousProgramExperience: null },
    { safetyConfirmed: false }, { profileVersion: 99 },
  ];
  for (const changes of invalid) {
    const profile = { ...draft(20), ...changes };
    assert.equal(completion.canCompleteOnboarding(profile), false, JSON.stringify(changes));
    assert.equal(completion.prepareCompletionStep(profile, "finish", "later").ok, false);
  }
  assert.equal(completion.prepareCompletionStep(draft(), "finish", "now").ok, false);
  assert.equal(completion.prepareCompletionStep(draft(19), "reason", "unknown").ok, false);
  assert.equal(completion.prepareCompletionStep(draft(18), "experience", "unknown").ok, false);
  assert.equal(completion.prepareCompletionStep({ ...draft(19), previousProgramExperience: "never" }, "reason", null).ok, false);
});

const code = buildSync({ entryPoints: ["src/components/onboarding/CompletionSteps.jsx"], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom",
    "../../context/UserProfileContext", "../../onboarding/completionMessages", "../../onboarding/completionSteps"],
}).outputFiles[0].text;

// Vrais composants, transitions et stockage ; hooks et navigation isolés en mémoire.
function setup(initial = draft()) {
  const storage = storageWith(initial);
  let profile = initial, tree, cells = [], index = 0, lastStep, saves = 0;
  const navigations = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef(value) { const i = index++; return cells[i] ??= { current: value }; },
    useState(value) { const i = index++; if (!(i in cells)) cells[i] = value;
      return [cells[i], (next) => { cells[i] = next; }]; },
  };
  const context = { useUserProfile: () => ({ profile, updateUserProfile(changes) {
    saves += 1;
    const saved = updateProfile(changes, storage);
    if (saved.status === "saved") profile = saved.profile;
    return saved;
  } }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => {
    if (name === "react") return react;
    if (name === "react-router-dom") return { useNavigate: () => (to, options) => navigations.push({ to, ...options }) };
    if (name.includes("UserProfileContext")) return context;
    if (name.includes("completionMessages")) return { COMPLETION_MESSAGES };
    if (name.includes("completionSteps")) return completion;
    throw Error(name);
  } });
  const text = (node) => node === null || node === undefined || typeof node === "boolean" ? "" :
    typeof node !== "object" ? String(node) : node.props.children.map(text).join("");
  const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...node.props.children.flatMap(nodes)];
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: node.props.children.flat(Infinity).map(expand) } };
  }
  function render() {
    if (profile.onboardingCurrentStep !== lastStep) { cells = []; lastStep = profile.onboardingCurrentStep; }
    index = 0;
    tree = expand(react.createElement(module.exports.default, { step: ONBOARDING_STEPS[profile.onboardingCurrentStep] }));
  }
  function button(label) {
    const found = nodes(tree).find((node) => node.type === "button" && text(node) === label);
    assert.ok(found, `bouton ${label}`); return found;
  }
  const click = (label) => { button(label).props.onClick(); render(); };
  render();
  return { storage, navigations, render, click, button, text: () => text(tree),
    labels: () => nodes(tree).filter((node) => node.type === "button").map(text),
    profile: () => readProfile(storage).profile, saves: () => saves };
}

for (const mode of ["tu", "vous"]) {
  for (const option of completion.STOP_REASON_OPTIONS) {
    test(`réaction ${mode} pour ${option.value} : sauvegarde puis message avant conclusion`, () => {
      const ui = setup(draft(19, mode));
      const label = getStopReasonLabel(option, draft(19, mode));
      ui.click(label);
      const expected = option.value === "preferNotToSay"
        ? "Bien sûr, aucun problème." : "Merci de me l’avoir dit. Je vais essayer d’en tenir compte.";
      assert.ok(ui.text().includes(expected));
      assert.doesNotMatch(ui.text(), /Je (?:te|vous) connais déjà un peu mieux/);
      assert.equal(ui.profile().previousProgramStopReason, option.value);
      assert.equal(ui.profile().onboardingCurrentStep, 19);
      assert.equal(ui.profile().onboardingCompleted, false);
      assert.deepEqual(ui.labels(), ["Continuer", "Retour"]);
      const resumed = setup(ui.profile());
      assert.equal(resumed.profile().previousProgramStopReason, option.value);
      assert.ok(resumed.labels().includes(label));
      ui.click("Retour");
      assert.ok(ui.labels().includes(label));
      ui.click(label);
      ui.click("Continuer");
      assert.equal(ui.profile().onboardingCurrentStep, 20);
      assert.ok(ui.text().includes(`Je ${mode === "vous" ? "vous" : "te"} connais déjà un peu mieux, Camille.`));
    });
  }
  test(`écrans ${mode} : expérience, raisons, prénom et conclusion exacte`, () => {
    const ui = setup(draft(18, mode));
    assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].experience));
    assert.deepEqual(ui.labels(), [...completion.EXPERIENCE_OPTIONS.map((option) => option.label), "Retour"]);
    ui.click("Oui, mais j’ai arrêté");
    COMPLETION_MESSAGES[mode].reason.forEach((text) => assert.ok(ui.text().includes(text)));
    assert.deepEqual(ui.labels(), [...completion.STOP_REASON_OPTIONS.map((option) => getStopReasonLabel(option, draft(19, mode))), "Passer cette question", "Retour"]);
    ui.click("Autre raison");
    ui.click("Continuer");
    COMPLETION_MESSAGES[mode].conclusion("Camille").forEach((text) => assert.ok(ui.text().includes(text)));
    assert.equal(ui.profile().previousProgramStopReason, "other");
    assert.equal(ui.profile().onboardingCompleted, false);
    assert.deepEqual(ui.labels(), ["Oui, c’est parti !", "Pas maintenant", "Retour"]);
  });
}

test("écran raison facultative et Retour : effacement après modification de l’expérience", () => {
  const ui = setup(draft(19));
  ui.click("Je préfère ne pas répondre");
  assert.equal(ui.profile().previousProgramStopReason, "preferNotToSay");
  ui.click("Retour"); ui.click("Passer cette question");
  assert.equal(ui.profile().previousProgramStopReason, null);
  ui.click("Retour"); ui.click("C’était trop long"); ui.click("Continuer"); ui.click("Retour"); ui.click("Retour");
  ui.click("Oui, et je l’utilise encore");
  assert.equal(ui.profile().previousProgramStopReason, null);
  assert.equal(ui.profile().onboardingCurrentStep, 20);
});

for (const [label, destination] of [["Pas maintenant", "/"], ["Oui, c’est parti !", "/seances"]]) {
  test(`${label} : sauvegarde réelle puis navigation, rechargement complet et double clic verrouillé`, () => {
    const ui = setup(draft(20));
    const handler = ui.button(label).props.onClick;
    handler(); handler();
    assert.equal(ui.saves(), 1);
    assert.deepEqual(ui.navigations, [{ to: destination, replace: true }]);
    assert.equal(ui.profile().onboardingCompleted, true);
    const state = getOnboardingState(readProfile(ui.storage));
    assert.equal(state.status, "complete");
    assert.notEqual(state.isResuming, true);
  });
}

test("échec d’écriture : aucune sortie ni finalisation, nouvelle tentative possible", () => {
  const ui = setup(draft(20));
  const write = ui.storage.setItem;
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.click("Pas maintenant");
  assert.equal(ui.profile().onboardingCompleted, false);
  assert.deepEqual(ui.navigations, []);
  assert.ok(ui.text().includes("n’a pas pu être enregistrée"));
  ui.storage.setItem = write;
  ui.click("Pas maintenant");
  assert.equal(ui.profile().onboardingCompleted, true);
  assert.equal(ui.navigations[0].to, "/");
});

test("échec de sauvegarde de la raison : aucun remerciement sans réponse enregistrée", () => {
  const ui = setup(draft(19));
  const write = ui.storage.setItem;
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.click("Autre raison");
  assert.equal(ui.profile().previousProgramStopReason, null);
  assert.doesNotMatch(ui.text(), /Merci de me l’avoir dit/);
  assert.ok(ui.labels().includes("Autre raison"));
  ui.storage.setItem = write;
  ui.click("Autre raison");
  assert.ok(ui.text().includes("Merci de me l’avoir dit. Je vais essayer d’en tenir compte."));
});

test("conclusion invalide : pas de promesse ni de bouton de finalisation", () => {
  const ui = setup({ ...draft(20), age: 17 });
  assert.deepEqual(ui.labels(), ["Retour"]);
  assert.ok(ui.text().includes("complet et valide"));
  assert.doesNotMatch(ui.text(), /Je (?:te|vous) connais déjà un peu mieux, Camille/);
  assert.equal(ui.saves(), 0);
});

for (const mode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
  test(`onboarding ${mode}/${sex} : accord utilisateur et demande de retour`, () => {
    const ui = setup({ ...draft(19, mode), sex });
    const label = sex === "female" ? "Je ne me sentais pas assez accompagnée" : "Je ne me sentais pas assez accompagné";
    assert.ok(ui.labels().includes(label));
    ui.click(label);
    assert.equal(ui.profile().previousProgramStopReason, "notSupportedEnough");
    const incomplete = setup({ ...draft(20, mode), sex, age: 17 });
    assert.ok(incomplete.text().includes(mode === "vous"
      ? "Revenez aux étapes précédentes pour le compléter."
      : "Reviens aux étapes précédentes pour le compléter."));
  });
}

test("aucune nouvelle clé, historique et réglages préservés lors de la finalisation", () => {
  const ui = setup(draft(20));
  const keys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm", "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  keys.forEach((key) => ui.storage.data.set(key, "unchanged"));
  ui.click("Pas maintenant");
  keys.forEach((key) => assert.equal(ui.storage.getItem(key), "unchanged"));
  assert.deepEqual([...ui.storage.data.keys()].sort(), [...keys, PROFILE_KEY].sort());
});
