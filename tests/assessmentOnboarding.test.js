import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import * as assessment from "../src/onboarding/assessmentSteps.js";
import { ASSESSMENT_MESSAGES } from "../src/onboarding/assessmentMessages.js";
import { QUESTIONS, QUESTIONNAIRE_VERSION } from "../src/onboarding/questions.js";
import { evaluateLevel } from "../src/onboarding/evaluateLevel.js";
import { ONBOARDING_STEPS } from "../src/onboarding/steps.js";
import { createEmptyProfile, readProfile, updateProfile, PROFILE_KEY } from "../src/utils/userProfile.js";

const date = "2026-10-17T12:00:00.000Z";
const draft = (step = 5, mode = "tu") => ({ ...createEmptyProfile(), firstName: "Alex", age: 40,
  sex: "female", addressMode: mode, safetyConfirmed: step > 5, onboardingCurrentStep: step });
function storageWith(profile) {
  const data = new Map([[PROFILE_KEY, JSON.stringify(profile)]]);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function apply(profile, action, value, at = date) {
  const result = assessment.prepareAssessmentStep(profile, action, value, at);
  assert.equal(result.ok, true, result.error);
  const storage = storageWith(profile);
  const saved = updateProfile(result.changes, storage);
  assert.equal(saved.status, "saved");
  return saved.profile;
}
function proposal(answers = Array(9).fill("a"), mode = "tu") {
  let profile = { ...draft(8, mode) };
  for (let i = 0; i < QUESTIONS.length; i += 1) profile = apply(profile, "answer", { questionId: QUESTIONS[i].id, value: answers[i] });
  return profile;
}

test("sécurité obligatoire : confirmation booléenne, aucune donnée médicale détaillée", () => {
  for (const value of [false, null, undefined, "true"]) assert.equal(assessment.prepareAssessmentStep(draft(), "safety", value).ok, false);
  assert.equal(assessment.prepareAssessmentStep({ ...draft(), age: 17 }, "safety", true).ok, false);
  const profile = apply(draft(), "safety", true);
  assert.equal(profile.safetyConfirmed, true);
  assert.equal(profile.onboardingCurrentStep, 6);
  assert.equal(profile.onboardingCompleted, false);
  assert.deepEqual(Object.keys(profile).filter((key) => !Object.hasOwn(createEmptyProfile(), key)), ["safetyConfirmed"]);
  assert.equal(assessment.prepareAssessmentStep(draft(6), "equipment", []).ok, true);
  assert.equal(assessment.prepareAssessmentStep({ ...draft(6), safetyConfirmed: false }, "equipment", []).ok, false);
});

test("matériel : aucun, un, plusieurs et exclusivité bidirectionnelle", () => {
  let equipment = assessment.toggleEquipment([], "dumbbells", true);
  assert.deepEqual(equipment, ["dumbbells"]);
  equipment = assessment.toggleEquipment(equipment, "resistanceBands", true);
  assert.deepEqual(equipment, ["dumbbells", "resistanceBands"]);
  equipment = assessment.toggleEquipment(equipment, "longBar", true);
  assert.deepEqual(equipment, ["dumbbells", "longBar", "resistanceBands"]);
  assert.deepEqual(assessment.toggleEquipment(equipment, "none", true), []);
  assert.deepEqual(assessment.toggleEquipment([], "longBar", true), ["longBar"]);
  assert.deepEqual(assessment.toggleEquipment(["longBar"], "longBar", false), []);
  assert.equal(assessment.toggleEquipment([], "chair", true), null);
  assert.deepEqual(apply(draft(6), "equipment", []).equipment, []);
  assert.deepEqual(apply(draft(6), "equipment", ["dumbbells", "longBar"]).equipment, ["dumbbells", "longBar"]);
  for (const invalid of [["none"], ["chair"], ["wall"], ["dumbbells", "dumbbells"], null]) {
    assert.equal(assessment.prepareAssessmentStep(draft(6), "equipment", invalid).ok, false);
  }
});

test("réponses progressives : neuf cases, anciennes réponses conservées, calcul seulement après Q9", () => {
  let profile = draft(8);
  for (let i = 0; i < 9; i += 1) {
    profile = apply(profile, "answer", { questionId: QUESTIONS[i].id, value: "b" });
    assert.equal(profile.assessmentAnswers.length, 9);
    assert.deepEqual(profile.assessmentAnswers, [...Array(i + 1).fill("b"), ...Array(8 - i).fill(null)]);
    assert.equal(profile.onboardingCurrentStep, i < 8 ? 9 + i : 17);
    assert.equal(profile.onboardingCompleted, false);
    if (i < 8) assert.equal(profile.proposedLevel, null);
  }
  assert.equal(profile.proposedLevel, evaluateLevel(Array(9).fill("b")).proposedLevel);
  assert.equal(profile.proposedLevel, "forme");
  assert.equal(profile.assessmentDate, date);
  assert.equal(profile.assessmentVersion, QUESTIONNAIRE_VERSION);
  assert.equal(profile.selectedLevel, null);
});

for (const [answers, level] of [["ccccccccc", "reprise"], ["bbbbbbbbb", "forme"], ["aaaaaaaaa", "tonique"], ["aabcaaaaa", "reprise"]]) {
  test(`calcul réel de evaluateLevel pour ${answers} : ${level}`, () => {
    const profile = proposal([...answers]);
    assert.equal(profile.proposedLevel, level);
    assert.deepEqual(assessment.getAssessmentProposal(profile), evaluateLevel([...answers]));
  });
}

test("Retour sans effacement, puis modification après calcul : invalidation et nouveau calcul", () => {
  let profile = apply(proposal(), "acceptCoach");
  assert.equal(profile.selectedLevel, "tonique");
  profile = apply(profile, "back");
  assert.equal(profile.onboardingCurrentStep, 17);
  profile = apply(profile, "back");
  assert.equal(profile.onboardingCurrentStep, 16);
  assert.deepEqual(profile.assessmentAnswers, Array(9).fill("a"));
  profile = apply(profile, "answer", { questionId: "q9", value: "c" }, "2026-10-17T13:00:00.000Z");
  assert.equal(profile.proposedLevel, "forme");
  assert.equal(profile.assessmentDate, "2026-10-17T13:00:00.000Z");
  assert.equal(profile.selectedLevel, null);
  assert.equal(profile.levelOrigin, null);
  while (profile.onboardingCurrentStep > 8) profile = apply(profile, "back");
  profile = apply(profile, "answer", { questionId: "q1", value: "c" });
  for (const key of ["proposedLevel", "selectedLevel", "levelOrigin", "assessmentDate", "assessmentVersion"]) assert.equal(profile[key], null);
  assert.equal(profile.assessmentAnswers[0], "c");
  assert.equal(profile.assessmentAnswers[8], "c");
});

test("proposition périmée ou incomplète : aucune acceptation silencieuse", () => {
  const profile = proposal();
  for (const broken of [
    { ...profile, proposedLevel: "reprise" },
    { ...profile, assessmentVersion: "unknown" },
    { ...profile, assessmentDate: null },
    { ...profile, assessmentAnswers: Array(9).fill(null) },
  ]) {
    assert.equal(assessment.getAssessmentProposal(broken), null);
    assert.equal(assessment.prepareAssessmentStep(broken, "acceptCoach").ok, false);
  }
});

test("acceptation Coach ou choix manuel, même identique, jamais de complétion", () => {
  const profile = proposal();
  const accepted = apply(profile, "acceptCoach");
  assert.equal(accepted.selectedLevel, "tonique");
  assert.equal(accepted.levelOrigin, "coach");
  assert.equal(accepted.onboardingCurrentStep, 18);
  for (const level of ["reprise", "forme", "tonique"]) {
    const manual = apply(profile, "manualLevel", level);
    assert.equal(manual.selectedLevel, level);
    assert.equal(manual.levelOrigin, "manual");
    assert.equal(manual.proposedLevel, "tonique");
    assert.equal(manual.onboardingCurrentStep, 18);
    assert.equal(manual.onboardingCompleted, false);
  }
  assert.equal(assessment.prepareAssessmentStep(profile, "manualLevel", "unknown").ok, false);
});

test("relecture au matériel, en questionnaire et sur la proposition : données inchangées", () => {
  const equipment = apply(draft(6), "equipmentDraft", ["dumbbells", "resistanceBands"]);
  let partial = apply(draft(8), "answer", { questionId: "q1", value: "b" });
  partial = apply(partial, "answer", { questionId: "q2", value: "c" });
  for (const profile of [equipment, partial, proposal()]) {
    assert.deepEqual(readProfile(storageWith(profile)).profile, profile);
  }
});

test("réponse inconnue, hors ordre ou bilan incomplet : aucune réponse inventée", () => {
  const original = draft(8);
  for (const answer of [null, { questionId: "q1", value: "d" }, { questionId: "q2", value: "a" }]) {
    assert.equal(assessment.prepareAssessmentStep(original, "answer", answer).ok, false);
  }
  assert.equal(assessment.prepareAssessmentStep(draft(16), "answer", { questionId: "q9", value: "a" }).ok, false);
  assert.deepEqual(original, draft(8));
});

const code = buildSync({ entryPoints: ["src/components/onboarding/AssessmentSteps.jsx"], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["react", "../../context/UserProfileContext",
    "../../onboarding/questions", "../../onboarding/assessmentMessages", "../../onboarding/assessmentSteps"],
}).outputFiles[0].text;

function setup(initial = draft()) {
  const storage = storageWith(initial);
  let profile = initial, tree, cells = new Map(), active, index, lastStep, lastResult;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(value) {
      const bucket = cells.get(active) || [];
      cells.set(active, bucket);
      const i = index++;
      if (!(i in bucket)) bucket[i] = typeof value === "function" ? value() : value;
      return [bucket[i], (next) => { bucket[i] = typeof next === "function" ? next(bucket[i]) : next; }];
    },
  };
  const context = { useUserProfile: () => ({ profile, updateUserProfile(changes) {
    lastResult = updateProfile(changes, storage);
    if (lastResult.status === "saved") profile = lastResult.profile;
    return lastResult;
  } }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => {
    if (name === "react") return react;
    if (name.includes("UserProfileContext")) return context;
    if (name.endsWith("/questions")) return { QUESTIONS };
    if (name.includes("assessmentMessages")) return { ASSESSMENT_MESSAGES };
    if (name.includes("assessmentSteps")) return assessment;
    throw Error(name);
  } });
  function expand(node, path = "root") {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return expand({ type: "fragment", props: { children: node } }, path);
    if (typeof node.type === "function") {
      active = `${path}/${node.type.name}`; index = 0;
      return expand(node.type(node.props), active);
    }
    return { ...node, props: { ...node.props, children: node.props.children.flat(Infinity).map((child, i) => expand(child, `${path}/${i}`)) } };
  }
  const text = (node) => node === null || node === undefined || typeof node === "boolean" ? "" :
    typeof node !== "object" ? String(node) : node.props.children.map(text).join("");
  const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...node.props.children.flatMap(nodes)];
  function render() {
    const step = ONBOARDING_STEPS[profile.onboardingCurrentStep];
    if (lastStep !== step.id) { cells = new Map(); lastStep = step.id; }
    tree = module.exports.ASSESSMENT_STEP_IDS.includes(step.id)
      ? expand(react.createElement(module.exports.default, { step })) : null;
  }
  function button(label) {
    const node = nodes(tree).find((item) => item.type === "button" && text(item) === label);
    assert.ok(node, `bouton ${label}`); return node;
  }
  function click(label) { const node = button(label); assert.ok(!node.props.disabled); node.props.onClick(); render(); }
  function check(label, checked) {
    const node = nodes(tree).find((item) => item.type === "label" && text(item) === label);
    assert.ok(node, `choix ${label}`);
    nodes(node).find((item) => item.type === "input").props.onChange({ target: { checked } }); render();
  }
  render();
  return { click, check, button, storage, render, text: () => text(tree), nodes: () => nodes(tree),
    profile: () => readProfile(storage).profile, lastResult: () => lastResult };
}

for (const [mode, transition] of [["tu", "De ton côté, confirme simplement ceci :"],
  ["vous", "De votre côté, confirmez simplement ceci :"]]) {
  test(`écran sécurité ${mode} : parole du coach puis déclaration de l’utilisateur`, () => {
    const ui = setup(draft(5, mode));
    const paragraphs = ui.nodes().filter((node) => node.type === "p").map((node) => node.props.children.join(""));
    assert.deepEqual(paragraphs, [ASSESSMENT_MESSAGES[mode].safety, transition, ...ASSESSMENT_MESSAGES[mode].confirmation]);
    assert.ok(ui.text().includes("J’ai lu et je confirme"));
  });
}

test("Q5 à Q7 : formulations validées en vouvoiement", () => {
  assert.deepEqual(QUESTIONS.slice(4, 7).map((question) => question.textVous), [
    "En ce moment, à quelle fréquence faites-vous une activité physique pour entretenir votre forme générale ?",
    "Et plus précisément, faites-vous des exercices pour entretenir ou renforcer vos muscles ?",
    "Et des exercices pour entretenir votre souplesse ou votre mobilité ?",
  ]);
});

test("écran sécurité : case obligatoire et Retour conserve les réponses", () => {
  const ui = setup();
  assert.equal(ui.button("Continuer").props.disabled, true);
  ui.check("J’ai lu et je confirme", true);
  assert.equal(ui.button("Continuer").props.disabled, false);
  ui.click("Continuer");
  assert.equal(ui.profile().safetyConfirmed, true);
  assert.equal(ui.profile().onboardingCurrentStep, 6);
  ui.click("Retour");
  assert.equal(ui.profile().onboardingCurrentStep, 5);
  assert.equal(ui.nodes().find((node) => node.type === "input").props.checked, true);
});

test("écran matériel : sélection sauvegardée immédiatement, aucun exclusif et reprise", () => {
  let ui = setup(draft(6));
  ui.check("Haltères", true); ui.check("Barre longue", true);
  assert.deepEqual(ui.profile().equipment, ["dumbbells", "longBar"]);
  ui = setup(ui.profile());
  ui.check("Non, pas de matériel", true);
  assert.deepEqual(ui.profile().equipment, []);
  ui.check("Élastiques de résistance", true);
  assert.deepEqual(ui.profile().equipment, ["resistanceBands"]);
  const none = ui.nodes().find((node) => node.type === "label" && node.props.children.some((child) => child?.props?.children?.includes("Non, pas de matériel")));
  assert.equal(none.props.children.find((child) => child?.type === "input").props.checked, false);
  ui.click("Continuer");
  assert.equal(ui.profile().onboardingCurrentStep, 7);
});

for (const mode of ["tu", "vous"]) {
  test(`introduction et neuf questions ${mode} : sources uniques, progression discrète, pas de lettres`, () => {
    const intro = setup(draft(7, mode));
    ASSESSMENT_MESSAGES[mode].introduction.forEach((paragraph) => assert.ok(intro.text().includes(paragraph)));
    for (let i = 0; i < 9; i += 1) {
      const ui = setup({ ...draft(8 + i, mode), assessmentAnswers: Array(9).fill("b") });
      assert.ok(ui.text().includes(mode === "vous" ? QUESTIONS[i].textVous : QUESTIONS[i].text));
      assert.doesNotMatch(ui.text(), /Question \d sur 9|[ABC][.)]\s/);
      const labels = ui.nodes().filter((node) => node.type === "button").map((node) => node.props.children.join(""));
      assert.deepEqual(labels, [...QUESTIONS[i].answers.map((answer) => answer.text), "Retour"]);
      const bar = ui.nodes().find((node) => node.props.role === "progressbar");
      assert.equal(bar.props["aria-valuenow"], i + 1);
      assert.equal(bar.props["aria-valuemax"], 9);
    }
  });
}

test("questionnaire à l'écran : sauvegarde, recharge, Retour et modification", () => {
  let ui = setup(draft(8));
  ui.click(QUESTIONS[0].answers[0].text);
  assert.equal(ui.profile().assessmentAnswers[0], "a");
  ui = setup(ui.profile());
  ui.click("Retour");
  assert.equal(ui.nodes().find((node) => node.type === "button" && node.props["aria-pressed"]).props.children[0], QUESTIONS[0].answers[0].text);
  ui.click(QUESTIONS[0].answers[2].text);
  assert.equal(ui.profile().assessmentAnswers[0], "c");
  for (let i = 1; i < 9; i += 1) ui.click(QUESTIONS[i].answers[0].text);
  assert.equal(ui.profile().proposedLevel, "forme");
  assert.equal(ui.profile().assessmentVersion, QUESTIONNAIRE_VERSION);
  assert.ok(Number.isFinite(Date.parse(ui.profile().assessmentDate)));
  assert.ok(ui.text().includes(ASSESSMENT_MESSAGES.tu.proposal("Forme")));
});

for (const mode of ["tu", "vous"]) {
  test(`proposition ${mode} acceptée explicitement, arrêt au conteneur suivant`, () => {
    const ui = setup(proposal(Array(9).fill("b"), mode));
    ASSESSMENT_MESSAGES[mode].proposalDetails.forEach((paragraph) => assert.ok(ui.text().includes(paragraph)));
    assert.equal(ui.profile().selectedLevel, null);
    ui.click("Ça me convient");
    assert.equal(ui.profile().selectedLevel, "forme");
    assert.equal(ui.profile().levelOrigin, "coach");
    assert.equal(ui.profile().onboardingCurrentStep, 18);
    assert.equal(ui.profile().onboardingCompleted, false);
  });
}

for (const level of ["reprise", "forme", "tonique"]) {
  test(`choix manuel ${level} explicite, y compris si identique à la proposition`, () => {
    const ui = setup(proposal());
    ui.click("Je préfère choisir mon niveau");
    assert.equal(ui.button("Valider mon choix").props.disabled, true);
    ui.check(assessment.LEVEL_LABELS[level], true);
    ui.click("Valider mon choix");
    assert.equal(ui.profile().selectedLevel, level);
    assert.equal(ui.profile().levelOrigin, "manual");
    assert.equal(ui.profile().onboardingCompleted, false);
  });
}

test("échec de sauvegarde : pas d'avancée, de réponse perdue ni de proposition fantôme", () => {
  const ui = setup({ ...draft(16), assessmentAnswers: [...Array(8).fill("a"), null] });
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.click(QUESTIONS[8].answers[0].text);
  assert.equal(ui.lastResult().status, "unavailable");
  assert.equal(ui.profile().onboardingCurrentStep, 16);
  assert.equal(ui.profile().assessmentAnswers[8], null);
  assert.equal(ui.profile().proposedLevel, null);
});

test("aucune nouvelle clé localStorage, historiques et réglages inchangés", () => {
  const ui = setup(proposal());
  const keys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm", "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  keys.forEach((key) => ui.storage.data.set(key, "unchanged"));
  ui.click("Ça me convient");
  keys.forEach((key) => assert.equal(ui.storage.getItem(key), "unchanged"));
  assert.deepEqual([...ui.storage.data.keys()].sort(), [...keys, PROFILE_KEY].sort());
});
