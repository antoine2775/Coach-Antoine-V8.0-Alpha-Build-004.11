import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { selectionnerV1 } from '../scripts/voix/questionnaire.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { createEmptyProfile } from '../src/utils/userProfile.js';
import { ONBOARDING_STEPS } from '../src/onboarding/steps.js';
const require = createRequire(import.meta.url);
const base = '/Coach-Antoine-V8.0-Alpha-Build-004.11/';
const code = buildSync({
  stdin: { contents: 'export { default as EarlySteps } from "./src/components/onboarding/EarlySteps.jsx"; export { default as CompletionSteps } from "./src/components/onboarding/CompletionSteps.jsx"; export { default as AssessmentSteps } from "./src/components/onboarding/AssessmentSteps.jsx"; export { default as Audio } from "./src/components/onboarding/OnboardingAudio.jsx"; export * from "./src/audio/voixInscription.js";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-router-dom', '../../context/UserProfileContext'],
  define: { 'import.meta.env.BASE_URL': JSON.stringify(base) },
}).outputFiles[0].text;

async function mount({ mode = 'tu', step = 1, strict = false, play = () => Promise.resolve(), playerSources, level, completion = {} } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `https://example.test${base}onboarding` });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [], updates = [], active = new Set();
  // Horloge locale déterministe : aucune attente réelle de 700 ms.
  let now = 0, nextTimer = 0;
  const timers = new Map();
  dom.window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
  dom.window.clearTimeout = id => timers.delete(id);
  const advance = async ms => {
    const end = now + ms;
    await act(async () => {
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      now = end;
    });
  };
  let maxActive = 0, currentStep = step, navigate, disposed = false;
  let profile = { addressMode: mode, firstName: 'Alex', sex: 'female', age: step >= 5 ? 40 : null, safetyConfirmed: step > 5, equipment: [], equipmentSelectionMade: false, assessmentAnswers: Array(9).fill(null), onboardingCurrentStep: step };
  if (level) profile = { ...profile, proposedLevel: level, assessmentAnswers: Array(9).fill({ reprise: 'c', forme: 'b', tonique: 'a' }[level]), assessmentDate: '2026-11-05T12:00:00Z', assessmentVersion: '1' };
  profile = { ...profile, ...completion };
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () {
    calls.push({ method: 'play', audio: this, src: this.getAttribute('src'), ended: this.onended, error: this.onerror });
    active.add(this); maxActive = Math.max(maxActive, active.size);
    return play(calls.filter(c => c.method === 'play').length);
  };
  media.pause = function () { calls.push({ method: 'pause', audio: this }); active.delete(this); };
  media.load = function () { calls.push({ method: 'load', audio: this }); };
  dom.window.speechSynthesis = { speak() { assert.fail('synthèse de remplacement interdite'); } };
  const root = createRoot(dom.window.document.getElementById('root'));
  const context = { useUserProfile: () => ({ profile, restartOnboarding() { profile = null; currentStep = 0; render(); }, updateUserProfile(changes) {
    updates.push(changes); profile = { ...profile, ...changes }; currentStep = profile.onboardingCurrentStep;
    render(); return { status: 'saved' };
  } }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: n => n.includes('UserProfileContext') ? context : require(n) });
  const exports = module.exports;
  function Screen() { navigate = useNavigate(); return playerSources ? React.createElement(exports.Audio, { sources: playerSources }) : React.createElement(currentStep <= 4 ? exports.EarlySteps : currentStep <= 17 ? exports.AssessmentSteps : exports.CompletionSteps, { key: ONBOARDING_STEPS[currentStep].id, step: ONBOARDING_STEPS[currentStep] }); }
  function render() {
    const content = React.createElement(MemoryRouter, { initialEntries: ['/onboarding'] }, React.createElement(Screen));
    root.render(strict ? React.createElement(React.StrictMode, null, content) : content);
  }
  await act(async () => render());
  return { calls, updates, exports, advance, profile: () => profile, pendingTimers: () => timers.size, document: dom.window.document,
    plays: () => calls.filter(c => c.method === 'play'), maxActive: () => maxActive,
    async render(index = currentStep) { currentStep = index; await act(async () => render()); },
    async mode(value) { profile = { ...profile, addressMode: value }; await act(async () => render()); },
    async click(label) { const b = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === label); assert.ok(b, label); assert.equal(b.disabled, false); await act(async () => b.click()); },
    async check(label) { const row = [...dom.window.document.querySelectorAll('label')].find(e => e.textContent === label); assert.ok(row, label); await act(async () => row.querySelector('input').click()); },
    async submit() { await act(async () => dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); },
    async type(value, name = "firstName") {
      const input = dom.window.document.querySelector(`input[name="${name}"]`);
      // Appelle le gestionnaire React réel ; JSDOM ne simule pas le clavier iOS.
      const props = input[Object.keys(input).find(k => k.startsWith('__reactProps$'))];
      await act(async () => props.onChange({ target: { value } }));
    },
    async ended(call = calls.filter(c => c.method === 'play').at(-1)) { active.delete(call.audio); await act(async () => call.ended?.()); },
    async error(call = calls.filter(c => c.method === 'play').at(-1)) { await act(async () => call.error?.()); },
    async event(name) { await act(async () => dom.window.dispatchEvent(new dom.window.Event(name))); },
    async navigate(path) { await act(async () => navigate(path)); },
    async dispose() {
      if (disposed) return; disposed = true;
      await act(async () => root.unmount()); dom.window.close();
      globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

test('registre fermé : quarante-quatre dialogues, quatre-vingt-six fichiers présents, base URL et silence hors lots', async () => {
  const h = await mount({ step: 20 });
  try {
    const mapping = h.exports.VOIX_INSCRIPTION;
    assert.equal(Object.keys(mapping).length, 44);
    const paths = Object.values(mapping).flatMap(v => Object.values(v));
    assert.equal(new Set(paths).size, 86);
    for (const path of paths) assert.ok(existsSync(new URL(`../public/${path}`, import.meta.url)), path);
    for (const id of ['incomplete', 'introduction', 'inconnu']) assert.equal(h.exports.sequenceInscription(id, 'tu').length, 0);
    assert.equal(h.plays().length, 0);
  } finally { await h.dispose(); }
});

for (const mode of ['tu', 'vous']) {
  test(`séquence ${mode} : trois paragraphes dans l’ordre, un lecteur, aucune navigation automatique`, async () => {
    const h = await mount({ mode });
    try {
      assert.equal(h.document.querySelectorAll('audio').length, 1);
      assert.equal(h.document.querySelector('audio').controls, false);
      for (const [i, id] of ['niveau-depart', 'forme-du-jour', 'seance-adaptee'].entries()) {
        assert.equal(h.plays().length, i + 1);
        assert.equal(h.plays()[i].src, `${base}audio/voix/inscription/inscription-explication-${id}--${mode}--hf--r01.mp3`);
        await h.ended();
        if (i < 2) {
          assert.equal(h.pendingTimers(), 1);
          await h.advance(699); assert.equal(h.plays().length, i + 1);
          await h.render(); assert.equal(h.plays().length, i + 1);
          await h.advance(1); assert.equal(h.plays().length, i + 2);
        }
      }
      assert.equal(h.plays().length, 3);
      assert.equal(h.pendingTimers(), 0);
      await h.advance(1000); assert.equal(h.plays().length, 3);
      assert.equal(h.document.querySelector('audio').getAttribute('src'), null);
      assert.equal(h.updates.length, 0);
      assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });
  test(`réponse ${mode} pendant lecture : sexe puis prénom, interruption avant nouveau lecteur`, async () => {
    const h = await mount({ mode, step: 2 });
    try {
      const old = h.plays()[0];
      assert.match(old.src, new RegExp(`question-sexe--${mode}`));
      await h.click('Une femme');
      assert.match(h.plays().at(-1).src, new RegExp(`question-prenom--${mode}`));
      assert.equal(old.audio.getAttribute('src'), null);
      assert.equal(h.updates[0].sex, 'female');
      assert.equal(h.maxActive(), 1);
      await h.ended(old); assert.equal(h.plays().length, 2);
    } finally { await h.dispose(); }
  });
}

test('Continuer et Retour interrompent immédiatement ; retour recommence au premier paragraphe', async () => {
  const h = await mount();
  try {
    const old = h.plays()[0];
    await h.click('Continuer'); assert.match(h.plays().at(-1).src, /question-sexe/);
    assert.equal(old.audio.getAttribute('src'), null);
    await h.click('Retour'); assert.match(h.plays().at(-1).src, /explication-niveau-depart/);
    await h.ended(old); assert.equal(h.plays().length, 3);
    assert.equal(h.maxActive(), 1);
  } finally { await h.dispose(); }
});

test('prénom : frappe et rendu sans relance, message personnalisé silencieux, retour rejoué', async () => {
  const h = await mount({ step: 3 });
  try {
    const old = h.plays()[0];
    await h.type('Camille'); await h.render();
    assert.equal(h.plays().length, 1);
    await h.submit();
    assert.match(h.document.querySelector('h2').textContent, /Enchanté Camille/);
    assert.equal(h.document.querySelector('audio'), null);
    assert.equal(old.audio.getAttribute('src'), null);
    await h.ended(old); assert.equal(h.plays().length, 1);
    await h.click('Retour'); assert.equal(h.plays().length, 2);
    await h.submit(); await h.click('Continuer');
    assert.match(h.document.querySelector('audio').getAttribute('src'), /question-age--tu--hf--r01.mp3$/);
    assert.match(h.document.querySelector('h2').textContent, /quel âge/);
  } finally { await h.dispose(); }
});

test('prénom invalide : erreur sans navigation ni redémarrage audio', async () => {
  const h = await mount({ step: 3 });
  try { await h.type(' '); await h.submit(); assert.equal(h.plays().length, 1); assert.ok(h.document.querySelector('input')); assert.equal(h.updates.length, 0); }
  finally { await h.dispose(); }
});

test('nouveau rendu stable ; changement de mode interrompt et utilise la bonne variante', async () => {
  const h = await mount();
  try { const old = h.plays()[0]; await h.render(); assert.equal(h.plays().length, 1); await h.mode('vous'); assert.match(h.plays().at(-1).src, /--vous--/); await h.ended(old); assert.equal(h.plays().length, 2); assert.equal(h.maxActive(), 1); }
  finally { await h.dispose(); }
});

for (const event of ['popstate', 'pagehide']) {
  test(`${event} : annulation définitive sans rejouer au rendu`, async () => {
    const h = await mount();
    try { const old = h.plays()[0]; await h.event(event); await h.ended(old); await h.render(); assert.equal(h.plays().length, 1); assert.equal(old.audio.getAttribute('src'), null); }
    finally { await h.dispose(); }
  });
}

test('navigation React Router sans démontage de l’écran : arrêt, aucune relance', async () => {
  const h = await mount();
  try { const old = h.plays()[0]; await h.navigate('/autre'); await h.ended(old); await h.render(); assert.equal(h.plays().length, 1); assert.equal(old.audio.getAttribute('src'), null); }
  finally { await h.dispose(); }
});

for (const [label, play] of [['refus asynchrone', () => Promise.reject(Error('NotAllowedError'))], ['exception synchrone', () => { throw Error('Audio indisponible'); }]]) {
  test(`${label} : arrêt sans reprise automatique, boutons utilisables`, async () => {
    const h = await mount({ play });
    try { const old = h.plays()[0]; await h.render(); await h.ended(old); assert.equal(h.plays().length, 1); assert.equal(old.audio.getAttribute('src'), null); await h.click('Continuer'); assert.match(h.document.querySelector('h2').textContent, /Tu es/); }
    finally { await h.dispose(); }
  });
}

test('erreur fichier : annule la suite sans audio de remplacement', async () => {
  const h = await mount();
  try { const old = h.plays()[0]; await h.error(); await h.ended(old); await h.render(); assert.equal(h.plays().length, 1); assert.equal(old.audio.getAttribute('src'), null); }
  finally { await h.dispose(); }
});

test('promesse tardive après sortie et événements anciens : aucune relance', async () => {
  let resolvePlay;
  const h = await mount({ play: () => new Promise(resolve => { resolvePlay = resolve; }) });
  const old = h.plays()[0];
  await h.dispose();
  await act(async () => resolvePlay()); old.ended(); old.error();
  assert.equal(h.plays().length, 1); assert.equal(old.audio.getAttribute('src'), null);
});

test('rejet ancien après passage au fichier suivant : ne coupe pas la lecture courante', async () => {
  let rejeter;
  const h = await mount({ play: n => n === 1 ? new Promise((_, reject) => { rejeter = reject; }) : Promise.resolve() });
  try { await h.ended(); await h.advance(700); const current = h.plays()[1]; await act(async () => rejeter(Error('tardif'))); assert.equal(current.audio.getAttribute('src'), current.src); await h.ended(); await h.advance(700); assert.equal(h.plays().length, 3); }
  finally { await h.dispose(); }
});

test('StrictMode : nettoyage avant réactivation, jamais deux lecteurs simultanés', async () => {
  const h = await mount({ strict: true });
  try { assert.equal(h.plays().length, 2); assert.equal(h.maxActive(), 1); await h.render(); assert.equal(h.plays().length, 2); await h.ended(h.plays()[0]); assert.equal(h.plays().length, 2); await h.ended(); await h.advance(700); assert.equal(h.plays().length, 3); }
  finally { await h.dispose(); }
});


test('pause configurable à 700 ms ; R02 Tu es et R01 vous conservés sans pause finale', async () => {
  const h = await mount({ step: 2 });
  try {
    assert.equal(h.exports.PAUSE_ENTRE_PARAGRAPHES_MS, 700);
    assert.match(h.plays()[0].src, /question-sexe--tu--hf--r02.mp3$/);
    await h.ended(); assert.equal(h.pendingTimers(), 0);
    await h.advance(1000); assert.equal(h.plays().length, 1);
    await h.mode('vous'); assert.match(h.plays().at(-1).src, /question-sexe--vous--hf--r01.mp3$/);
    await h.ended(); assert.equal(h.pendingTimers(), 0);
  } finally { await h.dispose(); }
});

for (const action of ['Continuer', 'Retour', 'écran', 'route', 'popstate', 'pagehide', 'démontage']) {
  for (const paragraphe of [1, 2]) {
    test('pause ' + paragraphe + ' annulée : ' + action + ', aucun départ différé', async () => {
      const h = await mount();
      try {
        if (paragraphe === 2) { await h.ended(); await h.advance(700); }
        const old = h.plays().at(-1);
        await h.ended(); await h.advance(350);
        assert.equal(h.pendingTimers(), 1);
        if (action === 'Continuer' || action === 'Retour') await h.click(action);
        else if (action === 'écran') await h.render(4);
        else if (action === 'route') await h.navigate('/autre');
        else if (action === 'démontage') await h.dispose();
        else await h.event(action);
        assert.equal(h.pendingTimers(), 0);
        const count = h.plays().length;
        await h.advance(2000); await h.ended(old);
        assert.equal(h.plays().length, count);
        assert.equal(h.pendingTimers(), 0);
      } finally { await h.dispose(); }
    });
  }
}

test('pause en cours : rendu et ancien ended ne réinitialisent ni ne doublent le délai', async () => {
  const h = await mount();
  try {
    const old = h.plays()[0]; await h.ended(); await h.advance(300);
    await h.render(); await h.ended(old);
    assert.equal(h.pendingTimers(), 1);
    await h.advance(399); assert.equal(h.plays().length, 1);
    await h.advance(1); assert.equal(h.plays().length, 2);
    assert.equal(h.pendingTimers(), 0);
  } finally { await h.dispose(); }
});


for (const mode of ['tu', 'vous']) {
  test('lot 02 ' + mode + ' : âge, blocage mineur avec un seul message complet et correction de saisie', async () => {
    const h = await mount({ mode, step: 4 });
    try {
      const age = h.plays()[0];
      assert.equal(age.src, base + 'audio/voix/inscription/inscription-question-age--' + mode + '--hf--' + (mode === 'vous' ? 'r02' : 'r01') + '.mp3');
      await h.type('17', 'age'); await h.render();
      assert.equal(h.plays().length, 1);
      await h.submit();
      assert.equal(age.audio.getAttribute('src'), null);
      assert.equal(h.profile().age, null);
      assert.match(h.document.body.textContent, /réservé aux personnes âgées de 18 ans ou plus/);
      assert.equal(h.document.querySelectorAll('audio').length, 1);
      assert.equal(h.document.querySelector('form'), null);
      const fichierComplet = base + 'audio/voix/inscription/inscription-mineur-message-complet--' + mode + '--hf--' + (mode === 'vous' ? 'r02' : 'r01') + '.mp3';
      assert.equal(h.plays()[1].src, fichierComplet);
      assert.deepEqual(Array.from(h.exports.sequenceInscription('underage', mode)), [fichierComplet]);
      await h.render(); await h.ended(age);
      assert.equal(h.plays().length, 2);
      await h.ended();
      assert.equal(h.plays().length, 2);
      await h.ended(); await h.advance(2000); await h.render();
      assert.equal(h.plays().length, 2);
      assert.equal(h.pendingTimers(), 0);
      assert.ok(h.plays().every(p => !p.src.includes('mineur-condition-age')));
      assert.ok(h.plays().every(p => !/mineur-(remerciement|retour-majorite)--/.test(p.src)));
      await h.click('Corriger l’âge');
      assert.equal(h.document.querySelector('input[name="age"]').value, '');
      assert.equal(h.plays().length, 3);
      assert.equal(h.plays()[2].src, age.src);
      assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });

  test('lot 02 ' + mode + ' : adulte, sécurité seule, matériel et réponses pendant lecture', async () => {
    const h = await mount({ mode, step: 4 });
    try {
      await h.type('42', 'age'); await h.submit();
      assert.equal(h.profile().age, 42);
      const safety = h.plays().at(-1);
      assert.match(safety.src, new RegExp('explication-securite--' + mode + '--hf--r01.mp3$'));
      assert.equal(h.document.querySelectorAll('audio').length, 1);
      assert.ok([...h.document.querySelectorAll('button')].find(b => b.textContent === 'Continuer').disabled);
      await h.check('J’ai lu et je confirme'); await h.render();
      assert.equal(h.plays().length, 2);
      await h.click('Continuer');
      assert.equal(safety.audio.getAttribute('src'), null);
      assert.equal(h.profile().safetyConfirmed, true);
      assert.match(h.plays().at(-1).src, new RegExp('question-materiel--' + mode + '--hf--r01.mp3$'));
      await h.check('Non, pas de matériel'); await h.render();
      assert.equal(h.plays().length, 3);
      assert.deepEqual(Array.from(h.profile().equipment), []);
      await h.click('Continuer');
      assert.match(h.plays().at(-1).src, /bilan-presentation/);
      await h.ended(safety); await h.advance(2000);
      assert.equal(h.plays().length, 4);
      await h.click('Retour');
      assert.equal(h.plays().length, 5);
      assert.match(h.plays().at(-1).src, /question-materiel/);
      assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });
}

test('mineur : quitter le sous-écran coupe la séquence, même avec un événement ended tardif', async () => {
  for (const action of ['Retour', 'route', 'démontage', 'Recommencer pour une autre personne']) {
    const h = await mount({ step: 4 });
    try {
      await h.type('16', 'age'); await h.submit();
      const old = h.plays().at(-1);
      if (action === 'route') await h.navigate('/autre');
      else if (action === 'démontage') await h.dispose();
      else await h.click(action);
      const count = h.plays().length;
      assert.equal(old.audio.getAttribute('src'), null);
      await h.ended(old); await h.advance(2000);
      assert.equal(h.plays().length, count);
    } finally { await h.dispose(); }
  }
});

test('âge invalide : erreur et nouveau rendu sans reprise ni changement d’éligibilité', async () => {
  const h = await mount({ step: 4 });
  try {
    await h.type('0', 'age'); await h.submit(); await h.render();
    assert.equal(h.plays().length, 1);
    assert.equal(h.updates.length, 0);
    assert.ok(h.document.querySelector('input[name="age"]'));
  } finally { await h.dispose(); }
});

for (const step of [4, 5, 6]) {
  test('lot 02 étape ' + step + ' : StrictMode, sortie et absence de superposition', async () => {
    const h = await mount({ step, strict: true, mode: 'vous' });
    try {
      assert.equal(h.plays().length, 2);
      const old = h.plays().at(-1);
      await h.render(); assert.equal(h.plays().length, 2);
      await h.navigate('/autre'); await h.ended(old); await h.advance(2000);
      assert.equal(old.audio.getAttribute('src'), null);
      assert.equal(h.plays().length, 2);
      assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });
  test('lot 02 étape ' + step + ' : refus audio sans synthèse ni relance au rendu', async () => {
    const h = await mount({ step, play: () => Promise.reject(Error('NotAllowedError')) });
    try {
      await h.render(); await h.ended();
      assert.equal(h.plays().length, 1);
      assert.equal(h.document.querySelector('audio').getAttribute('src'), null);
      await h.click('Retour');
      assert.ok(h.updates.length > 0);
    } finally { await h.dispose(); }
  });
}

for (const mode of ['tu', 'vous']) {
  test(`lot 03 ${mode} : introduction dans l’ordre affiché, retour et navigation interrompent`, async () => {
    const h = await mount({ mode, step: 7 });
    try {
      for (const id of ['bilan-presentation', 'bilan-duree', 'bilan-consigne-reponses']) {
        assert.match(h.plays().at(-1).src, new RegExp(`${id}--${mode}--hf--r01.mp3$`));
        const count = h.plays().length; await h.render(); assert.equal(h.plays().length, count);
        await h.ended();
      }
      assert.equal(h.plays().length, 3);
      await h.click('Continuer'); assert.match(h.plays().at(-1).src, /question-escaliers/);
      await h.click('Retour'); assert.equal(h.plays().length, 5);
      const old = h.plays().at(-1); await h.navigate('/ailleurs'); await h.ended(old);
      assert.equal(h.plays().length, 5); assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });
  for (const level of ['reprise', 'forme', 'tonique']) {
    test(`lot 03 ${mode} ${level} : ordre réel, conditions et choix manuel sans chevauchement`, async () => {
      const h = await mount({ mode, step: 17, level });
      const expected = level === 'reprise'
        ? ['recommandation-niveau-reprise', 'description-niveau-reprise', 'niveau-accord', 'niveau-evolution', 'niveau-libre-decision', 'niveau-reprise-changement']
        : level === 'forme'
          ? ['recommandation-niveau-equilibre', 'description-niveau-equilibre', 'niveau-accord', 'niveau-evolution', 'niveau-libre-decision', 'niveau-equilibre-changement']
          : ['recommandation-niveau-tonique', 'description-niveau-tonique', 'niveau-accord', 'niveau-evolution', 'niveau-libre-decision', 'niveau-tonique-changement'];
      try {
        for (const id of expected) {
          const actual = h.plays().at(-1);
          assert.match(actual.src, new RegExp(`${id}--${['description-niveau-reprise', 'description-niveau-tonique'].includes(id) ? 'commun' : mode}--hf--r01.mp3$`));
          assert.ok(h.document.body.textContent.includes(selectionnerV1().slice(20, 62).find(e => actual.src.endsWith(e.nomFichier)).texte));
          await h.render(); await h.ended();
        }
        assert.equal(h.plays().length, expected.length);
        await h.click('Je préfère choisir mon niveau');
        assert.match(h.plays().at(-1).src, /question-niveau-manuel/);
        await h.ended();
        if (level === 'reprise') await h.check('Équilibré');
        await h.check('Reprise');
        assert.match(h.plays().at(-1).src, /description-niveau-reprise--commun/);
        const old = h.plays().at(-1);
        await h.check('Équilibré');
        assert.match(h.plays().at(-1).src, new RegExp(`description-niveau-equilibre--${mode}`));
        const count = h.plays().length;
        await h.ended(old); await h.render(); assert.equal(h.plays().length, count);
        await h.check('Tonique'); assert.match(h.plays().at(-1).src, /description-niveau-tonique--commun/);
        await h.click('Retour'); assert.match(h.plays().at(-1).src, new RegExp(expected[0]));
        const beforeExit = h.plays().at(-1);
        await h.click('Commencer avec ce niveau'); await h.ended(beforeExit);
        assert.match(h.plays().at(-1).src, /niveau-choisi/); assert.equal(h.maxActive(), 1);
      } finally { await h.dispose(); }
    });
  }
}

test('lot 03 : correspondance exacte des 21 fichiers de l’inventaire, aucun fichier d’un autre lot', async () => {
  const h = await mount({ step: 14 });
  try {
    const paths = Object.values(h.exports.VOIX_INSCRIPTION).slice(9, 20).flatMap(Object.values).map(p => p.split('/').at(-1));
    assert.deepEqual(paths, selectionnerV1().slice(20, 41).map(e => e.nomFichier));
  } finally { await h.dispose(); }
});

for (const step of [7, 17]) {
  test(`lot 03 étape ${step} : StrictMode et événements tardifs après démontage`, async () => {
    const h = await mount({ step, level: 'reprise', strict: true });
    const calls = h.plays();
    assert.equal(calls.length, 2); assert.equal(h.maxActive(), 1);
    await h.render(); assert.equal(h.plays().length, 2);
    await h.dispose(); for (const call of calls) await h.ended(call);
    assert.equal(h.plays().length, 2);
  });
  test(`lot 03 étape ${step} : refus de lecture sans blocage ni nouvelle tentative`, async () => {
    const h = await mount({ step, level: 'reprise', play: () => Promise.reject(Error('refus')) });
    try {
      await h.render(); await h.ended(); assert.equal(h.plays().length, 1);
      await h.click(step === 7 ? 'Continuer' : 'Commencer avec ce niveau');
      if (step === 7) assert.equal(h.document.querySelector('audio').getAttribute('src'), null);
      else assert.match(h.plays().at(-1).src, /niveau-choisi/);
    } finally { await h.dispose(); }
  });
}

test('lot 04 : 21 correspondances présentes, R02 exclusivement pour les entrées 55/56',async()=>{
  const h=await mount({step:14});
  try{
    const mapping=h.exports.VOIX_INSCRIPTION;
    const paths=Object.values(mapping).slice(20,31).flatMap(Object.values);
    const expected=selectionnerV1().slice(41,62).map(e=>'audio/voix/inscription/'+e.nomFichier.replace(e.identifiantAudio==='inscription-question-equilibre'?'--r01.mp3':'IMPOSSIBLE','--r02.mp3'));
    assert.deepEqual(paths,expected);
    assert.ok(paths.every(p=>existsSync(new URL('../public/'+p,import.meta.url))));
    assert.ok(!JSON.stringify(mapping).includes('inscription-question-equilibre--tu--hf--r01.mp3'));
    assert.ok(!JSON.stringify(mapping).includes('inscription-question-equilibre--vous--hf--r01.mp3'));
  }finally{await h.dispose();}
});

for(const mode of ['tu','vous']){
  test(`lot 04 ${mode} : Q1 à Q6, questions seules, réponse immédiate, retour et passage à Q7`,async()=>{
    const h=await mount({mode,step:8});
    const ids=['escaliers','assis-debout','equilibre','rotation-buste','frequence-activite','renforcement'];
    try{
      for(const [i,id] of ids.entries()){
        const old=h.plays().at(-1),revision=i===2?'r02':'r01';
        assert.match(old.src,new RegExp(`question-${id}--${mode}--hf--${revision}.mp3$`));
        const reference=selectionnerV1().find(e=>e.identifiantAudio==='inscription-question-'+id&&e.adresse===mode);
        assert.equal(h.document.querySelector('h2').textContent,reference.texte);
        const count=h.plays().length;await h.render();assert.equal(h.plays().length,count);
        const answer=[...h.document.querySelectorAll('button')].find(b=>b.textContent!=='Retour');
        await h.click(answer.textContent);const after=h.plays().length;
        await h.ended(old);await h.render();assert.equal(h.plays().length,after);
      }
      assert.equal(h.plays().length,7);assert.match(h.plays().at(-1).src,/question-mobilite/);
      await h.click('Retour');assert.match(h.plays().at(-1).src,/question-renforcement/);
      const old=h.plays().at(-1);await h.navigate('/sortie');await h.ended(old);
      assert.equal(h.plays().length,8);assert.equal(h.maxActive(),1);
    }finally{await h.dispose();}
  });
  test(`lot 04 ${mode} : choix manuel interrompu sans répéter la question ni lancer un ancien paragraphe`,async()=>{
    const h=await mount({mode,step:17,level:'forme'});
    try{
      await h.click('Je préfère choisir mon niveau');const question=h.plays().at(-1);
      assert.match(question.src,new RegExp(`question-niveau-manuel--${mode}`));
      await h.render();const before=h.plays().length;
      await h.check('Tonique');assert.match(h.plays().at(-1).src,/description-niveau-tonique--commun/);
      await h.ended(question);assert.equal(h.plays().length,before+1);
      await h.check('Tonique');await h.render();assert.equal(h.plays().length,before+1);
      await h.click('Retour');assert.match(h.plays().at(-1).src,/recommandation-niveau-equilibre/);
      assert.equal(h.maxActive(),1);
    }finally{await h.dispose();}
  });
}
for(const step of [8,10,13]){
  test(`lot 04 étape ${step} : StrictMode et erreur sans relance`,async()=>{
    const h=await mount({step,strict:true});
    try{
      assert.equal(h.plays().length,2);assert.equal(h.maxActive(),1);
      const old=h.plays().at(-1);await h.error();await h.ended(old);await h.render();
      assert.equal(h.plays().length,2);assert.equal(h.document.querySelector('audio').getAttribute('src'),null);
    }finally{await h.dispose();}
  });
}

for (const mode of ['tu','vous']) for (const level of ['reprise','forme','tonique']) {
  test(`choix manuel ${mode} ${level} : arrivée question seule, changement volontaire, retour initial et sortie rapide`, async()=>{
    const h=await mount({mode,step:17,level});
    const labels={reprise:'Reprise',forme:'Équilibré',tonique:'Tonique'};
    const description={reprise:'description-niveau-reprise--commun',forme:`description-niveau-equilibre--${mode}`,tonique:'description-niveau-tonique--commun'};
    try {
      await h.click('Je préfère choisir mon niveau');
      const question=h.plays().at(-1), count=h.plays().length;
      assert.match(question.src,new RegExp(`question-niveau-manuel--${mode}`));
      assert.equal(h.document.querySelector('input[name="selectedLevel"]:checked').value,level);
      const reference=selectionnerV1().find(e=>e.identifiantAudio==='inscription-'+description[level].split('--')[0]&&(e.adresse===mode||e.adresse==='commun'));
      assert.ok(h.document.body.textContent.includes(reference.texte));
      await h.ended(question);await h.advance(2000);await h.render();
      assert.equal(h.plays().length,count,'aucune description après la question à l’arrivée');
      await h.check(labels[level]);assert.equal(h.plays().length,count,'sélection présélectionnée inchangée');
      const autre=level==='forme'?'tonique':'forme';
      await h.check(labels[autre]);const previous=h.plays().at(-1);
      assert.ok(previous.src.includes(description[autre]));
      await h.check(labels[level]);assert.ok(h.plays().at(-1).src.includes(description[level]));
      const current=h.plays().at(-1);await h.ended(previous);await h.render();
      assert.equal(h.plays().length,count+2);assert.equal(h.maxActive(),1);
      await h.navigate('/sortie');await h.ended(current);await h.advance(2000);
      assert.equal(h.plays().length,count+2);assert.equal(current.audio.getAttribute('src'),null);
    }finally{await h.dispose();}
  });
}

test('lot 05 : vingt versions approuvées, empreintes et chemins exacts', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/voix/validation/validation-lot05.json', import.meta.url)));
  const h = await mount({ step: 20 });
  try {
    assert.equal(manifest.fichiers.length, 20);
    for (const f of manifest.fichiers) {
      const e = selectionnerV1()[f.numero - 1];
      const version = f.numero === 71 ? 'r03' : f.numero === 73 ? 'r02' : 'r01';
      assert.equal(f.nomFichier, e.nomFichier.replace('r01.mp3', version + '.mp3'));
      const path = h.exports.VOIX_INSCRIPTION[e.identifiantAudio.replace('inscription-', '')][e.adresse];
      assert.equal(path, 'audio/voix/inscription/' + f.nomFichier);
      assert.equal(createHash('sha256').update(readFileSync(new URL('../public/' + path, import.meta.url))).digest('hex'), f.sha256);
    }
  } finally { await h.dispose(); }
});

for (const mode of ['tu', 'vous']) {
  test(`lot 05 ${mode} : Q7 à Q9, réponses silencieuses, retour et arrêt`, async () => {
    const h = await mount({ mode, step: 14 });
    try {
      for (const id of ['mobilite', 'activite-passee', 'duree-seance']) {
        const old = h.plays().at(-1);
        assert.match(old.src, new RegExp(`question-${id}--${mode}--hf--r01.mp3$`));
        const e = selectionnerV1().find(e => e.identifiantAudio === 'inscription-question-' + id && e.adresse === mode);
        assert.equal(h.document.querySelector('h2').textContent, e.texte);
        const n = h.plays().length; await h.render(); assert.equal(h.plays().length, n);
        if (id === 'duree-seance') break;
        const b = [...h.document.querySelectorAll('button')].find(b => b.textContent !== 'Retour');
        await h.click(b.textContent); const after = h.plays().length;
        await h.ended(old); assert.equal(h.plays().length, after);
      }
      await h.click('Retour'); assert.match(h.plays().at(-1).src, /question-activite-passee/);
      const old = h.plays().at(-1); await h.navigate('/sortie'); await h.ended(old);
      assert.equal(old.audio.getAttribute('src'), null); assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });

  test(`lot 05 ${mode} : transition ordonnée, même étape, retour et navigation rapide`, async () => {
    const h = await mount({ mode, step: 18, completion: { onboardingCompletionStage: 'transition' } });
    try {
      const ids = ['niveau-choisi', 'experience-presentation', 'experience-accompagnement'];
      for (const [i, id] of ids.entries()) {
        const rev = mode === 'tu' && i === 1 ? 'r03' : mode === 'tu' && i === 2 ? 'r02' : 'r01';
        assert.match(h.plays().at(-1).src, new RegExp(`${id}--${mode}--hf--${rev}.mp3$`));
        await h.render(); assert.equal(h.plays().length, i + 1);
        if (i < 2) await h.ended();
      }
      const old = h.plays().at(-1); await h.click('Continuer');
      assert.match(h.plays().at(-1).src, /question-experience/);
      assert.equal(old.audio.getAttribute('src'), null);
      await h.ended(old); assert.equal(h.plays().length, 4);
      await h.click('Retour'); assert.match(h.plays().at(-1).src, /niveau-choisi/);
      const pending = h.plays().at(-1); await h.click('Continuer'); await h.navigate('/sortie');
      const n = h.plays().length; await h.ended(pending); assert.equal(h.plays().length, n);
      assert.equal(h.maxActive(), 1);
    } finally { await h.dispose(); }
  });

  for (const branch of ['current', 'stopped', 'never']) {
    test(`lot 05 ${mode} : branche ${branch}, réaction conditionnelle et retours`, async () => {
      const h = await mount({ mode, step: 18 });
      try {
        assert.match(h.plays()[0].src, /question-experience/);
        const labels = { current: 'Oui, et encore actuellement.', stopped: 'Oui, mais j’ai arrêté.', never: 'Non, jamais.' };
        await h.click(labels[branch]);
        if (branch === 'never') {
          assert.equal(h.document.querySelector('audio'), null);
          assert.equal(h.plays().length, 1);
          return;
        }
        const expected = branch === 'current' ? 'question-programme-actuel' : 'question-arret-programme';
        assert.match(h.plays().at(-1).src, new RegExp(`${expected}--${mode}`));
        const old = h.plays().at(-1);
        await h.click('Je ne sais pas vraiment');
        assert.match(h.plays().at(-1).src, new RegExp(`reaction-experience--${mode}`));
        assert.equal(old.audio.getAttribute('src'), null);
        const n = h.plays().length; await h.render(); await h.ended(old); assert.equal(h.plays().length, n);
        await h.click('Retour'); assert.match(h.plays().at(-1).src, new RegExp(expected));
        await h.click('Je ne sais pas vraiment');
        const reaction = h.plays().at(-1); await h.click('Continuer');
        assert.equal(h.document.querySelector('audio'), null);
        await h.ended(reaction); assert.equal(reaction.audio.getAttribute('src'), null);
        await h.click('Retour'); assert.match(h.plays().at(-1).src, /reaction-experience/);
        assert.equal(h.maxActive(), 1);
      } finally { await h.dispose(); }
    });
  }
}

test('lot 05 : StrictMode, refus et promesse tardive sans reprise après navigation', async () => {
  let reject;
  const h = await mount({ step: 18, strict: true, completion: { onboardingCompletionStage: 'transition' }, play: () => new Promise((_, r) => { reject = r; }) });
  try {
    const old = h.plays().at(-1); const lateReject = reject;
    await h.click('Continuer'); const current = h.plays().at(-1);
    await act(async () => lateReject(new Error('autoplay')));
    assert.match(current.src, /question-experience/);
    const n = h.plays().length; await h.render(); assert.equal(h.plays().length, n);
    await h.error(current); await h.ended(old); await h.render();
    assert.equal(h.plays().length, n); assert.equal(current.audio.getAttribute('src'), null);
    assert.equal(h.maxActive(), 1);
  } finally { await h.dispose(); }
});

const finalProfile = mode => ({ ...createEmptyProfile(), addressMode:mode, firstName:'Antoine',sex:'male',age:40,safetyConfirmed:true,equipmentSelectionMade:true,assessmentAnswers:Array(9).fill('b'),assessmentDate:'2026-11-06T10:00:00Z',assessmentVersion:'1',proposedLevel:'forme',selectedLevel:'forme',levelOrigin:'coach',previousProgramExperience:'never',onboardingCurrentStep:20 });

test('lot 06 : les six références React correspondent exactement au manifeste approuvé',async()=>{
 const h=await mount({step:20});try{
 const m=JSON.parse(readFileSync(new URL('../scripts/voix/validation/validation-lot06.json',import.meta.url)));
 assert.equal(m.fichiers.length,6);
 for(const f of m.fichiers){const e=selectionnerV1()[f.numero-1],path=h.exports.VOIX_INSCRIPTION[e.identifiantAudio.replace('inscription-','')][e.adresse];assert.equal(path,'audio/voix/inscription/'+f.nomFichier);assert.equal(createHash('sha256').update(readFileSync(new URL('../public/'+path,import.meta.url))).digest('hex'),f.sha256);}
 }finally{await h.dispose();}
});
for(const mode of ['tu','vous']){
 test(`lot 06 ${mode} : trois dialogues fixes dans l’ordre affiché, prénom conservé mais silencieux`,async()=>{
 const h=await mount({mode,step:20,completion:finalProfile(mode)});try{
 assert.equal(h.document.querySelector('h2').textContent,'Merci Antoine, c’est bon pour moi.');
 const ids=['seances-adaptees','profil-evolutif','premiere-seance'];
 for(const [i,id]of ids.entries()){
 const rev=i===1?(mode==='tu'?'r03':'r02'):'r01';assert.equal(h.plays().length,i+1);assert.match(h.plays().at(-1).src,new RegExp(`conclusion-${id}--${mode}--hf--${rev}.mp3$`));
 const e=selectionnerV1().find(e=>e.identifiantAudio==='inscription-conclusion-'+id&&e.adresse===mode);assert.equal(h.document.querySelectorAll('p')[i].textContent,e.texte);
 await h.render();assert.equal(h.plays().length,i+1);await h.ended();}
 assert.equal(h.plays().length,3);assert.equal(h.maxActive(),1);assert.equal(h.pendingTimers(),0);
 await h.click('Retour');assert.match(h.plays().at(-1).src,/question-experience/);await h.click('Non, jamais.');assert.match(h.plays().at(-1).src,/conclusion-seances-adaptees/);
 }finally{await h.dispose();}
 });
 for(const button of ['Oui, c’est parti !','Pas maintenant'])test(`lot 06 ${mode} : ${button}, interruption et aucun ancien paragraphe`,async()=>{
 const h=await mount({mode,step:20,completion:finalProfile(mode)});try{const old=h.plays()[0];await h.click(button);const n=h.plays().length;await h.ended(old);await h.advance(1000);assert.equal(h.plays().length,n);assert.equal(old.audio.getAttribute('src'),null);assert.equal(h.maxActive(),1);}finally{await h.dispose();}
 });
}
test('lot 06 : profil incomplet silencieux, StrictMode et erreur sans relance',async()=>{
 let h=await mount({step:20});try{assert.equal(h.plays().length,0);}finally{await h.dispose();}
 h=await mount({step:20,strict:true,completion:finalProfile('tu')});try{assert.equal(h.plays().length,2);const old=h.plays().at(-1);await h.error(old);await h.ended(old);await h.render();assert.equal(h.plays().length,2);assert.equal(h.maxActive(),1);await h.navigate('/sortie');assert.equal(old.audio.getAttribute('src'),null);}finally{await h.dispose();}
});
