import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import vm from "node:vm";
import { getWelcomePhrase } from "../src/coach/coachEngine.js";

const key = "coachAntoineBrainV1";
const now = Date.parse("2026-11-02T12:00:00Z");
const hours72 = 72 * 60 * 60 * 1000;
function storage(initial = {}) {
  const data = new Map([[key, JSON.stringify(initial)]]);
  let writes = 0;
  const api = { getItem: k => data.get(k) ?? null, setItem(k, value) { writes++; data.set(k, value); } };
  globalThis.localStorage = api;
  return { api, memory: () => JSON.parse(data.get(key)), writes: () => writes };
}
const greet = options => getWelcomePhrase({ now, profile: { firstName: "  antoine " }, ...options });

test("Accueil : trois intervalles égaux et accords, y compris sans prénom", () => {
  const expected = ["Bonjour Antoine !", "Bonjour Antoine ! Prêt pour une bonne séance ?",
    "Bonjour Antoine ! On y va ?"];
  for (let i = 0; i < 300; i++) {
    storage();
    assert.equal(greet({ random: () => (i + 0.5) / 300 }), expected[Math.floor(i / 100)]);
  }
  storage();
  assert.equal(greet({ profile: { firstName: "élise", sex: "female", addressMode: "vous" }, random: () => 0.5 }),
    "Bonjour Élise ! Prête pour une bonne séance ?");
  for (const [random, expected] of [[0, "Bonjour !"], [0.5, "Bonjour ! Prêt pour une bonne séance ?"],
    [0.99, "Bonjour ! On y va ?"]]) {
    storage();
    assert.equal(greet({ profile: {}, random: () => random }), expected);
  }
});

test("Accueil : alternance persistante, deux candidates équiprobables et aucun silence", () => {
  for (const previous of ["home-welcome-simple", "home-welcome-ready", "home-welcome-reunion"]) {
    const counts = new Map();
    for (let i = 0; i < 100; i++) {
      const store = storage({ lastWelcomePhraseId: previous, silenceUntil: now + hours72,
        recentPhraseIds: [], lastSpokenAt: now });
      assert.ok(greet({ random: () => (i + 0.5) / 100, silenceChance: 1, minimumGapMs: hours72,
        policy: { frequent: { probability: 0 } } }));
      const selected = store.memory().lastWelcomePhraseId;
      assert.notEqual(selected, previous);
      counts.set(selected, (counts.get(selected) || 0) + 1);
    }
    assert.deepEqual([...counts.values()], [50, 50]);
  }
  const store = storage();
  let previous;
  for (let i = 0; i < 50; i++) {
    const text = greet({ random: () => 0 });
    assert.notEqual(text, previous);
    previous = text;
  }
  assert.equal(store.memory().lastVisitAt, new Date(now).toISOString());
});

test("Accueil : retour garanti à 72 h, date actualisée et variante normale préservée", () => {
  for (const elapsed of [hours72 - 1, hours72, hours72 + 1]) {
    const initial = { lastVisitAt: new Date(now - elapsed).toISOString(), lastWelcomePhraseId: "home-welcome-simple",
      silenceUntil: now + hours72, lastSpokenAt: now, recentPhraseIds: ["welcome-ready"] };
    const store = storage(initial);
    const text = greet({ random: () => 0 });
    assert.equal(text, elapsed >= hours72 ? "Bonjour Antoine ! Je suis content de te retrouver."
      : "Bonjour Antoine ! Prêt pour une bonne séance ?");
    assert.equal(store.writes(), 1);
    assert.equal(store.memory().lastVisitAt, new Date(now).toISOString());
    assert.deepEqual(store.memory().recentPhraseIds, initial.recentPhraseIds);
    assert.equal(store.memory().lastSpokenAt, now);
    if (elapsed >= hours72) {
      assert.equal(store.memory().lastWelcomePhraseId, initial.lastWelcomePhraseId);
      assert.equal(greet({ random: () => 0 }), "Bonjour Antoine ! Prêt pour une bonne séance ?");
    }
  }
  storage({ lastVisitAt: new Date(now - hours72).toISOString() });
  assert.equal(greet({ profile: null }), "Bonjour ! Je suis content de te retrouver.");
  for (const lastVisitAt of [null, "invalide", new Date(now + hours72).toISOString()]) {
    storage({ lastVisitAt });
    assert.equal(greet({ random: () => 0 }), "Bonjour Antoine !");
  }
});

test("Accueil : preview/noWrite ne modifient pas la mémoire, stockage indisponible sans silence", () => {
  for (const mode of ["preview", "noWrite"]) {
    const store = storage();
    assert.ok(greet({ [mode]: true }));
    assert.equal(store.writes(), 0);
  }
  globalThis.localStorage = { getItem() { throw Error("indisponible"); }, setItem() { throw Error("indisponible"); } };
  assert.equal(greet({ random: () => 0 }), "Bonjour Antoine !");
});

test("Home sous StrictMode : un seul accueil retour, un seul enregistrement, contenu conservé", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const store = storage({ lastVisitAt: "2020-01-01T00:00:00Z" });
  const code = buildSync({ stdin: { contents: 'export { default as Home } from "./src/pages/Home.jsx"; export { UserProfileContext } from "./src/context/UserProfileContext.jsx";', resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
    define: { "import.meta.env.BASE_URL": '"/"', "import.meta.env.DEV": "false" } }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: createRequire(import.meta.url), localStorage: store.api });
  const { MemoryRouter } = await import("react-router-dom");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const tree = () => React.createElement(React.StrictMode, null,
    React.createElement(MemoryRouter, null, React.createElement(module.exports.UserProfileContext.Provider,
      { value: { profile: null } }, React.createElement(module.exports.Home))));
  try {
    await act(async () => root.render(tree()));
    assert.equal(document.querySelector("h1").textContent, "Bonjour ! Je suis content de te retrouver.");
    assert.equal(store.writes(), 1);
    await act(async () => root.render(tree()));
    assert.equal(store.writes(), 1);
    const text = document.body.textContent;
    assert.ok(text.includes("Déroulé de la séance"));
    assert.ok(text.includes("Le plus difficile, c'est de commencer."));
    assert.ok(text.includes("Commencer la séance"));
    assert.equal(document.querySelectorAll(".program-row").length, 4);
    for (const description of ["Préparer progressivement le corps.", "Entretenir force et tonus.",
      "Travailler stabilité et contrôle.", "Conserver de l’aisance et terminer en douceur."]) assert.ok(text.includes(description));
    assert.equal(document.querySelector(".hero-card__ready"), null);
    assert.ok(!text.includes("AUJOURD'HUI"));
    assert.ok(!text.includes("Programme du jour"));
    assert.ok(!text.includes("Coach Antoine va"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
  }
});
