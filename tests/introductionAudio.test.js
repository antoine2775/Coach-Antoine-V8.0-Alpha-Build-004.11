import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { ONBOARDING_STEPS } from "../src/onboarding/steps.js";

const require = createRequire(import.meta.url);
const base = "/Coach-Antoine-V8.0-Alpha-Build-004.11/";
const code = buildSync({
  entryPoints: ["src/components/onboarding/EarlySteps.jsx"], bundle: true, write: false,
  platform: "node", format: "cjs", external: ["react", "../../context/UserProfileContext"],
  define: { "import.meta.env.BASE_URL": JSON.stringify(base) },
}).outputFiles[0].text;

async function mount({ play = () => Promise.resolve(), strict = false, step = 0 } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test${base}` });
  const previous = { window: globalThis.window, document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [], updates = [];
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () { calls.push({ method: "play", audio: this, src: this.getAttribute("src") }); return play(); };
  media.pause = function () { calls.push({ method: "pause", audio: this }); };
  media.load = function () { calls.push({ method: "load", audio: this }); };
  let profile = { addressMode: "tu" }, disposed = false;
  const root = createRoot(dom.window.document.getElementById("root"));
  const context = { useUserProfile: () => ({ profile,
    updateUserProfile(changes) {
      updates.push(changes); profile = { ...profile, ...changes };
      render(profile.onboardingCurrentStep); return { status: "saved" };
    }, restartOnboarding() {} }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: name => name.includes("UserProfileContext") ? context : require(name) });
  function render(index) {
    const content = React.createElement(module.exports.default, { step: ONBOARDING_STEPS[index] });
    root.render(strict ? React.createElement(React.StrictMode, null, content) : content);
  }
  await act(async () => render(step));
  return { calls, updates, document: dom.window.document,
    async render(index) { await act(async () => render(index)); },
    async click(label) {
      const button = [...dom.window.document.querySelectorAll("button")].find(b => b.textContent === label);
      assert.ok(button, label); await act(async () => button.click());
    },
    async dispose() {
      if (disposed) return; disposed = true;
      await act(async () => root.unmount()); dom.window.close();
      globalThis.window = previous.window; globalThis.document = previous.document;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

test("Introduction : lecture au montage avec le chemin Pages, sans contrôles ni redémarrage au rendu", async () => {
  const h = await mount();
  try {
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, "play");
    assert.equal(h.calls[0].src, `${base}audio/intro-coach-antoine.mp3`);
    assert.equal(h.document.querySelectorAll("audio").length, 1);
    assert.equal(h.document.querySelector("audio").controls, false);
    assert.equal(h.document.querySelector("h2").textContent, "Bonjour, moi c’est Coach Antoine.");
    assert.deepEqual([...h.document.querySelectorAll("button")].map(b => b.textContent),
      ["Oui, on se tutoie", "Je préfère qu’on se vouvoie"]);
    await h.render(0); assert.equal(h.calls.length, 1);
  } finally { await h.dispose(); }
});

for (const [label, mode] of [["Oui, on se tutoie", "tu"], ["Je préfère qu’on se vouvoie", "vous"]]) {
  test(`Introduction : choix ${mode}, arrêt immédiat et navigation inchangée`, async () => {
    const h = await mount();
    try {
      const audio = h.document.querySelector("audio");
      await h.click(label);
      assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
      assert.equal(audio.getAttribute("src"), null);
      assert.equal(h.document.querySelector("audio"), null);
      assert.equal(h.document.querySelector("h2").textContent, "Une séance adaptée");
      assert.equal(h.updates.length, 1); assert.equal(h.updates[0].addressMode, mode);
      assert.equal(h.updates[0].onboardingCurrentStep, 1);
    } finally { await h.dispose(); }
  });
}

test("Introduction : quitter le composant arrête et libère le lecteur", async () => {
  const h = await mount(); const audio = h.document.querySelector("audio");
  await h.dispose();
  assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
  assert.equal(audio.getAttribute("src"), null);
});

test("Introduction : refus de lecture automatique sans erreur ni blocage de navigation", async () => {
  const h = await mount({ play: () => Promise.reject(new Error("NotAllowedError")) });
  try {
    await h.click("Oui, on se tutoie");
    assert.equal(h.document.querySelector("h2").textContent, "Une séance adaptée");
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
  } finally { await h.dispose(); }
});

test("Introduction : erreur synchrone audio sans blocage de l’écran", async () => {
  const h = await mount({ play: () => { throw new Error("Audio unavailable"); } });
  try {
    await h.click("Je préfère qu’on se vouvoie");
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
  } finally { await h.dispose(); }
});

test("Introduction : lecture en attente interrompue au départ, sans relance à sa résolution", async () => {
  let resolvePlay;
  const h = await mount({ play: () => new Promise(resolve => { resolvePlay = resolve; }) });
  try {
    await h.render(1);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
    await act(async () => resolvePlay());
    assert.equal(h.calls.length, 3); assert.equal(h.document.querySelector("audio"), null);
  } finally { await h.dispose(); }
});

test("Introduction : retour à l’écran crée une nouvelle lecture, autres écrans silencieux", async () => {
  const h = await mount({ step: 1 });
  try {
    assert.equal(h.calls.length, 0); assert.equal(h.document.querySelector("audio"), null);
    await h.render(0); assert.equal(h.calls.length, 1);
    const firstAudio = h.calls[0].audio;
    await h.render(2); assert.equal(h.document.querySelector("audio"), null);
    await h.render(0);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load", "play"]);
    assert.notEqual(h.calls[3].audio, firstAudio);
  } finally { await h.dispose(); }
});

test("Introduction : nettoyage et réactivation corrects sous React StrictMode", async () => {
  const h = await mount({ strict: true });
  try {
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load", "play"]);
    assert.equal(h.calls[3].src, `${base}audio/intro-coach-antoine.mp3`);
    assert.equal(h.document.querySelector("audio").getAttribute("src"), `${base}audio/intro-coach-antoine.mp3`);
  } finally { await h.dispose(); }
  assert.deepEqual(h.calls.slice(-2).map(c => c.method), ["pause", "load"]);
});
