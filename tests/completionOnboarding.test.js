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
    if (typeof node.type === "function") return expand(node.type({ ...node.props, children: node.props.children.length === 1 ? node.props.children[0] : node.props.children }));
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

const branches = [
  ["current", completion.CURRENT_PROGRAM_MISSING_OPTIONS, "currentProgramMissing"],
  ["stopped", completion.STOP_REASON_OPTIONS, "previousProgramStopReason"],
];
for (const mode of ["tu", "vous"]) {
  test(`transition ${mode} : texte, reprise et retour au niveau`, () => {
    let ui = setup({ ...draft(18, mode), onboardingCompletionStage: "transition" });
    COMPLETION_MESSAGES[mode].transition.forEach((text) => assert.ok(ui.text().includes(text)));
    assert.deepEqual(ui.labels(), ["Continuer", "Retour"]);
    ui = setup(ui.profile());
    assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].transition[0]));
    ui.click("Continuer");
    assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].experience));
    ui.click("Retour");
    assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].transition[0]));
    ui.click("Retour");
    assert.equal(ui.profile().onboardingCurrentStep, 17);
  });
  for (const [experience, options, field] of branches) {
    for (const option of options) {
      test(`${mode}/${experience}/${option.value} : question, réponse unique, réaction persistée et retours`, () => {
        let ui = setup(draft(18, mode));
        ui.click(completion.EXPERIENCE_OPTIONS.find((item) => item.value === experience).label);
        assert.equal(ui.profile().onboardingCurrentStep, 19);
        assert.ok(ui.text().includes(experience === "current" ? COMPLETION_MESSAGES[mode].currentQuestion : COMPLETION_MESSAGES[mode].reason));
        const label = experience === "stopped" ? getStopReasonLabel(option, draft(19, mode)) : option.label;
        assert.deepEqual(ui.labels(), [...options.map((item) => experience === "stopped" ? getStopReasonLabel(item, draft(19, mode)) : item.label), "Retour"]);
        ui = setup(ui.profile());
        ui.click(label);
        assert.equal(ui.profile()[field], option.value);
        assert.equal(ui.profile().onboardingCurrentStep, 19);
        assert.equal(ui.profile().onboardingCompletionStage, "reaction");
        assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].reaction));
        assert.deepEqual(ui.labels(), ["Continuer", "Retour"]);
        ui = setup(ui.profile());
        assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].reaction));
        ui.click("Retour");
        assert.ok(ui.labels().includes(label));
        const alternative = options.find((item) => item.value !== option.value);
        ui.click(experience === "stopped" ? getStopReasonLabel(alternative, draft(19, mode)) : alternative.label);
        assert.equal(ui.profile()[field], alternative.value);
        ui.click("Retour"); ui.click(label); ui.click("Continuer");
        assert.equal(ui.profile().onboardingCurrentStep, 20);
        COMPLETION_MESSAGES[mode].conclusion("Camille").forEach((text) => assert.ok(ui.text().includes(text)));
        ui = setup(ui.profile());
        ui.click("Retour");
        assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].reaction));
        ui.click("Retour");
        assert.ok(ui.labels().includes(label));
        ui.click("Retour");
        assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].experience));
        assert.equal(ui.profile().onboardingCompleted, false);
      });
    }
  }
  test(`never ${mode} : conclusion directe et retour expérience`, () => {
    let ui = setup(draft(18, mode));
    ui.click("Non, jamais.");
    assert.equal(ui.profile().onboardingCurrentStep, 20);
    assert.ok(ui.text().includes("Merci Camille, c’est bon pour moi."));
    assert.deepEqual(ui.labels(), ["Oui, c’est parti !", "Pas maintenant", "Retour"]);
    ui = setup(ui.profile()); ui.click("Retour");
    assert.ok(ui.text().includes(COMPLETION_MESSAGES[mode].experience));
  });
}

test("textes validés : cinq besoins et cinq motifs, valeurs distinctes", () => {
  assert.deepEqual(completion.CURRENT_PROGRAM_MISSING_OPTIONS.map((option) => option.label), [
    "Un accompagnement plus personnalisé et plus motivant", "Des séances mieux adaptées à mon niveau",
    "Plus de variété", "Un meilleur suivi de mes progrès", "Je ne sais pas vraiment",
  ]);
  assert.deepEqual(completion.STOP_REASON_OPTIONS.map((option) => option.label), [
    "Je ne me sentais pas assez accompagné ni assez motivé", "C’était trop difficile",
    "Les séances étaient trop longues", "C’était trop répétitif", "Je ne sais pas vraiment",
  ]);
  assert.equal(COMPLETION_MESSAGES.tu.reaction, "Merci, c’est bon à savoir. J’essaierai d’en tenir compte pour mieux t’accompagner.");
  assert.equal(COMPLETION_MESSAGES.tu.experience, "As-tu déjà utilisé une application ou suivi un programme pour faire de l’exercice ?");
  assert.equal(COMPLETION_MESSAGES.tu.reason, "Peux-tu me dire pourquoi tu as arrêté ?");
  assert.equal(COMPLETION_MESSAGES.tu.currentQuestion, "Qu’est-ce qui te manque le plus dans l’application que tu utilises actuellement ?");
});

test("changement de branche : effacer les réponses devenues sans objet", () => {
  let ui = setup(draft());
  ui.click("Oui, et encore actuellement."); ui.click("Plus de variété"); ui.click("Retour"); ui.click("Retour");
  ui.click("Oui, mais j’ai arrêté.");
  assert.equal(ui.profile().currentProgramMissing, null);
  ui.click("C’était trop difficile"); ui.click("Retour"); ui.click("Retour");
  ui.click("Oui, et encore actuellement.");
  assert.equal(ui.profile().previousProgramStopReason, null);
  ui.click("Je ne sais pas vraiment"); ui.click("Retour"); ui.click("Retour");
  ui.click("Non, jamais.");
  assert.equal(ui.profile().currentProgramMissing, null);
  assert.equal(ui.profile().previousProgramStopReason, null);
});

for (const [label, destination] of [["Pas maintenant", "/"], ["Oui, c’est parti !", "/seances"]]) {
  for (const experience of ["current", "stopped", "never"]) {
    test(`finalisation ${experience}/${label} : sauvegarde, recharge, navigation et double clic`, () => {
      const ui = setup({ ...draft(20), previousProgramExperience: experience,
        currentProgramMissing: experience === "current" ? "variety" : null,
        previousProgramStopReason: experience === "stopped" ? "tooLong" : null });
      const handler = ui.button(label).props.onClick;
      handler(); handler();
      assert.equal(ui.saves(), 1);
      assert.deepEqual(ui.navigations, [{ to: destination, replace: true }]);
      assert.equal(ui.profile().onboardingCompleted, true);
      assert.equal(getOnboardingState(readProfile(ui.storage)).status, "complete");
    });
  }
}

for (const [experience, options, field] of branches) {
  test(`échec de sauvegarde ${experience} : pas de réaction, réponse préservée, réessai possible`, () => {
    const ui = setup({ ...draft(19), previousProgramExperience: experience });
    const write = ui.storage.setItem;
    ui.storage.setItem = () => { throw Error("quota"); };
    const label = experience === "stopped" ? getStopReasonLabel(options[0], draft(19)) : options[0].label;
    ui.click(label);
    assert.ok(!ui.text().includes(COMPLETION_MESSAGES.tu.reaction));
    assert.equal(ui.profile()[field] ?? null, null);
    assert.ok(ui.text().includes("n’a pas pu être enregistrée"));
    ui.storage.setItem = write; ui.click(label);
    assert.ok(ui.text().includes(COMPLETION_MESSAGES.tu.reaction));
  });
}

test("échecs d’écriture : transition, expérience, réaction et finalisation restent sur place", () => {
  for (const [initial, button] of [
    [{ ...draft(18), onboardingCompletionStage: "transition" }, "Continuer"],
    [draft(18), "Oui, et encore actuellement."],
    [{ ...draft(19), previousProgramStopReason: "tooLong", onboardingCompletionStage: "reaction" }, "Continuer"],
    [draft(20), "Pas maintenant"],
  ]) {
    const ui = setup(initial), before = ui.profile(), write = ui.storage.setItem;
    ui.storage.setItem = () => { throw Error("quota"); }; ui.click(button);
    assert.deepEqual(ui.profile(), before);
    assert.deepEqual(ui.navigations, []);
    assert.ok(ui.text().includes("n’a pas pu être enregistrée"));
    ui.storage.setItem = write; ui.click(button);
    assert.ok(!ui.text().includes("n’a pas pu être enregistrée"));
  }
});

test("finalisation : validation, majorité, sécurité et bilan cohérent obligatoires", () => {
  const invalid = [
    { firstName: " " }, { age: null }, { age: 17 }, { sex: null }, { addressMode: null },
    { equipment: ["chair"] }, { assessmentAnswers: Array(9).fill(null) },
    { assessmentAnswers: Array(9).fill("invalid") }, { assessmentDate: null },
    { assessmentVersion: "unknown" }, { proposedLevel: null }, { proposedLevel: "tonique" },
    { selectedLevel: null }, { levelOrigin: null }, { previousProgramExperience: null },
    { safetyConfirmed: false }, { profileVersion: 99 },
    { previousProgramExperience: "current", currentProgramMissing: null },
    { previousProgramExperience: "stopped", previousProgramStopReason: null },
  ];
  for (const changes of invalid) {
    const profile = { ...draft(20), ...changes };
    assert.equal(completion.canCompleteOnboarding(profile), false, JSON.stringify(changes));
    assert.equal(completion.prepareCompletionStep(profile, "finish", "later").ok, false);
  }
  const ui = setup({ ...draft(20), age: 17 });
  assert.deepEqual(ui.labels(), ["Retour"]);
  assert.ok(ui.text().includes("complet et valide"));
  assert.equal(completion.prepareCompletionStep(draft(19), "answer", "other").ok, false);
  assert.equal(completion.prepareCompletionStep(draft(19), "answer", null).ok, false);
  assert.equal(completion.prepareCompletionStep(draft(19), "continue").ok, false);
  assert.equal(completion.prepareCompletionStep(draft(18), "experience", "unknown").ok, false);
  assert.equal(completion.prepareCompletionStep(draft(18), "finish", "now").ok, false);
});

test("anciens profils : niveau forme et motifs historiques lisibles sans migration", () => {
  for (const reason of [null, "notSupportedEnough", "lackOfMotivation", "preferNotToSay", "other", "tooLong"]) {
    const old = { ...draft(20), selectedLevel: "forme", previousProgramExperience: "stopped", previousProgramStopReason: reason };
    const loaded = readProfile(storageWith(old));
    assert.equal(loaded.status, "valid");
    assert.deepEqual(loaded.profile, old);
    assert.equal(getOnboardingState(readProfile(storageWith({ ...old, onboardingCompleted: true }))).status, "complete");
    const ui = setup(old); ui.click("Retour");
    if (reason === "tooLong") ui.click("Retour");
    assert.ok(ui.labels().includes("Les séances étaient trop longues"));
  }
  const ui = setup({ ...draft(20), previousProgramExperience: "current" });
  assert.deepEqual(ui.labels(), ["Retour"]);
  ui.click("Retour"); assert.ok(ui.labels().includes("Plus de variété"));
});

for (const mode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
  test(`accord ${mode}/${sex}`, () => {
    const ui = setup({ ...draft(19, mode), sex });
    const label = sex === "female" ? "Je ne me sentais pas assez accompagnée ni assez motivée" : "Je ne me sentais pas assez accompagné ni assez motivé";
    ui.click(label);
    assert.equal(ui.profile().previousProgramStopReason, "notSupportedOrMotivated");
  });
}

test("finalisation : aucune nouvelle clé de stockage, historiques et réglages préservés", () => {
  const ui = setup(draft(20));
  const keys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm", "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  keys.forEach((key) => ui.storage.data.set(key, "unchanged"));
  ui.click("Pas maintenant");
  keys.forEach((key) => assert.equal(ui.storage.getItem(key), "unchanged"));
  assert.deepEqual([...ui.storage.data.keys()].sort(), [...keys, PROFILE_KEY].sort());
});

test("textes tutoyés validés : transition et conclusion exactes avec prénom dynamique", () => {
  assert.deepEqual(COMPLETION_MESSAGES.tu.transition, [
    "Voilà, ton niveau de départ est choisi !",
    "Mais avant de terminer, j’aimerais encore te poser une dernière question sur ton expérience avec les programmes d’exercices.",
    "Cela m’aidera à mieux t’accompagner.",
  ]);
  assert.deepEqual(COMPLETION_MESSAGES.tu.conclusion("Antoine"), [
    "Merci Antoine, c’est bon pour moi.",
    "Avec ce que tu viens de me dire, je vais pouvoir te proposer des séances adaptées à ton niveau, à ton matériel et à ta forme du jour.",
    "Mais rien n’est figé : tu pourras changer de niveau, faire évoluer ton matériel à tout moment et m’indiquer ta forme du jour au début de chaque séance.",
    "On fait ta première séance maintenant ?",
  ]);
  assert.equal(COMPLETION_MESSAGES.vous.conclusion("Camille")[0], "Merci Camille, c’est bon pour moi.");
  assert.deepEqual(completion.EXPERIENCE_OPTIONS.map((option) => option.label), [
    "Oui, et encore actuellement.", "Oui, mais j’ai arrêté.", "Non, jamais.",
  ]);
});

test("retour sans écriture réussie : conserver la réaction sauvegardée", () => {
  const ui = setup({ ...draft(19), previousProgramStopReason: "tooLong", onboardingCompletionStage: "reaction" });
  const before = ui.profile();
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.click("Retour");
  assert.deepEqual(ui.profile(), before);
  assert.ok(ui.text().includes(COMPLETION_MESSAGES.tu.reaction));
});
