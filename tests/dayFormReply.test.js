import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import vm from "node:vm";
import { workoutSteps } from "../src/data.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";
import { DRAFT_KEY } from "../src/workout/session.js";

const code = buildSync({ stdin: { contents: 'export { default as Workout } from "./src/pages/Workout.jsx"; export { UserProfileContext } from "./src/context/UserProfileContext.jsx";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
  define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": '"/"' } }).outputFiles[0].text;
const choices = [
  ["Petite forme", "low", "D’accord, aujourd’hui on y va tranquillement."],
  ["En forme", "normal", "Parfait, on est parti pour la séance."],
  ["Pleine forme", "high", "Super, alors on peut mettre un peu plus de tonus aujourd’hui."],
];

async function mount({ mode = "tu", discovered = false, audio = "normal" } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test/seances" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let now = 0, id = 0, cancellations = 0;
  const timers = new Map(), spoken = [];
  dom.window.setTimeout = (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; };
  dom.window.clearTimeout = key => timers.delete(key);
  dom.window.setInterval = () => ++id;
  dom.window.clearInterval = () => {};
  if (audio !== "absent") {
    dom.window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    dom.window.speechSynthesis = {
      speak(utterance) { if (audio === "throw") throw Error("audio bloqué"); spoken.push(utterance); },
      cancel() { cancellations++; },
    };
  }
  const storage = dom.window.localStorage;
  if (discovered) storage.setItem(DISCOVERY_KEY, JSON.stringify(workoutSteps.map(step => step.id)));
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: createRequire(import.meta.url), window: dom.window,
    document: dom.window.document, localStorage: storage, performance: { now: () => now }, crypto: { randomUUID: () => "day-form-session" } });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(module.exports.UserProfileContext.Provider, { value: { profile: { addressMode: mode, selectedLevel: "forme" } } },
      React.createElement(module.exports.Workout)))));
  return { spoken, storage, timers, cancellations: () => cancellations,
    text: () => document.body.textContent,
    async click(label, twice = false) {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent === label);
      assert.ok(button, label);
      await act(async () => { button.click(); if (twice) button.click(); });
    },
    async event(name) { await act(async () => spoken[0]?.[name]?.()); },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= target);
        if (!next) break;
        now = next[1].at; timers.delete(next[0]);
        await act(async () => next[1].fn());
      }
      now = target;
    },
    async close() { await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document; },
  };
}

for (const mode of ["tu", "vous"]) for (const [label, value, reply] of choices) {
  test(`forme ${mode}/${value} : réponse parlée, écran conservé, fin réelle + 800 ms, découverte`, async () => {
    const ui = await mount({ mode });
    try {
      assert.ok(ui.text().includes(mode === "tu" ? "Comment te sens-tu aujourd’hui ?" : "Comment vous sentez-vous aujourd’hui ?"));
      assert.equal(document.querySelectorAll(".day-form-choices button").length, 3);
      assert.ok(ui.text().includes(mode === "tu" ? "J’en tiendrai compte pour ta séance." : "J’en tiendrai compte pour votre séance."));
      await ui.click(label, true);
      assert.equal(ui.spoken.length, 1);
      assert.equal(ui.spoken[0].text, reply);
      assert.equal(ui.spoken[0].lang, "fr-FR");
      assert.ok(ui.text().includes(reply));
      assert.ok(ui.text().includes("aujourd’hui ?"));
      assert.equal(document.querySelectorAll(".day-form-choices button").length, 0);
      assert.ok(!ui.text().includes("J’en tiendrai compte"));
      assert.ok(!ui.text().includes("PREMIÈRE DÉCOUVERTE"));
      assert.equal(ui.storage.getItem(DRAFT_KEY), null, "création de séance différée");
      await ui.event("onstart"); await ui.advance(5000);
      assert.ok(ui.text().includes(reply));
      await ui.event("onend"); await ui.advance(799);
      assert.ok(ui.text().includes(reply));
      await ui.advance(1);
      assert.ok(ui.text().includes("PREMIÈRE DÉCOUVERTE"));
      assert.equal(JSON.parse(ui.storage.getItem(DRAFT_KEY)).dayForm, value);
      assert.equal(ui.timers.size, 0);
    } finally { await ui.close(); }
  });
}

test("forme : premier exercice déjà découvert, parcours normal après la voix", async () => {
  const ui = await mount({ discovered: true });
  try {
    await ui.click("En forme"); await ui.event("onstart"); await ui.event("onend"); await ui.advance(800);
    assert.ok(ui.text().includes("Temps restant de l’exercice"));
    assert.ok(!ui.text().includes("PREMIÈRE DÉCOUVERTE"));
  } finally { await ui.close(); }
});

for (const failure of ["absent", "throw", "error", "no-start", "no-end"]) {
  test(`forme : secours audio ${failure}, sans blocage ni double transition`, async () => {
    const ui = await mount({ audio: failure });
    try {
      await ui.click("En forme");
      const lateEnd = ui.spoken[0]?.onend;
      if (failure === "error") await ui.event("onerror");
      if (failure === "no-end") await ui.event("onstart");
      const delay = failure === "no-end" ? 20800 : ["throw", "error"].includes(failure) ? 800 : 3800;
      await ui.advance(delay - 1);
      assert.ok(ui.text().includes(choices[1][2]));
      await ui.advance(1);
      assert.ok(ui.text().includes("PREMIÈRE DÉCOUVERTE"));
      const draft = ui.storage.getItem(DRAFT_KEY);
      await act(async () => lateEnd?.()); await ui.advance(30000);
      assert.equal(ui.storage.getItem(DRAFT_KEY), draft);
      assert.equal(ui.timers.size, 0);
    } finally { await ui.close(); }
  });
}

test("forme : quitter pendant la voix annule la lecture et les délais", async () => {
  const ui = await mount();
  await ui.click("En forme");
  const lateEnd = ui.spoken[0].onend;
  await ui.close();
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.cancellations(), 1);
  lateEnd();
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.storage.getItem(DRAFT_KEY), null);
});
