import { workoutSteps } from "../src/data.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { buildSync } from "esbuild";
import { FEEDBACK_KEY } from "../src/workout/feedback.js";
import { DRAFT_KEY } from "../src/workout/session.js";
import { HISTORY_KEY } from "../src/utils/workoutHistory.js";
import { WORKOUT_CONFIG } from "../src/workout/config.js";

const require = createRequire(import.meta.url);
const code = buildSync({
  entryPoints: ["src/pages/Workout.jsx"], bundle: true, write: false,
  platform: "node", format: "cjs", external: ["react", "react-router-dom"],
  define: { "import.meta.env.BASE_URL": '"/"' },
}).outputFiles[0].text;

// Le vrai composant ET son hook sont exécutés. Les effets sont montés/nettoyés,
// avec événements du navigateur et horloge contrôlés, sans attente réelle.
function mount({ mode = "tu", due = false, newUser = false } = {}) {
  let cells = [], index = 0, dirty = true, pending = [], tree, clock = 0, wall = Date.parse("2026-10-18T10:00:00Z"), id = 0;
  const data = new Map([["coachAntoineSound", "off"]]);
  if (due) data.set(FEEDBACK_KEY, JSON.stringify({ version: 1, sinceAsked: 2, lastLevel: "forme", pendingReason: null, sessions: [] }));
  if (!newUser) data.set(DISCOVERY_KEY, JSON.stringify(workoutSteps.map((step) => step.id)));
  const timers = new Map(), documentListeners = new Map(), windowListeners = new Map(), failures = new Set();
  const document = { visibilityState: "visible", addEventListener: (name, fn) => documentListeners.set(name, fn),
    removeEventListener: (name) => documentListeners.delete(name) };
  const window = {
    addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: (name) => windowListeners.delete(name),
    setInterval(fn) { timers.set(++id, fn); return id; }, clearInterval(key) { timers.delete(key); },
  };
  const profile = { firstName: "marie", addressMode: mode, sex: "female", selectedLevel: "forme" };
  const react = { ...React,
    useContext: () => ({ profile }),
    useState(initial) {
      const cell = index++;
      if (!(cell in cells)) cells[cell] = typeof initial === "function" ? initial() : initial;
      return [cells[cell], (value) => { cells[cell] = typeof value === "function" ? value(cells[cell]) : value; dirty = true; }];
    },
    useEffect(fn, deps) {
      const cell = index++;
      if (!cells[cell] || deps.some((value, i) => !Object.is(value, cells[cell].deps[i]))) {
        pending.push(() => { cells[cell]?.cleanup?.(); cells[cell] = { effect: true, deps, cleanup: fn() }; });
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => name === "react" ? react : require(name), document, window,
    performance: { now: () => clock }, crypto: { randomUUID: () => `ui-session-${++id}` },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [wall])); } static now() { return wall; } },
    localStorage: { getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => { if (failures.has(key)) throw Error("quota"); data.set(key, value); },
      removeItem: (key) => data.delete(key) },
  });
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(React.Children.toArray(node.props.children)) } };
  }
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node === null || node === undefined || typeof node === "boolean" || node?.props?.["aria-hidden"] === "true"
    ? "" : typeof node !== "object" ? String(node) : text(node.props.children);
  const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object"
    ? [] : [node, ...nodes(node.props.children)];
  function flush() {
    let guard = 0;
    while (dirty || pending.length) {
      assert.ok(++guard < 20, "pas de boucle de rendu/effet");
      if (dirty) { dirty = false; index = 0; tree = expand(module.exports.default()); }
      const effects = pending; pending = []; effects.forEach((fn) => fn());
    }
  }
  flush();
  return {
    data, timers, failures, text: () => text(tree),
    nodes: () => nodes(tree),
    click(label) {
      const node = nodes(tree).find((item) => text(item) === label && typeof item.props.onClick === "function");
      assert.ok(node, `commande ${label}`); if (node.props.disabled) return; clock += 400; wall += 400; node.props.onClick(); flush();
    },
    change(label, group) {
      const node = nodes(tree).find((item) => item.type === "label" && text(item) === label && (!group || nodes(item).some((child) => child.props.name === "feedback-" + group)));
      assert.ok(node, label);
      nodes(node).find((item) => item.type === "input").props.onChange(); flush();
    },
    disabled(label) { return nodes(tree).find((node) => node.type === "button" && text(node) === label)?.props.disabled; },
    advance(ms) { clock += ms; wall += ms; [...timers.values()].forEach((fn) => fn()); flush(); },
    visibility(value) { document.visibilityState = value; documentListeners.get("visibilitychange")?.(); flush(); },
    leave() { cells.filter((cell) => cell?.effect).forEach((cell) => cell.cleanup?.()); cells = []; dirty = true; },
    return() { flush(); },
    finish() { for (let count = 0; count < 23; count++) this.click("Suivant"); },
  };
}

test("UI et vrais effets : lancement unique, récupération et 3/2/1 puis exercice suivant", () => {
  const ui = mount(); ui.click("En forme"); ui.click("Démarrer");
  assert.equal(ui.timers.size, 1);
  ui.advance(60_000); assert.ok(ui.text().includes("Récupération"));
  ui.advance(12_000);
  for (const remaining of [3, 2, 1]) {
    const timer = ui.nodes().find((node) => node.props.className?.includes("timer--countdown"));
    assert.ok(timer); assert.equal(timer.props.children.join(""), String(remaining));
    if (remaining !== 1) ui.advance(1000);
  }
  ui.advance(1000);
  assert.ok(ui.text().includes("Marche active sur place"));
  assert.ok(ui.text().includes("Exercice 2 / 12"));
  assert.doesNotMatch(ui.text(), /Récupération/);
});

for (const mode of ["tu", "vous"]) test(`UI interruption, navigation et reprise ${mode}`, () => {
  const ui = mount({ mode }); ui.click("En forme"); ui.click("Démarrer"); ui.advance(2500);
  ui.visibility("hidden");
  assert.ok(ui.text().includes(mode === "vous" ? "Votre séance est en pause." : "Ta séance est en pause."));
  ui.advance(600_000); ui.visibility("visible");
  assert.ok(ui.text().includes("REPRENDRE LA SÉANCE"));
  ui.click("REPRENDRE LA SÉANCE"); assert.ok(ui.text().includes("00:58"));
  ui.leave(); assert.equal(ui.timers.size, 0);
  ui.advance(90_000); ui.return();
  assert.ok(ui.text().includes("REPRENDRE LA SÉANCE"));
  ui.click("NOUVELLE SÉANCE");
  assert.ok(ui.text().includes("Petite forme")); assert.equal(ui.data.has(HISTORY_KEY), false);
  assert.equal(ui.data.has(DRAFT_KEY), false);
});

test("UI cadence : seules les troisième et suivantes prévues posent la question", () => {
  const ui = mount();
  for (let count = 1; count <= 3; count++) {
    ui.click("En forme"); ui.finish();
    assert.equal(ui.text().includes("Tes exercices et tes temps de récupération étaient-ils bien adaptés aujourd’hui ?"), count === 3);
    assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, count);
    if (count === 3) ui.click("OUI");
    const goodbye = ui.nodes().find((node) => node.props.to === "/" && node.props.className === "primary-button");
    assert.ok(goodbye);
    ui.click("À BIENTÔT");
    ui.leave(); ui.return(); // Une nouvelle visite volontaire monte une nouvelle séance.
  }
});

for (const [category, choice, stored] of [["PAUSES", "Trop courte", "pauses"], ["DURÉE", "Trop longue", "duration"],
  ["DIFFICULTÉ", "Trop difficile", "difficulty"]]) {
  test(`UI parcours NON → ${category} → ${choice}`, () => {
    const ui = mount({ due: true }); ui.click("En forme"); ui.finish();
    ui.click("NON"); assert.ok(ui.text().includes("Qu’est-ce qu’on pourrait mieux adapter ?"));
    ui.change({ PAUSES: "Récupération", DURÉE: "Durée des exercices", DIFFICULTÉ: "Difficulté des exercices" }[category]); ui.click("CONTINUER");
    ui.change(choice); ui.click("VALIDER");
    assert.ok(ui.text().includes("Merci pour ton retour."));
    ui.advance(7000); assert.ok(ui.text().includes("À BIENTÔT")); assert.ok(ui.text().includes("Marie"));
    assert.equal(JSON.parse(ui.data.get(FEEDBACK_KEY)).sessions[0].response.answers[stored], { pauses: "short", duration: "long", difficulty: "hard" }[stored]);
    assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
  });
}

test("UI : timeout via le vrai effet, sans réglage ni réponse implicite", () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish();
  ui.click("NON"); ui.change("Récupération"); ui.click("CONTINUER"); ui.advance(WORKOUT_CONFIG.END_FEEDBACK_TIMEOUT);
  assert.ok(ui.text().includes("À BIENTÔT"));
  assert.equal(ui.data.has("coachAntoineRestDuration"), false);
  assert.equal(JSON.parse(ui.data.get(FEEDBACK_KEY)).sessions[0].response, null);
  assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
});

test("UI : erreur historique et retry accessibles, sans son ni double enregistrement", () => {
  const ui = mount({ due: true }); ui.failures.add(HISTORY_KEY);
  ui.click("En forme"); ui.finish();
  assert.ok(ui.text().includes("Réessayer l'enregistrement"));
  ui.failures.delete(HISTORY_KEY); ui.click("Réessayer l'enregistrement");
  assert.ok(ui.text().includes("Tes exercices et tes temps de récupération"));
  ui.click("OUI"); assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
});

const selections = [["Récupération"], ["Durée des exercices"], ["Difficulté des exercices"], ["Récupération", "Durée des exercices"],
  ["Récupération", "Difficulté des exercices"], ["Durée des exercices", "Difficulté des exercices"], ["Récupération", "Durée des exercices", "Difficulté des exercices"]];
for (const selected of selections) test(`UI ${selected.join(" + ")} : cases multiples, un écran et validation complète`, () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish(); ui.click("NON");
  assert.doesNotMatch(ui.text(), /Séance terminée|Belle séance|Séance enregistrée/);
  assert.equal(ui.nodes().filter((node) => node.type === "img").length, 1);
  assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox").length, 3);
  assert.equal(ui.disabled("CONTINUER"), true);
  ui.click("CONTINUER"); assert.ok(ui.text().includes("Qu’est-ce qu’on pourrait mieux adapter ?"));
  for (const label of selected) ui.change(label);
  assert.equal(ui.disabled("CONTINUER"), false); ui.click("CONTINUER");
  assert.ok(ui.text().includes("Précise-moi ce qui te conviendrait."));
  assert.doesNotMatch(ui.text(), /Séance terminée|Belle séance/);
  assert.equal(ui.nodes().filter((node) => node.type === "img").length, 1);
  assert.equal(ui.nodes().filter((node) => node.type === "fieldset").length, selected.length);
  assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.type === "radio").length, selected.length * 2);
  const expected = {};
  for (const label of selected) {
    assert.equal(ui.disabled("VALIDER"), true); ui.click("VALIDER");
    assert.equal(ui.data.has("coachAntoineRestDuration"), false);
    const [choice, key, value] = { "Récupération": ["Trop courte", "pauses", "short"],
      "Durée des exercices": ["Trop longue", "duration", "long"], "Difficulté des exercices": ["Trop difficile", "difficulty", "hard"] }[label];
    ui.change(choice, key); expected[key] = value;
  }
  assert.equal(ui.disabled("VALIDER"), false); ui.click("VALIDER");
  assert.ok(ui.text().includes("Merci pour ton retour."));
  assert.deepEqual(JSON.parse(ui.data.get(FEEDBACK_KEY)).sessions[0].response.answers, expected);
  assert.equal(ui.data.get("coachAntoineRestDuration") ?? null, selected.includes("Récupération") ? "20" : null);
  if (selected.includes("Récupération")) assert.ok(ui.text().includes("les récupérations passeront à 20 secondes."));
  if (selected.includes("Récupération") && selected.length > 1) assert.ok(ui.text().includes("j’ai bien noté tes autres remarques et je vais essayer d’en tenir compte à l’avenir."));
  assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
  ui.advance(7000);
  assert.ok(ui.text().includes("À BIENTÔT")); assert.ok(ui.text().includes("pour une prochaine séance."));
  assert.doesNotMatch(ui.text(), /récupérations passeront|autres remarques/);
});

test("UI : radios exclusifs dans leur groupe, sans effacer les autres catégories", () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish(); ui.click("NON");
  ui.change("Récupération"); ui.change("Durée des exercices"); ui.change("Difficulté des exercices"); ui.change("Difficulté des exercices");
  ui.click("CONTINUER"); ui.change("Trop courte", "pauses"); ui.change("Trop courte", "duration"); ui.change("Trop longue", "pauses");
  assert.equal(ui.nodes().filter((node) => node.type === "fieldset").length, 2);
  const checked = ui.nodes().filter((node) => node.type === "input" && node.props.checked);
  assert.equal(checked.length, 2);
  assert.equal(checked.find((node) => node.props.name === "feedback-pauses").props.value, "long");
  assert.equal(checked.find((node) => node.props.name === "feedback-duration").props.value, "short");
  ui.click("VALIDER");
  assert.deepEqual(JSON.parse(ui.data.get(FEEDBACK_KEY)).sessions[0].response.answers, { pauses: "long", duration: "short" });
});

test("UI finale allégée : ordre du contenu, légende sous le bouton et Coach tout en bas", () => {
  const ui = mount(); ui.click("En forme"); ui.finish();
  assert.ok(ui.text().includes("Belle séance aujourd’hui, Marie !"));
  assert.doesNotMatch(ui.text(), /Séance enregistrée\.|Enregistrement de la séance|À bientôt pour la prochaine/);
  const nodes = ui.nodes();
  const card = nodes.find((node) => node.type === "section" && node.props.className.includes("farewell-card"));
  assert.equal(card.props.children[0].type, "h1");
  assert.equal(card.props.children.at(-1).props.className, "farewell-coach");
  const linkIndex = nodes.findIndex((node) => node.props.to === "/");
  const captionIndex = nodes.findIndex((node) => node.props.className === "farewell-caption");
  const avatarIndex = nodes.findIndex((node) => node.type === "img");
  assert.ok(linkIndex < captionIndex && captionIndex < avatarIndex);
});

test("UI récupération : état textuel distinct des commandes et libellé corrigé", () => {
  const ui = mount(); ui.click("En forme"); ui.click("Démarrer"); ui.advance(60_000);
  const status = ui.nodes().find((node) => node.props.className === "recovery-status");
  assert.equal(status.type, "h2"); assert.equal(status.props.onClick, undefined);
  assert.ok(ui.text().includes("Temps restant de récupération"));
  assert.doesNotMatch(ui.text(), /Temps restant de la pause/);
  assert.equal(ui.nodes().filter((node) => node.type === "button").length, 2);
});

for (const screen of ["general", "category", "detail"]) test(`UI timeout ${screen} avec la nouvelle architecture`, () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish();
  if (screen !== "general") { ui.click("NON"); ui.change("Récupération"); ui.change("Durée des exercices"); }
  if (screen === "detail") { ui.click("CONTINUER"); ui.change("Trop courte"); }
  ui.advance(WORKOUT_CONFIG.END_FEEDBACK_TIMEOUT);
  assert.ok(ui.text().includes("À BIENTÔT"));
  assert.equal(ui.data.has("coachAntoineRestDuration"), false);
  assert.equal(JSON.parse(ui.data.get(FEEDBACK_KEY)).sessions[0].response, null);
  assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
});

test("UI réponse sans bouton puis au revoir automatique après exactement 7 secondes", () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish(); ui.click("NON");
  ui.change("Récupération"); ui.change("Durée des exercices"); ui.change("Difficulté des exercices");
  ui.click("CONTINUER"); ui.change("Trop courte", "pauses"); ui.change("Trop longue", "duration");
  ui.change("Trop difficile", "difficulty"); ui.click("VALIDER");
  assert.ok(ui.text().includes("D’accord Marie. La prochaine fois, les récupérations passeront à 20 secondes."));
  assert.ok(ui.text().includes("Merci, j’ai bien noté tes autres remarques et je vais essayer d’en tenir compte à l’avenir."));
  assert.doesNotMatch(ui.text(), /À BIENTÔT|Bonne journée|Bonne soirée|Séance terminée !/);
  assert.equal(ui.nodes().filter((node) => node.type === "button" || node.props.to).length, 0);
  ui.advance(6999); assert.doesNotMatch(ui.text(), /À BIENTÔT/);
  ui.advance(1); assert.ok(ui.text().includes("À BIENTÔT"));
  assert.doesNotMatch(ui.text(), /récupérations passeront|autres remarques|Merci pour ton retour/);
  assert.equal(ui.nodes().find((node) => node.type === "section").props.children.at(-1).props.className, "farewell-coach");
  assert.equal(JSON.parse(ui.data.get(HISTORY_KEY)).length, 1);
});

test("UI cartes : sélection visible, coche, contrôle natif accessible et intitulés complets", () => {
  const ui = mount({ due: true }); ui.click("En forme"); ui.finish();
  assert.ok(ui.text().includes("Tes exercices et tes temps de récupération étaient-ils bien adaptés aujourd’hui ?"));
  ui.click("NON");
  assert.equal(ui.nodes().filter((node) => node.type === "label" && node.props.className === "feedback-selection-card").length, 3);
  ui.change("Récupération"); ui.change("Durée des exercices");
  const selected = ui.nodes().filter((node) => node.type === "label" && node.props.className?.includes("is-selected"));
  assert.equal(selected.length, 2);
  assert.equal(ui.nodes().filter((node) => node.props.className === "feedback-selection-mark" && node.props.children.includes("✓")).length, 2);
  assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.type === "checkbox" && node.props.checked).length, 2);
  ui.change("Récupération"); assert.equal(ui.nodes().filter((node) => node.type === "input" && node.props.checked).length, 1);
});

test("UI Coach discret et à la même place dans toute la conversation", () => {
  const ui = mount({ due: true, mode: "vous" }); ui.click("En forme"); ui.finish();
  function checkCoach() {
    const heading = ui.nodes().find((node) => node.props.className === "feedback-heading");
    assert.ok(heading); assert.equal(heading.props.children.at(-1).props.className, "feedback-coach");
    assert.equal(ui.nodes().find((node) => node.props.className === "coach-avatar-v65").props.style.width, 88);
  }
  checkCoach(); ui.click("NON"); checkCoach();
  ui.change("Difficulté des exercices"); ui.click("CONTINUER"); checkCoach();
  assert.ok(ui.text().includes("Précisez-moi ce qui vous conviendrait."));
  ui.change("Trop difficile"); ui.click("VALIDER"); checkCoach();
  assert.ok(ui.text().includes("Merci pour votre retour."));
});

for (const mode of ["tu", "vous"]) for (const form of ["En forme", "Petite forme", "Pleine forme"]) {
  test(`UI ${mode}/${form} : félicitations réservées au congé, question seule avant OUI/NON`, () => {
    const ui = mount({ due: true, mode }); ui.click(form); ui.finish();
    assert.doesNotMatch(ui.text(), /Belle séance|Bravo|Aujourd’hui, on a fait plus léger|Une séance un peu plus soutenue/);
    assert.ok(ui.text().includes(mode === "tu" ? "Tes exercices et tes temps de récupération" : "Vos exercices et vos temps de récupération"));
    assert.equal(ui.nodes().filter((node) => node.type === "button").length, 2);
    ui.click("OUI");
    assert.ok(ui.text().includes("À BIENTÔT"));
    assert.match(ui.text(), /Belle séance|Bravo/);
  });
}

test("UI nouvel utilisateur : découverte obligatoire, animation commune et revue volontaire", () => {
  const ui = mount({ newUser: true });
  const choices = ui.nodes().filter((node) => node.type === "button" && node.props["aria-pressed"] !== undefined);
  assert.equal(choices.length, 3);
  assert.ok(choices.every((node) => node.props["aria-pressed"] === false));
  ui.click("En forme");
  assert.ok(ui.text().includes("PREMIÈRE DÉCOUVERTE"));
  assert.ok(ui.text().includes("Commencer l’exercice"));
  assert.ok(ui.nodes().some((node) => node.type === "svg" && node.props.className === "exercise-animation"));
  ui.advance(10_000);
  ui.click("Commencer l’exercice");
  ui.advance(2000);
  ui.click("Consigne et démo");
  assert.ok(ui.text().includes("Reprendre l’exercice"));
  assert.ok(!ui.text().includes("PREMIÈRE DÉCOUVERTE"));
  const before = JSON.parse(ui.data.get(DRAFT_KEY)).remaining;
  ui.advance(20_000);
  assert.equal(JSON.parse(ui.data.get(DRAFT_KEY)).remaining, before);
  ui.click("Reprendre l’exercice");
  ui.advance(1000);
  assert.ok(JSON.parse(ui.data.get(DRAFT_KEY)).remaining < before);
});

test("UI fin de séance : destination accueil et historique intact après sortie", () => {
  const ui = mount(); ui.click("En forme"); ui.finish();
  const exit = ui.nodes().find((node) => node.props.to === "/" && typeof node.props.onClick === "function");
  assert.ok(exit, "lien de sortie vers l’accueil");
  const before = ui.data.get(HISTORY_KEY);
  assert.equal(JSON.parse(before).length, 1);
  let prevented = false;
  exit.props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(ui.data.has(DRAFT_KEY), false);
  assert.equal(ui.data.get(HISTORY_KEY), before);
});

test("UI fin non enregistrée : sortie bloquée, brouillon conservé pour réessayer", () => {
  const ui = mount(); ui.failures.add(HISTORY_KEY); ui.click("En forme"); ui.finish();
  const exit = ui.nodes().find((node) => node.props.to === "/" && typeof node.props.onClick === "function");
  assert.ok(exit);
  let prevented = false;
  exit.props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.data.has(DRAFT_KEY), true);
});

test("récupération : consigne après le chrono et avant le prochain exercice", () => {
  const ui = mount(); ui.click("En forme"); ui.click("Démarrer"); ui.advance(60_000);
  const content = ui.text();
  assert.ok(content.indexOf("Récupération") < content.indexOf("Temps restant de récupération"));
  assert.ok(content.indexOf("Temps restant de récupération") < content.indexOf("00:15"));
  assert.ok(content.indexOf("00:15") < content.indexOf("Respire tranquillement."));
  assert.ok(content.indexOf("Respire tranquillement.") < content.indexOf("Prochain exercice :"));
  assert.ok(content.indexOf("Prochain exercice :") < content.indexOf("Progression globale de la séance"));
});
