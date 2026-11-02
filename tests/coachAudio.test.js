import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const base = "/Coach-Antoine-V8.0-Alpha-Build-004.11/";
const code = buildSync({
  entryPoints: ["src/pages/Coach.jsx"], bundle: true, write: false,
  platform: "node", format: "cjs",
  external: ["react", "react-router-dom", "../components/ProfileSettings"],
  define: { "import.meta.env.BASE_URL": JSON.stringify(base), "import.meta.env.DEV": "false" },
}).outputFiles[0].text;

async function mount({ strict = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test${base}coach` });
  const previous = { window: globalThis.window, document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [], navigation = [], settings = [];
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () { calls.push("play"); return Promise.resolve(); };
  media.pause = function () { calls.push("pause"); };
  media.load = function () { calls.push("load"); };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, window: dom.window, require: name => {
    if (name === "react-router-dom") return { useNavigate: () => (...args) => navigation.push(args) };
    if (name.includes("ProfileSettings")) return () => React.createElement("div", null, "Réglages du profil");
    return require(name);
  } });
  const root = createRoot(dom.window.document.getElementById("root"));
  let disposed = false;
  async function render() {
    await act(async () => {
      const content = React.createElement(module.exports.default, { soundEnabled: true,
        setSoundEnabled: value => settings.push(value) });
      root.render(strict ? React.createElement(React.StrictMode, null, content) : content);
    });
  }
  await render();
  return { document: dom.window.document, calls, navigation, settings, render,
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

test("Coach : carte musicale immédiatement après Présentation, lecteur natif sans autoplay", async () => {
  const h = await mount();
  try {
    const cards = [...h.document.querySelectorAll("section.card")];
    assert.deepEqual(cards.map(c => c.querySelector("h2").textContent),
      ["Présentation", "La musique de Coach Antoine", "Réglages", "À propos"]);
    const audio = cards[1].querySelector("audio");
    assert.ok(audio); assert.equal(h.document.querySelectorAll("audio").length, 1);
    assert.equal(audio.getAttribute("src"), `${base}audio/rim-shuffle.mp3`);
    assert.equal(audio.controls, true); assert.equal(audio.preload, "metadata");
    assert.equal(audio.autoplay, false); assert.equal(audio.hasAttribute("autoplay"), false);
    assert.equal(audio.style.width, "100%"); assert.equal(audio.style.maxWidth, "100%");
    assert.equal(audio.getAttribute("aria-label"), "La musique de Coach Antoine");
    assert.deepEqual(h.calls, []);
    await h.render(); assert.deepEqual(h.calls, []);
  } finally { await h.dispose(); }
});

test("Coach : quitter la page interrompt et libère le lecteur", async () => {
  const h = await mount(); const audio = h.document.querySelector("audio");
  await audio.play(); await h.dispose();
  assert.deepEqual(h.calls, ["play", "pause", "load"]);
  assert.equal(audio.getAttribute("src"), null);
});

test("Coach : retour sur la page prépare un lecteur neuf et silencieux", async () => {
  const first = await mount(); await first.dispose();
  const second = await mount();
  try {
    assert.deepEqual(second.calls, []);
    assert.equal(second.document.querySelector("audio").getAttribute("src"), `${base}audio/rim-shuffle.mp3`);
  } finally { await second.dispose(); }
});

test("Coach : StrictMode conserve la source après nettoyage sans lancer de lecture", async () => {
  const h = await mount({ strict: true });
  try {
    assert.deepEqual(h.calls, ["pause", "load"]);
    assert.equal(h.document.querySelector("audio").getAttribute("src"), `${base}audio/rim-shuffle.mp3`);
  } finally { await h.dispose(); }
});

test("Coach : Retour et réglage Sons de la séance conservés, test du riff supprimé", async () => {
  const h = await mount();
  try {
    assert.equal(h.document.body.textContent.includes("Tester le riff"), false);
    assert.ok(h.document.body.textContent.includes("Sons de la séance"));
    assert.ok(h.document.body.textContent.includes("Décomptes et signaux sonores"));
    await h.click("← Retour");
    assert.equal(h.navigation.length, 1); assert.equal(h.navigation[0][0], "/");
    assert.equal(h.navigation[0][1].replace, true);
    const checkbox = h.document.querySelector('input[type="checkbox"]');
    assert.equal(checkbox.checked, true);
    await act(async () => checkbox.click()); assert.deepEqual(h.settings, [false]);
    assert.deepEqual(h.calls, []);
  } finally { await h.dispose(); }
});
