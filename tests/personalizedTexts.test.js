import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getPersonalizedTexts, getStopReasonLabel } from "../src/utils/personalizedTexts.js";
import { workoutSteps, getCoachSayings } from "../src/data.js";
import { createEmptyProfile, updateProfile, readProfile, PROFILE_KEY } from "../src/utils/userProfile.js";

const require = createRequire(import.meta.url);
const profileFor = (addressMode = "tu", sex = "male", firstName = "Éloïse") => ({
  ...createEmptyProfile(), addressMode, sex, firstName, age: 40, proposedLevel: "forme", selectedLevel: "forme",
  levelOrigin: "coach", assessmentAnswers: Array(9).fill("b"), assessmentDate: "2026-10-18T10:00:00Z",
  assessmentVersion: "1", previousProgramExperience: "never", onboardingCurrentStep: 20, onboardingCompleted: true,
});

const uiCode = buildSync({
  stdin: { contents: 'export { default as Home } from "./src/pages/Home.jsx"; export { default as Workout } from "./src/pages/Workout.jsx"; export { default as Progress } from "./src/pages/Progress.jsx"; export { default as Carnet } from "./src/pages/Carnet.jsx"; export { default as ProfileSettings } from "./src/components/ProfileSettings.jsx"; export { UserProfileContext } from "./src/context/UserProfileContext.jsx";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
  define: { "import.meta.env.BASE_URL": JSON.stringify("/Coach-Antoine-V8.0-Alpha-Build-004.11/") },
}).outputFiles[0].text;

function renderPage(page, profile) {
  const module = { exports: {} };
  vm.runInNewContext(uiCode, { module, require, localStorage: { getItem: () => null } });
  const { UserProfileContext } = module.exports;
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(UserProfileContext.Provider, { value: { profile } }, React.createElement(module.exports[page]))));
}

for (const addressMode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
  test(`rendus ${addressMode}/${sex} : prénom, accueil, préparation, progression et Carnet`, () => {
    const profile = profileFor(addressMode, sex);
    const texts = getPersonalizedTexts(profile);
    const home = renderPage("Home", profile);
    assert.ok(home.includes("Bonjour Éloïse !"));
    assert.ok(home.includes(sex === "female" ? "Prête ?" : "Prêt ?"));
    assert.ok(home.includes(texts.program));
    const workout = renderPage("Workout", profile);
    for (const text of [texts.dayFormQuestion, texts.dayFormExplanation, texts.dayFormNote, "Petite forme", "En forme", "Pleine forme"]) assert.ok(workout.includes(text));
    const progress = renderPage("Progress", profile);
    assert.ok(progress.includes(texts.journey));
    assert.ok(progress.includes(texts.emptyHistory));
    const carnet = renderPage("Carnet", profile);
    assert.ok(carnet.includes(texts.zzTop));
    assert.ok(carnet.includes(texts.understand));
    assert.doesNotMatch(carnet, /(?:Tu peux|Vous pouvez) être (?:fier|fière) de (?:toi|vous)\./);
    assert.equal((carnet.match(/<blockquote/g) || []).length, 7); // Six citations et le texte ZZ Top.
    for (const html of [home, workout, progress, carnet]) {
      assert.doesNotMatch(html, /Bonjour Antoine|Bravo Antoine|undefined|\bnull\b|prêt\(e\)/);
    }
  });
}

for (const profile of [null, undefined, {}, { firstName: null }, { firstName: 123 }, { firstName: "" }, { firstName: "   " }]) {
  test(`prénom absent ou invalide ${JSON.stringify(profile)} : repli sans ponctuation parasite`, () => {
    const texts = getPersonalizedTexts(profile);
    assert.equal(texts.welcome, "Bonjour !");
    assert.equal(texts.finish("normal"), "Belle séance aujourd’hui !");
    assert.equal(texts.finish("high"), "Une séance un peu plus soutenue aujourd’hui. Bravo !");
    assert.ok(texts.finish("low").endsWith("Bravo !"));
    assert.equal(texts.finish(null), "Bravo !");
    for (const day of ["low", "normal", "high"]) assert.doesNotMatch(texts.finish(day), /undefined|\bnull\b|  |, !|Bravo  /);
    assert.ok(renderPage("Home", profile).includes("Bonjour !"));
  });
}

test("prénom conservé avec ses accents, casse et trait d’union, sans répétition à l’accueil", () => {
  const profile = profileFor("vous", "female", "  Anne-Sophie  ");
  assert.equal(getPersonalizedTexts(profile).welcome, "Bonjour Anne-Sophie !");
  assert.equal(renderPage("Home", profile).split("Anne-Sophie").length - 1, 1);
});

test("messages finaux exacts pour les trois formes et les deux modes", () => {
  for (const mode of ["tu", "vous"]) {
    const texts = getPersonalizedTexts(profileFor(mode));
    assert.equal(texts.finish("low"), mode === "vous"
      ? "Aujourd’hui, on a fait plus léger. Mais l’important, c’est que vous avez quand même fait votre séance. Bravo Éloïse !"
      : "Aujourd’hui, on a fait plus léger. Mais l’important, c’est que tu as quand même fait ta séance. Bravo Éloïse !");
    assert.equal(texts.finish("normal"), "Belle séance aujourd’hui, Éloïse !");
    assert.equal(texts.finish("high"), "Une séance un peu plus soutenue aujourd’hui. Bravo Éloïse !");
  }
});

test("douze consignes explicites en vous et données temporelles conservées", () => {
  assert.equal(workoutSteps.length, 12);
  assert.equal(new Set(workoutSteps.map((step) => step.id)).size, 12);
  assert.equal(workoutSteps.reduce((total, step) => total + step.seconds, 0), 915);
  assert.deepEqual(workoutSteps.map((step) => step.noteVous), [
    "Faites des mouvements lents et confortables.",
    "Bougez les bras naturellement et gardez le contrôle de votre respiration.",
    "Poussez dans les jambes et redressez-vous sans précipitation.",
    "Gardez le corps droit et contrôlez le mouvement.",
    "Déplacez-vous de droite à gauche avec contrôle.",
    "Stabilisez-vous sans forcer. Appuyez-vous si nécessaire.",
    "Tendez alternativement chaque jambe sans donner d’élan.",
    "Montez doucement, restez stable, puis redescendez lentement.",
    "Tournez tranquillement de chaque côté sans forcer.",
    "Redressez-vous et ramenez doucement les épaules vers l’arrière.",
    "Gardez le talon au sol et cherchez seulement une tension confortable.",
    "Respirez lentement, relâchez les épaules et terminez la séance en vous redressant.",
  ]);
  assert.equal(workoutSteps[6].name, "Extension des jambes en position assise");
});

// Le vrai Workout est exécuté avec des hooks isolés ; aucune horloge ni donnée du navigateur.
function workoutUI(profile) {
  let cells = [], index = 0, tree, riffs = 0, clock = 0;
  const data = new Map([["coachAntoineSound", "off"], ["coachAntoineWorkoutFeedbackV1", JSON.stringify({ version: 1, sinceAsked: 2, lastLevel: null, pendingReason: null, sessions: [] })]]);
  data.set(DISCOVERY_KEY, JSON.stringify(workoutSteps.map((step) => step.id)));
  const react = { ...React,
    useContext: () => ({ profile }),
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial;
      return [cells[i], (next) => { cells[i] = typeof next === "function" ? next(cells[i]) : next; }]; },
    useRef(initial) { const i = index++; return cells[i] ??= { current: initial }; },
    useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect() {},
  };
  const module = { exports: {} };
  vm.runInNewContext(uiCode, { module,
    require: (name) => name === "react" ? react : require(name),
    localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [Date.parse("2026-10-18T10:00:00Z") + clock])); } static now() { return Date.parse("2026-10-18T10:00:00Z") + clock; } },
    crypto: { randomUUID: () => "test-session-6a" }, performance: { now: () => clock },
    window: { AudioContext: class { constructor() { riffs++; throw Error("unexpected audio"); } } },
  });
  function expand(node) {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.flat(Infinity).map(expand);
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(React.Children.toArray(node.props.children)) } };
  }
  const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props.children)];
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node === null || node === undefined || typeof node === "boolean" ? "" :
    typeof node !== "object" ? String(node) : text(node.props.children);
  function render() { index = 0; tree = expand(module.exports.Workout()); }
  function click(label) {
    const node = nodes(tree).find((item) => item.type === "button" && text(item) === label);
    assert.ok(node, `bouton ${label}`); clock += 400; node.props.onClick(); render();
  }
  render();
  function change(label) {
    const node = nodes(tree).find((item) => item.type === "label" && text(item) === label);
    assert.ok(node, label);
    nodes(node).find((item) => item.type === "input").props.onChange(); render();
  }
  function advance(ms) { clock += ms; cells.find((cell) => typeof cell?.tick === "function").tick(); render(); }
  return { click, change, advance, text: () => text(tree), data, riffs: () => riffs };
}

for (const mode of ["tu", "vous"]) {
  test(`Workout ${mode} : douze consignes, récupérations, fin et enregistrement sans doublon`, () => {
    const profile = profileFor(mode, "female");
    const texts = getPersonalizedTexts(profile);
    const ui = workoutUI(profile);
    ui.click("En forme");
    assert.ok(ui.text().includes(texts.pace));
    assert.ok(ui.text().includes(texts.safety));
    for (let index = 0; index < 12; index++) {
      assert.ok(ui.text().includes(mode === "vous" ? workoutSteps[index].noteVous : workoutSteps[index].note));
      ui.click("Suivant");
      if (index < 11) {
        assert.ok(ui.text().includes(texts.restMessage(index)));
        ui.click("Suivant");
      }
    }
    assert.doesNotMatch(ui.text(), /Belle séance aujourd’hui/);
    assert.ok(ui.text().includes(texts.adaptationQuestion));
    assert.doesNotMatch(ui.text(), /fier|fière|Bravo Antoine|undefined|\bnull\b/);
    const history = JSON.parse(ui.data.get("coachAntoineHistory"));
    assert.equal(history.length, 1);
    assert.equal(history[0].activeSeconds, 0);
    assert.equal(history[0].id, "test-session-6a");
    assert.equal(ui.riffs(), 0);
    ui.click("NON");
    ui.change("Récupération"); ui.click("CONTINUER");
    ui.change("Trop courte"); ui.click("VALIDER");
    assert.equal(ui.data.get("coachAntoineRestDuration"), "20");
    assert.ok(ui.text().includes(texts.restFeedback("short", 20)));
    ui.advance(7000); assert.ok(ui.text().includes("À BIENTÔT"));
    assert.doesNotMatch(ui.text(), /Les pauses.*convenu|On n.a pas rajeuni/);
    assert.equal(JSON.parse(ui.data.get("coachAntoineHistory")).length, 1);
  });
  for (const [label, day] of [["Petite forme", "low"], ["En forme", "normal"], ["Pleine forme", "high"]]) {
    test(`fin réelle ${mode}/${day} : prénom présent et absent`, () => {
      for (const firstName of ["Éloïse", ""]) {
        const profile = profileFor(mode, "female", firstName);
        const ui = workoutUI(profile);
        ui.click(label);
        for (let index = 0; index < 23; index++) ui.click("Suivant");
        ui.click("OUI");
        assert.ok(ui.text().includes(getPersonalizedTexts(profile).finish(day)));
        assert.doesNotMatch(ui.text(), /undefined|\bnull\b|Bravo Antoine|fier|fière/);
      }
    });
  }
}

test("accord accompagné/accompagnée : valeur stable, uniquement l’affichage varie", () => {
  const option = { value: "notSupportedEnough", label: "Je ne me sentais pas assez accompagné" };
  for (const mode of ["tu", "vous"]) {
    assert.equal(getStopReasonLabel(option, profileFor(mode, "male")), "Je ne me sentais pas assez accompagné");
    assert.equal(getStopReasonLabel(option, profileFor(mode, "female")), "Je ne me sentais pas assez accompagnée");
  }
  assert.equal(option.value, "notSupportedEnough");
});

test("changement de mode enregistré : nouvelles pages immédiatement cohérentes avec le profil relu", () => {
  const data = new Map([[PROFILE_KEY, JSON.stringify(profileFor())]]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  for (const addressMode of ["vous", "tu"]) {
    assert.equal(updateProfile({ addressMode }, storage).status, "saved");
    const profile = readProfile(storage).profile;
    assert.ok(renderPage("Home", profile).includes(getPersonalizedTexts(profile).program));
    assert.ok(renderPage("Workout", profile).includes(getPersonalizedTexts(profile).dayFormQuestion));
    assert.ok(renderPage("Progress", profile).includes(getPersonalizedTexts(profile).journey));
    assert.ok(renderPage("Carnet", profile).includes(getPersonalizedTexts(profile).zzTop));
    assert.equal(getCoachSayings(profile)[2], addressMode === "vous" ? "On avance à votre rythme." : "On avance à ton rythme.");
  }
});

for (const [label, seconds, choice] of [["OUI", 15, "yes"], ["Trop longue", 10, "long"]]) {
  test(`écran final distinct après ${label} : durée issue du réglage existant`, () => {
    const profile = profileFor("tu", "female", "marie");
    const ui = workoutUI(profile);
    ui.click("En forme");
    for (let i = 0; i < 23; i++) ui.click("Suivant");
    if (choice === "long") { ui.click("NON"); ui.change("Récupération"); ui.click("CONTINUER"); }
    if (choice === "long") { ui.change(label); ui.click("VALIDER"); } else ui.click(label);
    assert.ok(ui.text().includes(choice === "yes" ? getPersonalizedTexts(profile).finish("normal") : getPersonalizedTexts(profile).restFeedback(choice, seconds)));
    assert.equal(ui.data.get("coachAntoineRestDuration") ?? "15", String(seconds));
    assert.equal(JSON.parse(ui.data.get("coachAntoineHistory")).length, 1);
    if (choice === "long") ui.advance(7000);
    assert.ok(ui.text().includes("À BIENTÔT"));
    assert.doesNotMatch(ui.text(), /Tes exercices et tes temps de récupération/);
  });
}

test("commandes texte : Démarrer, Pause et Reprendre", () => {
  const ui = workoutUI(profileFor());
  ui.click("En forme");
  ui.click("Démarrer");
  ui.click("Pause");
  ui.click("Reprendre");
  assert.ok(ui.text().includes("Pause"));
});
