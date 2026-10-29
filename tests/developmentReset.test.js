import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { DEVELOPMENT_RESET_KEYS, resetDevelopmentData } from "../src/utils/developmentReset.js";
import { createEmptyProfile } from "../src/utils/userProfile.js";

const require = createRequire(import.meta.url);
const base = "/Coach-Antoine-V8.0-Alpha-Build-004.11/";
function memory() {
  const data = new Map(DEVELOPMENT_RESET_KEYS.map((key) => [key, `original:${key}`]));
  data.set("anotherApplication", "keep"); data.set("coachAntoineOtherUnknownKey", "keep-too");
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test("liste explicite : exactement les dix clés prévues", () => {
  assert.deepEqual(DEVELOPMENT_RESET_KEYS, ["coachAntoineProfile", "coachAntoineWorkoutDraftV1", "coachAntoineHistory", "coachAntoineExerciseDiscoveryV1", "coachAntoineWorkoutFeedbackV1", "coachAntoineBrainV1", "coachAntoineRestDuration", "coachAntoineDayForm", "coachAntoineSound", "coachAntoineWeight"]);
});

test("confirmation obligatoire : aucun effet sans true explicite", () => {
  const storage = memory(), before = new Map(storage.data);
  for (const confirmed of [undefined, false, null, "true", 1]) {
    assert.equal(resetDevelopmentData({ confirmed, storage }).status, "confirmation-required");
    assert.deepEqual(storage.data, before);
  }
});

test("suppression ciblée : dix clés effacées, aucune autre clé touchée", () => {
  const storage = memory();
  storage.clear = () => { throw Error("ne doit jamais être appelé"); };
  assert.equal(resetDevelopmentData({ confirmed: true, storage }).status, "reset");
  for (const key of DEVELOPMENT_RESET_KEYS) assert.equal(storage.data.has(key), false);
  assert.deepEqual([...storage.data], [["anotherApplication", "keep"], ["coachAntoineOtherUnknownKey", "keep-too"]]);
});

test("échec de suppression : erreur explicite et restauration des données", () => {
  const storage = memory(), before = new Map(storage.data);
  storage.removeItem = (key) => { if (key === "coachAntoineHistory") throw Error("denied"); storage.data.delete(key); };
  assert.equal(resetDevelopmentData({ confirmed: true, storage }).status, "unavailable");
  assert.deepEqual(storage.data, before);
});

function compiled(dev) {
  return buildSync({ entryPoints: ["src/App.jsx"], bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
    define: { "import.meta.env.BASE_URL": JSON.stringify(base), "import.meta.env.DEV": String(dev) },
  }).outputFiles[0].text;
}
const devCode = compiled(true), productionCode = compiled(false);
const validProfile = () => ({ ...createEmptyProfile(), firstName: "Ancien profil", age: 40, sex: "female", addressMode: "vous", safetyConfirmed: true,
  equipment: ["longBar"], proposedLevel: "forme", selectedLevel: "tonique", levelOrigin: "manual", assessmentAnswers: Array(9).fill("b"),
  assessmentDate: "2026-10-29T12:00:00Z", assessmentVersion: "1", previousProgramExperience: "never", onboardingCompleted: true, onboardingCurrentStep: 20 });
function seed() {
  const entries = new Map(DEVELOPMENT_RESET_KEYS.map((key) => [key, `old:${key}`]));
  entries.set("coachAntoineProfile", JSON.stringify(validProfile()));
  entries.set("coachAntoineSound", "off"); entries.set("coachAntoineExerciseDiscoveryV1", '["mobilite-epaules"]');
  entries.set("coachAntoineHistory", "[]"); entries.set("foreign-preference", "unchanged");
  return entries;
}

async function mount(entries, { dev = true, path = "coach" } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `http://localhost:5174${base}${path}` });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const [key, value] of entries) dom.window.localStorage.setItem(key, value);
  const reloads = [], timers = new Map(); let timerId = 0;
  const appWindow = new Proxy(dom.window, { get(target, key) {
    if (key === "location") return { replace: (url) => reloads.push(url) };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const module = { exports: {} };
  vm.runInNewContext(dev ? devCode : productionCode, { module, require, window: appWindow, document: dom.window.document,
    localStorage: dom.window.localStorage, setTimeout: (fn) => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id) });
  const { createRoot } = await import("react-dom/client");
  const { BrowserRouter } = require("react-router-dom");
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(BrowserRouter, { basename: base }, React.createElement(module.exports.default))));
  const snapshot = () => new Map(Object.entries(dom.window.localStorage));
  const text = () => dom.window.document.body.textContent;
  async function click(label) {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === label);
    assert.ok(button, label); assert.equal(button.disabled, false);
    await act(async () => button.click());
  }
  async function leaveSplash() {
    await act(async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); });
    await click("C'est parti !");
  }
  return { dom, reloads, text, click, snapshot, leaveSplash,
    async close() { await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document; } };
}

test("UI : premier clic ouvre seulement la confirmation, Annuler conserve tout", async () => {
  const ui = await mount(seed());
  try {
    await ui.leaveSplash();
    for (const label of ["Mon niveau", "Mon matériel", "Comment Coach Antoine me parle", "Riff de guitare", "Voix du Coach"]) assert.ok(ui.text().includes(label));
    assert.ok(document.querySelector('input[name="profile-level"][value="tonique"]').checked);
    assert.ok(document.querySelector('input[name="profile-address"][value="vous"]').checked);
    const before = ui.snapshot();
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    await ui.click("Remettre Coach Antoine à zéro");
    assert.ok(document.querySelector('[role="alertdialog"]'));
    assert.ok(ui.text().includes("Toutes les données locales de Coach Antoine seront supprimées."));
    assert.deepEqual(ui.snapshot(), before);
    assert.deepEqual(ui.reloads, []);
    await ui.click("Annuler");
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    assert.deepEqual(ui.snapshot(), before);
    assert.deepEqual(ui.reloads, []);
  } finally { await ui.close(); }
});

test("UI : confirmer efface tout Coach Antoine puis demande une nouvelle page, nouveau profil vierge", async () => {
  let ui = await mount(seed());
  let after;
  try {
    await ui.leaveSplash(); await ui.click("Remettre Coach Antoine à zéro"); await ui.click("Remettre à zéro");
    after = ui.snapshot();
    for (const key of DEVELOPMENT_RESET_KEYS) assert.equal(after.has(key), false);
    assert.deepEqual([...after], [["foreign-preference", "unchanged"]]);
    assert.deepEqual(ui.reloads, [base]);
  } finally { await ui.close(); }
  // Le navigateur crée un nouveau document lors de location.replace : nouveaux
  // provider, états du shell et modules, avec le stockage effectivement effacé.
  ui = await mount(after, { path: "" });
  try {
    assert.ok(document.querySelector(".splash"));
    assert.ok(!ui.text().includes("Ancien profil"));
    await ui.leaveSplash();
    assert.ok(ui.text().includes("Bonjour, moi c’est Coach Antoine."));
    assert.ok(!ui.text().includes("Commencer la séance"));
    assert.equal(document.querySelector('[data-onboarding-status="absent"]') !== null, true);
    assert.equal(ui.dom.window.localStorage.getItem("coachAntoineProfile"), null);
    assert.equal(ui.dom.window.localStorage.getItem("coachAntoineExerciseDiscoveryV1"), null);
    assert.equal(ui.dom.window.localStorage.getItem("foreign-preference"), "unchanged");
  } finally { await ui.close(); }
});

test("zone temporaire absente hors mode développement, réglages conservés", async () => {
  const ui = await mount(seed(), { dev: false });
  try {
    await ui.leaveSplash();
    assert.ok(!ui.text().includes("ZONE DE TEST"));
    assert.ok(!ui.text().includes("Remettre Coach Antoine à zéro"));
    assert.ok(ui.text().includes("Mon niveau"));
    assert.ok(ui.text().includes("Riff de guitare"));
  } finally { await ui.close(); }
});

test("UI : échec d'effacement signalé, aucun redémarrage, nouvelle tentative possible", async () => {
  const ui = await mount(seed());
  const prototype = ui.dom.window.Storage.prototype, remove = prototype.removeItem;
  try {
    await ui.leaveSplash();
    const before = ui.snapshot();
    prototype.removeItem = function(key) { if (key === "coachAntoineHistory") throw Error("denied"); return remove.call(this, key); };
    await ui.click("Remettre Coach Antoine à zéro"); await ui.click("Remettre à zéro");
    assert.ok(document.querySelector('[role="alert"]'));
    assert.ok(ui.text().includes("La remise à zéro n’a pas pu être effectuée."));
    assert.deepEqual(ui.reloads, []);
    assert.deepEqual(ui.snapshot(), before);
    prototype.removeItem = remove;
    await ui.click("Remettre à zéro");
    assert.deepEqual(ui.reloads, [base]);
    assert.equal(ui.dom.window.localStorage.getItem("coachAntoineProfile"), null);
  } finally { prototype.removeItem = remove; await ui.close(); }
});
