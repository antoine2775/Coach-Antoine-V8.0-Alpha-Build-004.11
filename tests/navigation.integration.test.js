import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { DRAFT_KEY, createWorkoutSession } from "../src/workout/session.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import { PROFILE_KEY } from "../src/utils/userProfile.js";
import { HISTORY_KEY } from "../src/utils/workoutHistory.js";
import { workoutSteps } from "../src/data.js";

const require = createRequire(import.meta.url);
const base = "/Coach-Antoine-V8.0-Alpha-Build-004.11";
const code = buildSync({ stdin: { contents: 'export { AppShell } from "./src/App.jsx"; export { UserProfileProvider } from "./src/context/UserProfileContext.jsx";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
  define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": JSON.stringify(base + "/") },
}).outputFiles[0].text;

async function setup({ oldDraft = false, withoutRandomUUID = false } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `http://localhost:5174${base}/onboarding` });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let clock = 0, id = 0;
  const openingTimers = new Map();
  const workoutTimers = new Map();
  dom.window.setInterval = (fn) => { const key = ++id; workoutTimers.set(key, fn); return key; };
  dom.window.clearInterval = (key) => workoutTimers.delete(key);
  const storage = dom.window.localStorage;
  storage.setItem("coachAntoineSound", "off");
  if (oldDraft) {
    const old = createWorkoutSession({ storage, uuid: () => "previous-session" });
    old.chooseDayForm("low", "forme");
    // Ancien brouillon sans niveau : fixture de compatibilité, pas nouvelle création.
    const legacyDraft = JSON.parse(storage.getItem(DRAFT_KEY));
    legacyDraft.level = null;
    storage.setItem(DRAFT_KEY, JSON.stringify(legacyDraft));
  }
  const initialDraft = storage.getItem(DRAFT_KEY);
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require, window: dom.window, document: dom.window.document,
    localStorage: storage, setTimeout: (fn) => { const key = ++id; openingTimers.set(key, fn); return key; }, clearTimeout: (key) => openingTimers.delete(key), performance: { now: () => clock }, crypto: withoutRandomUUID ? { getRandomValues: (bytes) => globalThis.crypto.getRandomValues(bytes) } : { randomUUID: () => `integration-${++id}` } });
  const { createRoot } = await import("react-dom/client");
  const { BrowserRouter } = require("react-router-dom");
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(BrowserRouter, { basename: base },
    React.createElement(module.exports.UserProfileProvider, { storage }, React.createElement(module.exports.AppShell)))));
  const text = () => document.body.textContent;
  async function click(label) {
    const node = [...document.querySelectorAll("button,a,label")].find((element) => element.textContent.trim() === label);
    assert.ok(node, `commande ${label} présente sur ${dom.window.location.pathname}`);
    assert.equal(node.disabled ?? false, false);
    clock += 400;
    await act(async () => node.click());
  }
  async function leaveSplash() {
    await act(async () => { const timers = [...openingTimers.values()]; openingTimers.clear(); timers.forEach((fn) => fn()); });
    await click("C'est parti !");
  }
  function assertSplash() {
    assert.ok(document.querySelector(".splash"), "véritable composant SplashScreen affiché");
    assert.equal(document.querySelector(".splash h1").textContent, "Coach Antoine");
    assert.ok(!text().includes("Bonjour Antoine !"));
    assert.ok(!text().includes("Commencer la séance"));
    assert.ok(!text().includes("AVANT DE COMMENCER"));
    assert.ok(!text().includes("Temps restant de l’exercice"));
    assert.ok(!text().includes("Séance terminée !"));
    assert.ok(!text().includes("Bienvenue !"), "séquence d’ouverture réinitialisée");
  }
  assertSplash();
  await leaveSplash();
  async function fill(name, value) {
    const input = [...document.querySelectorAll("input")].find((node) => node.name === name);
    assert.ok(input, name);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  async function onboarding(mode, choice) {
    await click(mode === "vous" ? "Je préfère qu’on se vouvoie" : "Oui, on se tutoie");
    await click("Continuer"); await click("Un homme");
    await fill("firstName", "Antoine"); await click("Continuer"); await click("Continuer");
    await fill("age", "40"); await click("Continuer");
    await click("J’ai lu et je confirme"); await click("Continuer");
    await click("Non, pas de matériel"); await click("Continuer"); await click("Continuer");
    for (const answer of ["Facile", "Facile", "Facile", "Facile", "3 fois par semaine ou plus", "Oui, régulièrement", "Oui, régulièrement", "Oui, et encore récemment", "Facile"]) await click(answer);
    await click("Commencer avec ce niveau"); await click("Continuer"); await click("Non, jamais.");
    assert.ok(text().includes(mode === "vous" ? "On fait votre première séance maintenant ?" : "On fait ta première séance maintenant ?"));
    await click(choice);
  }
  function assertHome() {
    assert.equal(dom.window.location.pathname.replace(/\/$/, ""), base);
    assert.ok(text().includes("Bonjour Antoine !"));
    assert.ok(text().includes("Commencer la séance"));
    assert.ok(text().includes("Programme du jour"));
    assert.ok(!text().includes("AVANT DE COMMENCER"));
    assert.ok(!text().includes("Temps restant de l’exercice"));
    assert.ok(!text().includes("PREMIÈRE DÉCOUVERTE"));
  }
  return { click, onboarding, storage, initialDraft, text, assertHome, assertSplash, leaveSplash, dom,
    async advance(ms) { clock += ms; await act(async () => { [...workoutTimers.values()].forEach((fn) => fn()); }); },
    async close() { await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document; } };
}

for (const mode of ["tu", "vous"]) {
  for (const oldDraft of [false, true]) {
    test(`parcours réel ${mode}, brouillon=${oldDraft} : Pas maintenant affiche le premier écran d’ouverture après les effets`, async () => {
      const ui = await setup({ oldDraft });
      try {
        await ui.onboarding(mode, "Pas maintenant");
        await act(async () => {});
        ui.assertSplash();
        assert.equal(JSON.parse(ui.storage.getItem(PROFILE_KEY)).onboardingCompleted, true);
        assert.equal(ui.storage.getItem(DRAFT_KEY), ui.initialDraft);
        assert.equal(ui.storage.getItem(HISTORY_KEY), null);
        assert.equal(ui.storage.getItem("coachAntoineDayForm"), oldDraft ? "low" : null);
        await ui.leaveSplash(); ui.assertHome();
        assert.equal(ui.storage.getItem(DRAFT_KEY), ui.initialDraft);
      } finally { await ui.close(); }
    });
  }
  test(`parcours réel ${mode} : onboarding → séance → fin → splash sans nouvelle séance`, async () => {
    const ui = await setup();
    try {
      await ui.onboarding(mode, "Oui, c’est parti !");
      assert.equal(ui.dom.window.location.pathname, base + "/seances");
      assert.ok(ui.text().includes("AVANT DE COMMENCER"));
      assert.equal(ui.storage.getItem(DRAFT_KEY), null);
      await ui.click("En forme");
      assert.ok(ui.text().includes("PREMIÈRE DÉCOUVERTE"));
      // Tous les vrais écrans d'exercice/récupération et toutes les découvertes.
      for (let guard = 0; !ui.text().includes("Séance terminée !") && guard < 40; guard++) {
        if (ui.dom.window.document.querySelector(".workout-hydration")) { await ui.advance(10_000); continue; }
        if (ui.dom.window.document.querySelector(".workout-transition")) { await ui.advance(7000); continue; }
        await ui.click(ui.text().includes("Commencer l’exercice") ? "Commencer l’exercice" : "Suivant");
      }
      assert.ok(ui.text().includes("Séance terminée !"));
      const history = ui.storage.getItem(HISTORY_KEY);
      assert.equal(JSON.parse(history).length, 1);
      const discoveries = ui.storage.getItem(DISCOVERY_KEY);
      await ui.click("À BIENTÔT"); await act(async () => {});
      ui.assertSplash();
      assert.equal(ui.storage.getItem(DRAFT_KEY), null);
      assert.equal(ui.storage.getItem(HISTORY_KEY), history);
      assert.equal(ui.storage.getItem(DISCOVERY_KEY), discoveries);
      await ui.leaveSplash(); ui.assertHome();
      assert.equal(ui.storage.getItem(DRAFT_KEY), null);
    } finally { await ui.close(); }
  });
}

for (const [label, value] of [["Petite forme", "low"], ["En forme", "normal"], ["Pleine forme", "high"]]) {
  test(`forme du jour sans randomUUID : ${label} sélectionnable sans exception`, async () => {
    const ui = await setup({ withoutRandomUUID: true });
    try {
      await ui.onboarding("tu", "Oui, c’est parti !");
      const choices = [...document.querySelectorAll('.day-form-choices button')];
      assert.equal(choices.length, 3);
      assert.ok(choices.every((button) => button.getAttribute("aria-pressed") === "false"));
      await ui.click(label);
      assert.ok(ui.text().includes("PREMIÈRE DÉCOUVERTE"));
      const draft = JSON.parse(ui.storage.getItem(DRAFT_KEY));
      assert.equal(draft.dayForm, value);
      assert.ok(typeof draft.id === "string" && draft.id.length > 0);
      assert.equal(draft.running, false);
      assert.equal(draft.activeSeconds, 0);
    } finally { await ui.close(); }
  });
}

test("Réglages : Retour retrouve Progression et conserve la modification immédiatement enregistrée", async () => {
  const ui = await setup();
  try {
    await ui.onboarding("tu", "Pas maintenant"); await ui.leaveSplash();
    await ui.click("Progression");
    await ui.click("Le Coach");
    assert.equal(ui.dom.window.location.pathname, base + "/coach");
    const returns = [...document.querySelectorAll("button")].filter((node) => node.textContent === "← Retour");
    assert.equal(returns.length, 1);
    assert.ok(returns[0].closest(".settings-heading"));
    await ui.click("Équilibré");
    assert.equal(JSON.parse(ui.storage.getItem(PROFILE_KEY)).selectedLevel, "forme");
    const returned = new Promise((resolve) => ui.dom.window.addEventListener("popstate", resolve, { once: true }));
    await act(async () => { await ui.click("← Retour"); await returned; });
    assert.equal(ui.dom.window.location.pathname, base + "/progression");
    assert.equal(document.querySelector("h1").textContent, "Progression");
    assert.equal(JSON.parse(ui.storage.getItem(PROFILE_KEY)).selectedLevel, "forme");
    assert.ok(!ui.text().includes("Enregistrer"));
  } finally { await ui.close(); }
});

test("Réglages : ouverture directe sans historique interne, Retour rejoint l’accueil", async () => {
  const ui = await setup();
  try {
    await ui.onboarding("vous", "Pas maintenant"); await ui.leaveSplash();
    // Simule l'entrée initiale de BrowserRouter sur /coach (index interne zéro).
    await act(async () => {
      ui.dom.window.history.replaceState({ idx: 0 }, "", base + "/coach");
      ui.dom.window.dispatchEvent(new ui.dom.window.PopStateEvent("popstate"));
    });
    assert.equal(ui.dom.window.location.pathname, base + "/coach");
    await ui.click("← Retour");
    ui.assertHome();
    assert.equal(JSON.parse(ui.storage.getItem(PROFILE_KEY)).onboardingCompleted, true);
  } finally { await ui.close(); }
});
