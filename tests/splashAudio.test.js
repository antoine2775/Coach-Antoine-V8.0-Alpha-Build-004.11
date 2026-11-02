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
  entryPoints: ["src/components/SplashScreen.jsx"], bundle: true, write: false,
  platform: "node", format: "cjs", external: ["react"],
  define: { "import.meta.env.BASE_URL": JSON.stringify(base) },
}).outputFiles[0].text;

async function mount({ play = () => Promise.resolve(), strict = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test${base}` });
  const previous = { window: globalThis.window, document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [], timers = new Map();
  let timerId = 0, disposed = false, done = 0;
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () { calls.push({ method: "play", audio: this, src: this.getAttribute("src") }); return play(); };
  media.pause = function () { calls.push({ method: "pause", audio: this }); };
  media.load = function () { calls.push({ method: "load", audio: this }); };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const root = createRoot(dom.window.document.getElementById("root"));
  const onDone = () => { done++; calls.push({ method: "done" }); };
  async function render() {
    await act(async () => {
      const content = React.createElement(module.exports.default, { onDone });
      root.render(strict ? React.createElement(React.StrictMode, null, content) : content);
    });
  }
  await render();
  return { calls, timers, document: dom.window.document, render, done: () => done,
    async advance(ms) {
      await act(async () => {
        for (const [id, timer] of [...timers]) {
          timer.ms -= ms;
          if (timer.ms <= 0) { timers.delete(id); timer.fn(); }
        }
      });
    },
    async revealButton() {
      await act(async () => {
        for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); }
      });
    },
    async click() {
      const button = dom.window.document.querySelector("button");
      assert.ok(button); assert.equal(button.disabled, false);
      await act(async () => button.click());
    },
    async event(type) {
      await act(async () => dom.window.document.querySelector("audio").dispatchEvent(new dom.window.Event(type)));
    },
    async doubleClick() {
      const button = dom.window.document.querySelector("button");
      await act(async () => { button.click(); button.click(); });
    },
    async dispose() {
      if (disposed) return; disposed = true;
      await act(async () => root.unmount()); dom.window.close();
      globalThis.window = previous.window; globalThis.document = previous.document;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

test("accueil : aucun MP3 au montage, textes et séquence d’affichage inchangés", async () => {
  const h = await mount();
  try {
    assert.deepEqual(h.calls, []);
    assert.equal(h.document.querySelector("audio").getAttribute("src"), null);
    assert.equal(h.document.querySelector("audio").controls, false);
    assert.equal(h.document.querySelector("h1").textContent, "Coach Antoine");
    assert.deepEqual([...h.timers.values()].map(t => t.ms), [900, 1250, 1950]);
    await h.revealButton();
    assert.equal(h.document.querySelector("strong").textContent, "Bienvenue !");
    assert.equal(h.document.querySelector("button").textContent.trim(), "C'est parti !");
    assert.equal(h.document.querySelector("button").className, "splash__button");
    await h.render(); assert.equal(h.calls.length, 0);
  } finally { await h.dispose(); }
});

test("accueil : premier clic lance uniquement le MP3 et remplace le bouton", async () => {
  const h = await mount();
  try {
    await h.revealButton(); await h.click();
    assert.deepEqual(h.calls.map(c => c.method), ["play"]);
    assert.equal(h.calls[0].src, `${base}audio/intro.mp3`);
    assert.equal(h.done(), 0);
    assert.deepEqual([...h.document.querySelectorAll("button")].map(b => b.textContent.trim()), ["Passer la musique"]);
    assert.equal(h.document.querySelector("button").className, "splash__button");
    await h.render(); assert.equal(h.calls.length, 1);
  } finally { await h.dispose(); }
});

for (const ending of ["naturelle", "passer"]) test(`accueil : phrase discrète pendant la musique et le silence après ${ending}`, async () => {
  const h = await mount();
  const message = "La musique complète est disponible dans « Le Coach ».";
  try {
    await h.revealButton();
    assert.equal(h.document.body.textContent.includes(message), false);
    await h.click();
    const button = h.document.querySelector("button");
    const notice = button.previousElementSibling;
    assert.equal(notice.tagName, "P");
    assert.equal(notice.textContent.trim(), message);
    assert.equal(notice.querySelector("a, button, [role='link'], [role='button']"), null);
    assert.equal(notice.hasAttribute("tabindex"), false);
    assert.equal(notice.style.color, "rgba(255, 255, 255, 0.6)");
    assert.equal(notice.style.fontSize, "0.8rem");
    assert.equal(notice.style.fontWeight, "400");
    if (ending === "naturelle") await h.event("ended"); else await h.click();
    assert.equal(h.document.body.contains(notice), true);
    await h.advance(1499);
    assert.equal(h.done(), 0);
    assert.equal(h.document.body.contains(notice), true);
    await h.advance(1); assert.equal(h.done(), 1);
    await h.dispose();
    assert.equal(h.document.body.textContent.includes(message), false);
  } finally { await h.dispose(); }
});

test("accueil : fin naturelle, exactement 1,5 seconde de silence puis navigation unique", async () => {
  const h = await mount();
  try {
    await h.revealButton(); await h.click();
    await h.event("ended"); await h.event("ended");
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
    assert.equal(h.document.querySelector("audio").getAttribute("src"), null);
    assert.equal(h.done(), 0);
    assert.deepEqual([...h.timers.values()].map(t => t.ms), [1500]);
    await h.advance(1499); assert.equal(h.done(), 0);
    await h.advance(1);
    assert.equal(h.done(), 1);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load", "done"]);
    await h.event("ended"); await h.click(); await h.advance(1500);
    assert.equal(h.done(), 1);
  } finally { await h.dispose(); }
});

test("accueil : Passer arrête avant navigation, même pendant une lecture en attente", async () => {
  let resolvePlay;
  const h = await mount({ play: () => new Promise(resolve => { resolvePlay = resolve; }) });
  try {
    await h.revealButton(); await h.click();
    assert.equal(h.done(), 0);
    await h.click();
    assert.equal(h.done(), 0);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
    assert.deepEqual([...h.timers.values()].map(t => t.ms), [1500]);
    await h.doubleClick(); await h.event("ended");
    await h.advance(1499); assert.equal(h.done(), 0);
    await h.advance(1);
    assert.equal(h.done(), 1);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load", "done"]);
    await act(async () => resolvePlay());
    await h.event("ended"); await h.click();
    assert.equal(h.calls.length, 4);
  } finally { await h.dispose(); }
});

test("accueil : Passer pendant le silence ne relance ni ne raccourcit le délai", async () => {
  const h = await mount();
  try {
    await h.revealButton(); await h.click(); await h.event("ended");
    await h.advance(500); assert.equal(h.done(), 0);
    await h.doubleClick(); assert.equal(h.done(), 0); assert.equal(h.timers.size, 1);
    await h.advance(999); assert.equal(h.done(), 0);
    await h.advance(1); assert.equal(h.done(), 1); assert.equal(h.timers.size, 0);
    await h.advance(1500); assert.equal(h.done(), 1);
  } finally { await h.dispose(); }
});

test("accueil : démontage pendant le silence annule la navigation différée", async () => {
  const h = await mount();
  await h.revealButton(); await h.click(); await h.event("ended");
  const pending = [...h.timers.values()][0].fn;
  await h.dispose();
  assert.equal(h.timers.size, 0); assert.equal(h.done(), 0);
  pending(); assert.equal(h.done(), 0);
});

for (const synchronous of [false, true]) test(`accueil : refus audio ${synchronous ? "synchrone" : "asynchrone"} sans blocage`, async () => {
  const h = await mount({ play: () => {
    if (synchronous) throw new Error("Audio unavailable");
    return Promise.reject(new Error("NotAllowedError"));
  } });
  try { await h.revealButton(); await h.click(); assert.equal(h.done(), 1); }
  finally { await h.dispose(); }
});

test("accueil : quitter l’écran sans cliquer arrête la musique et nettoie les timers", async () => {
  const h = await mount(); const audio = h.document.querySelector("audio");
  await h.dispose();
  assert.deepEqual(h.calls, []);
  assert.equal(audio.getAttribute("src"), null); assert.equal(h.timers.size, 0);
  assert.equal(h.done(), 0);
});

test("accueil : StrictMode reste silencieux au montage et ne double pas la lecture", async () => {
  const h = await mount({ strict: true });
  try {
    assert.deepEqual(h.calls, []);
    await h.revealButton(); await h.doubleClick();
    assert.deepEqual(h.calls.map(c => c.method), ["play"]);
    assert.equal(h.done(), 0);
    await h.doubleClick(); await h.event("ended"); assert.equal(h.done(), 0);
    await h.advance(1500); assert.equal(h.done(), 1);
  } finally { await h.dispose(); }
});

test("accueil : démontage pendant la lecture, nettoyage immédiat sans navigation", async () => {
  const h = await mount();
  await h.revealButton(); await h.click();
  const audio = h.document.querySelector("audio");
  await h.dispose();
  assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
  assert.equal(audio.getAttribute("src"), null); assert.equal(h.done(), 0);
});

test("accueil : rejet tardif après démontage ne navigue pas", async () => {
  let rejectPlay;
  const h = await mount({ play: () => new Promise((resolve, reject) => { rejectPlay = reject; }) });
  await h.revealButton(); await h.click(); await h.dispose();
  rejectPlay(new Error("AbortError")); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.done(), 0);
  assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
});

test("accueil : erreur de chargement après clic poursuit une seule fois", async () => {
  const h = await mount();
  try {
    await h.event("ended"); await h.event("error"); assert.equal(h.done(), 0);
    await h.revealButton(); await h.click();
    await h.event("error"); await h.event("ended"); await h.click();
    assert.equal(h.done(), 1);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load", "done"]);
  } finally { await h.dispose(); }
});

test("accueil : Passer puis rejet de play conserve les 1,5 seconde de silence", async () => {
  let rejectPlay;
  const h = await mount({ play: () => new Promise((resolve, reject) => { rejectPlay = reject; }) });
  try {
    await h.revealButton(); await h.click(); await h.click();
    await act(async () => rejectPlay(new Error("AbortError")));
    await h.event("error"); await h.doubleClick();
    assert.equal(h.done(), 0);
    assert.deepEqual(h.calls.map(c => c.method), ["play", "pause", "load"]);
    await h.advance(1499); assert.equal(h.done(), 0);
    await h.advance(1); assert.equal(h.done(), 1);
  } finally { await h.dispose(); }
});

test("accueil : démontage après Passer annule le délai sans navigation", async () => {
  const h = await mount();
  await h.revealButton(); await h.click(); await h.click();
  const pending = [...h.timers.values()][0].fn;
  await h.dispose();
  assert.equal(h.timers.size, 0); assert.equal(h.done(), 0);
  pending(); assert.equal(h.done(), 0);
});
