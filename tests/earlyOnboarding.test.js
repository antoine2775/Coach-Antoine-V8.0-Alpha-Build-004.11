import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { prepareEarlyStep } from "../src/onboarding/earlySteps.js";
import { EARLY_MESSAGES } from "../src/onboarding/earlyMessages.js";
import { ONBOARDING_STEPS } from "../src/onboarding/steps.js";
import { createEmptyProfile, readProfile, updateProfile, PROFILE_KEY } from "../src/utils/userProfile.js";

const code = buildSync({ entryPoints: ["src/components/onboarding/EarlySteps.jsx"],
  bundle: true, write: false, platform: "node", format: "cjs",
  external: ["react", "../../context/UserProfileContext", "../../onboarding/earlySteps", "../../onboarding/earlyMessages"],
}).outputFiles[0].text;

// Exécute les vrais composants, transitions et écritures du lot 1, avec un stockage
// isolé et des hooks en mémoire : aucun profil du navigateur n'est utilisé.
function setup(initial) {
  const data = new Map(initial ? [[PROFILE_KEY, JSON.stringify(initial)]] : []);
  let tree, cells = new Map(), active, index, lastStep, lastResult;
  const attempts = [];
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let profile = initial || null;
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initialValue) {
      const bucket = cells.get(active) || [];
      cells.set(active, bucket);
      const i = index++;
      if (!(i in bucket)) bucket[i] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [bucket[i], (next) => { bucket[i] = typeof next === "function" ? next(bucket[i]) : next; }];
    },
  };
  const context = { useUserProfile: () => ({ profile, updateUserProfile(changes) {
    attempts.push(changes);
    lastResult = updateProfile(changes, storage);
    if (lastResult.status === "saved") profile = lastResult.profile;
    return lastResult;
  } }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => {
    if (name === "react") return react;
    if (name.includes("UserProfileContext")) return context;
    if (name.includes("earlyMessages")) return { EARLY_MESSAGES };
    if (name.includes("earlySteps")) return { prepareEarlyStep };
    throw Error(name);
  } });
  function expand(node, path = "root") {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return expand({ type: "fragment", props: { children: node } }, path);
    if (typeof node.type === "function") {
      active = `${path}/${node.type.name}`;
      index = 0;
      return expand(node.type(node.props), active);
    }
    return { ...node, props: { ...node.props, children: node.props.children.flat(Infinity).map((child, i) => expand(child, `${path}/${i}`)) } };
  }
  function render() {
    const step = ONBOARDING_STEPS[profile?.onboardingCurrentStep || 0];
    if (lastStep !== step.id) { cells = new Map(); lastStep = step.id; }
    tree = step.index <= 4 ? expand(react.createElement(module.exports.default, { step })) : null;
  }
  const nodes = (node = tree) => !node || typeof node !== "object" ? [] :
    [node, ...node.props.children.filter((child) => child !== undefined).flatMap((child) => child === null ? [] : nodes(child))];
  const text = (node) => node === null || node === undefined || typeof node === "boolean" ? "" :
    typeof node !== "object" ? String(node) : node.props.children.map(text).join("");
  function button(label) {
    const node = nodes().find((item) => item.type === "button" && text(item) === label);
    assert.ok(node, `bouton ${label}`);
    return node;
  }
  function click(label) { button(label).props.onClick(); render(); }
  function input(name, value) {
    const node = nodes().find((item) => item.type === "input" && item.props.name === name);
    assert.ok(node, `champ ${name}`);
    node.props.onChange({ target: { value } }); render();
  }
  function submit() {
    const node = nodes().find((item) => item.type === "form");
    assert.ok(node, "formulaire présent");
    node.props.onSubmit({ preventDefault() {} }); render();
  }
  render();
  return { data, storage, attempts, click, input, submit, render,
    profile: () => readProfile(storage).profile,
    text: () => text(tree),
    buttons: () => nodes().filter((item) => item.type === "button").map(text),
    lastResult: () => lastResult,
  };
}

const atName = (mode = "tu", sex = "female") => ({ ...createEmptyProfile(), addressMode: mode, sex, onboardingCurrentStep: 3 });
const atAge = (mode = "tu", age = null) => ({ ...atName(mode), firstName: "Alex", age, onboardingCurrentStep: 4 });

for (const [label, mode] of [["Oui, on se tutoie", "tu"], ["Je préfère qu’on se vouvoie", "vous"]]) {
  test(`choix ${mode} sauvegardé et explication dans le bon mode`, () => {
    const ui = setup();
    ui.click(label);
    assert.equal(ui.profile().addressMode, mode);
    assert.equal(ui.profile().onboardingCurrentStep, 1);
    assert.equal(ui.profile().onboardingCompleted, false);
    for (const paragraph of EARLY_MESSAGES[mode].explanation) assert.ok(ui.text().includes(paragraph));
    ui.click("Continuer");
    assert.equal(ui.profile().onboardingCurrentStep, 2);
    assert.ok(ui.text().includes(EARLY_MESSAGES[mode].sex));
  });
}

for (const [label, sex] of [["Femme", "female"], ["Homme", "male"]]) {
  test(`${label} avant le prénom : sauvegarde explicite sans changement de niveau`, () => {
    const ui = setup({ ...createEmptyProfile(), addressMode: "vous", onboardingCurrentStep: 2 });
    assert.ok(ui.text().includes("Vous êtes :"));
    ui.click(label);
    assert.equal(ui.profile().sex, sex);
    assert.equal(ui.profile().onboardingCurrentStep, 3);
    assert.equal(ui.profile().selectedLevel, null);
    assert.equal(ui.profile().proposedLevel, null);
    assert.ok(ui.text().includes(EARLY_MESSAGES.vous.firstName));
  });
}

test("prénom obligatoire : blanc refusé, espaces supprimés, réaction puis continuation", () => {
  const ui = setup(atName());
  ui.input("firstName", "   "); ui.submit();
  assert.equal(ui.profile().firstName, "");
  assert.ok(ui.text().includes(EARLY_MESSAGES.tu.firstNameError));
  ui.input("firstName", "  Léa  "); ui.submit();
  assert.equal(ui.profile().firstName, "Léa");
  assert.equal(ui.profile().onboardingCurrentStep, 3);
  assert.ok(ui.text().includes("Enchanté Léa ! Moi, tu le sais déjà, c’est Coach Antoine."));
  assert.ok(!ui.text().includes("Enchantée"));
  ui.click("Continuer");
  assert.equal(ui.profile().onboardingCurrentStep, 4);
});

test("réaction au prénom en vouvoiement, sans accord selon le sexe", () => {
  const ui = setup(atName("vous", "female"));
  ui.input("firstName", "Camille"); ui.submit();
  assert.ok(ui.text().includes("Enchanté Camille ! Moi, vous le savez déjà, c’est Coach Antoine."));
  ui.click("Retour");
  assert.ok(ui.text().includes(EARLY_MESSAGES.vous.firstName));
  assert.equal(ui.profile().firstName, "Camille");
});

for (const age of ["18", "42", " 75 "]) {
  test(`âge entier adulte ${age.trim()} enregistré, arrêt à sécurité sans terminer`, () => {
    const ui = setup(atAge());
    ui.input("age", age); ui.submit();
    assert.equal(ui.profile().age, Number(age));
    assert.equal(ui.profile().onboardingCurrentStep, 5);
    assert.equal(ui.profile().onboardingCompleted, false);
  });
}

for (const mode of ["tu", "vous"]) {
  test(`mineur (${mode}) : blocage sans Continuer, âge jamais stocké et nouvelle saisie après rechargement`, () => {
    const ui = setup(atAge(mode, 40));
    ui.input("age", "17"); ui.submit();
    for (const paragraph of EARLY_MESSAGES[mode].underage) assert.ok(ui.text().includes(paragraph));
    assert.ok(!ui.buttons().includes("Continuer"));
    assert.equal(ui.profile().age, null);
    assert.equal(ui.profile().onboardingCurrentStep, 4);
    assert.equal(ui.profile().onboardingCompleted, false);
    assert.ok(ui.attempts.every((change) => change.age !== 17));
    const reloaded = setup(ui.profile());
    assert.ok(reloaded.text().includes(EARLY_MESSAGES[mode].age));
    assert.equal(reloaded.profile().age, null);
    ui.click("Corriger l’âge");
    ui.input("age", "18"); ui.submit();
    assert.equal(ui.profile().onboardingCurrentStep, 5);
  });
}

test("âge invalide : aucune écriture ni avancée", () => {
  for (const age of ["", " ", "0", "-1", "17.5", "18.5", "abc", "Infinity", "99999999999999999999"]) {
    const ui = setup(atAge());
    ui.input("age", age); ui.submit();
    assert.equal(ui.attempts.length, 0);
    assert.equal(ui.profile().age, null);
    assert.equal(ui.profile().onboardingCurrentStep, 4);
    assert.ok(ui.text().includes(EARLY_MESSAGES.tu.ageError));
  }
});

test("Retour conserve les données et permet de modifier une réponse antérieure", () => {
  const ui = setup(atAge("vous", 40));
  ui.click("Retour");
  assert.equal(ui.profile().onboardingCurrentStep, 3);
  assert.equal(ui.profile().firstName, "Alex");
  assert.equal(ui.profile().age, 40);
  ui.click("Retour");
  assert.equal(ui.profile().onboardingCurrentStep, 2);
  ui.click("Homme");
  assert.equal(ui.profile().sex, "male");
  ui.input("firstName", "  Robin "); ui.submit();
  assert.equal(ui.profile().firstName, "Robin");
  assert.equal(ui.profile().addressMode, "vous");
  assert.equal(ui.profile().age, 40);
});

test("rechargement à chaque première étape : données enregistrées conservées", () => {
  let ui = setup();
  ui.click("Je préfère qu’on se vouvoie");
  ui = setup(ui.profile());
  assert.ok(ui.text().includes(EARLY_MESSAGES.vous.explanation[0]));
  ui.click("Continuer"); ui.click("Femme");
  ui.input("firstName", "  Sarah "); ui.submit();
  ui = setup(ui.profile());
  assert.equal(ui.profile().firstName, "Sarah");
  assert.equal(ui.profile().sex, "female");
  ui.input("firstName", "Sarah"); ui.submit(); ui.click("Continuer");
  ui = setup(ui.profile());
  assert.ok(ui.text().includes(EARLY_MESSAGES.vous.age));
  assert.equal(ui.profile().addressMode, "vous");
});

test("échec de sauvegarde : pas d'avancée ni de réaction de succès", () => {
  const ui = setup(atName());
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.input("firstName", "Sarah"); ui.submit();
  assert.equal(ui.lastResult().status, "unavailable");
  assert.equal(ui.profile().firstName, "");
  assert.equal(ui.profile().onboardingCurrentStep, 3);
  assert.ok(!ui.text().includes("Enchanté"));
});

test("blocage mineur maintenu même si la sauvegarde échoue", () => {
  const ui = setup(atAge());
  ui.storage.setItem = () => { throw Error("quota"); };
  ui.input("age", "16"); ui.submit();
  assert.equal(ui.lastResult().status, "unavailable");
  assert.ok(!ui.buttons().includes("Continuer"));
  assert.equal(ui.profile().age, null);
  assert.equal(ui.attempts[0].age, null);
});

test("une seule clé de profil : anciennes clés inchangées", () => {
  const ui = setup();
  const oldKeys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm",
    "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  oldKeys.forEach((key) => ui.data.set(key, "unchanged"));
  ui.click("Oui, on se tutoie"); ui.click("Continuer"); ui.click("Femme");
  ui.input("firstName", "Alex"); ui.submit(); ui.click("Continuer"); ui.input("age", "18"); ui.submit();
  oldKeys.forEach((key) => assert.equal(ui.data.get(key), "unchanged"));
  assert.deepEqual([...ui.data.keys()].sort(), [...oldKeys, PROFILE_KEY].sort());
});

test("transitions pures : pas de nouvelle étape construite au-delà de sécurité", () => {
  assert.equal(prepareEarlyStep("back", 5).changes.onboardingCurrentStep, 4);
  for (const invalid of [0, -1, 6, "4", null]) assert.equal(prepareEarlyStep("back", invalid).ok, false);
  assert.equal(prepareEarlyStep("unknown").ok, false);
  assert.equal(prepareEarlyStep("sex", "unknown").ok, false);
  assert.equal(prepareEarlyStep("addressMode", "unknown").ok, false);
  const draft = atAge();
  prepareEarlyStep("age", "17");
  assert.deepEqual(draft, atAge());
});
