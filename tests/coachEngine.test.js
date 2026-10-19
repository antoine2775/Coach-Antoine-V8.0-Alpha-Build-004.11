import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { PHRASE_CATALOG, COACH_PHRASE_IDS, COACH_PHRASES } from "../src/coach/phrases.js";
import { getCoachPhrase, getWelcomePhrase, getFinishRitual, listPhraseEntries, listPhrases,
  DEFAULT_COACH_POLICY, DEFAULT_SELECTION_POLICY } from "../src/coach/coachEngine.js";
import { loadCoachMemory } from "../src/coach/coachMemory.js";
import { PREVIEW_CONTEXTS } from "../src/coach/previewContexts.js";

const expected = JSON.parse(readFileSync(new URL("./fixtures/coachCatalogueV1.json", import.meta.url), "utf8"));
const key = "coachAntoineBrainV1";
const ids = PHRASE_CATALOG.map(p => p.id);
const byId = id => PHRASE_CATALOG.find(p => p.id === id);
function storage(initial = null) {
  const data = new Map(initial === null ? [] : [[key, JSON.stringify(initial)]]);
  let writes = 0;
  const api = { getItem: k => data.get(k) ?? null,
    setItem(k, value) { writes++; data.set(k, value); },
    removeItem(k) { writes++; data.delete(k); } };
  globalThis.localStorage = api;
  return { api, data, writes: () => writes };
}
const select = (category, options = {}) => getCoachPhrase(category, { random: () => 0, now: 100000, ...options });
const policies = (patch) => Object.fromEntries(Object.keys(DEFAULT_COACH_POLICY).map(name => [name, patch]));
const session = { phase: "sessionEnd", sessionId: "session-1" };
function isolate(id) { return storage({ recentPhraseIds: ids.filter(other => other !== id) }); }
function selectId(id, context = {}, options = {}) {
  const category = Object.keys(COACH_PHRASE_IDS).find(c => COACH_PHRASE_IDS[c].includes(id));
  return select(category, { context, policy: policies({ recentWindow: 100 }), ...options });
}

test("V1 : 26 textes exacts validés, dans l'ordre, avec 26 identifiants stables", () => {
  assert.equal(PHRASE_CATALOG.length, 26);
  assert.equal(new Set(ids).size, 26);
  assert.deepEqual(PHRASE_CATALOG.map(p => p.tu), expected);
  assert.deepEqual(ids, ["welcome-reunion", "welcome-ready", "movement-care", "return-pleasure", "start-gently",
    "today-pace", "quality-first", "slow-movement", "gesture-first", "encouragement-good", "encouragement-continue",
    "keep-pace", "breathe-calmly", "breathe-effort", "breathe-nose", "breathe-naturally", "water-habit",
    "dumbbells-feeling", "dumbbells-character", "dumbbells-muscles", "chair-discovery", "finish-low",
    "finish-normal", "finish-high", "finish-satisfaction-long", "finish-satisfaction-short"]);
  assert.deepEqual(new Set(Object.values(COACH_PHRASE_IDS).flat()), new Set(ids));
});

test("V1 : aucune phrase supprimée ni ses variantes dans le catalogue actif", () => {
  const text = PHRASE_CATALOG.flatMap(p => [p.tu,p.vous,p.tuFemale,p.vousFemale]).filter(Boolean).join("\n");
  for (const removed of ["Contrôle bien", "Contrôlez bien", "fier de toi", "fière de vous", "La chaise est là",
    "Garde le dos", "Gardez le dos", "On bouge sans se précipiter", "bonne chose de faite", "On se dit à demain",
    "dix fois mieux", "meilleure amie", "N'attends pas", "Ouf...", "La qualité avant la quantité."]) {
    assert.ok(!text.includes(removed), removed);
  }
  assert.ok(!ids.includes("proud"));
  assert.ok(!ids.includes("finish-done"));
});

test("TU/VOUS et sexe : mêmes identifiants, accords Prêt/Prête, Antoine au masculin", () => {
  for (const category of Object.keys(COACH_PHRASE_IDS)) {
    for (const addressMode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
      const entries = listPhraseEntries(category, { addressMode, sex, firstName: "Camille" });
      assert.deepEqual(entries.map(p => p.id), COACH_PHRASE_IDS[category]);
      assert.ok(entries.every(p => p.text.length));
    }
    assert.deepEqual(COACH_PHRASES[category], COACH_PHRASE_IDS[category].map(id => byId(id).tu));
  }
  for (const addressMode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
    const welcome = listPhraseEntries("welcome", { addressMode, sex });
    assert.equal(welcome[0].text, addressMode === "vous" ? "Bonjour ! Je suis content de vous retrouver." : expected[0]);
    assert.equal(welcome[1].text, sex === "female" ? "Bonjour ! Prête pour une bonne séance ?" : expected[1]);
  }
  assert.equal(listPhrases("start", { addressMode: "vous" })[1], "On va avancer à votre rythme.");
  const vous = listPhraseEntries("encouragement", { addressMode: "vous" });
  assert.equal(vous.find(p => p.id === "breathe-nose").text, "Si vous pouvez, respirez tranquillement par le nez.");
  assert.equal(vous.find(p => p.id === "breathe-naturally").text,
    "Respirez calmement, comme d’habitude… et vous verrez, le mouvement viendra naturellement. Ça deviendra une habitude.");
});

test("prénom : normalisation d'affichage, aucun gabarit ou repli inventé si absent", () => {
  for (const addressMode of ["tu", "vous"]) {
    const profile = { addressMode, firstName: "  élise-Anne  " };
    const entries = listPhraseEntries("finishDayForm", profile);
    assert.equal(entries[1].text, "C’était une bonne séance aujourd’hui, Élise-Anne !");
    assert.equal(entries[2].text, "Une séance un peu soutenue aujourd’hui. Bravo Élise-Anne !");
    assert.equal(profile.firstName, "  élise-Anne  ");
  }
  for (const firstName of [null, undefined, "", "   ", 123]) {
    const store = storage();
    assert.equal(select("finishDayForm", { context: { ...session, dayForm: "high" }, profile: { firstName } }), "");
    assert.equal(store.writes(), 0);
  }
});

test("fréquences éditoriales et direction vocale conservées", () => {
  const explicit = { "welcome-reunion": "frequent", "welcome-ready": "occasional", "movement-care": "occasional",
    "return-pleasure": "occasional", "start-gently": "frequent", "breathe-naturally": "rare", "water-habit": "occasional",
    "dumbbells-feeling": "occasional", "dumbbells-character": "veryRare", "dumbbells-muscles": "rare",
    "chair-discovery": "occasional", "finish-low": "occasional", "finish-normal": "occasional", "finish-high": "occasional",
    "finish-satisfaction-long": "occasional" };
  for (const [id, frequency] of Object.entries(explicit)) assert.equal(byId(id).frequency, frequency);
  assert.equal(byId("water-habit").establishedFrequency, "rare");
  assert.deepEqual(byId("gesture-first").voiceDirection, { pauseAfter: "vitesse", emphasis: "bien faire" });
  assert.ok(byId("breathe-naturally").tu.includes("comme d’habitude…"));
  assert.ok(byId("breathe-naturally").tu.endsWith("Ça deviendra une habitude."));
});

test("appréciations : aucune déduction d'exécution ou de rythme depuis le temps passé", () => {
  for (const [id, flag] of [["encouragement-good", "executionQualityConfirmed"],
    ["encouragement-continue", "executionQualityConfirmed"], ["keep-pace", "expectedPaceConfirmed"]]) {
    const store = isolate(id);
    assert.equal(selectId(id, { elapsedSeconds: 60, repetitions: 10 }), "");
    assert.equal(selectId(id, { [flag]: false }), "");
    assert.equal(store.writes(), 0);
    assert.equal(selectId(id, { [flag]: true }), byId(id).tu);
  }
});

test("qualité : conseils autorisés seulement par un contexte pertinent", () => {
  for (const id of ["quality-first", "slow-movement", "gesture-first"]) {
    isolate(id);
    assert.equal(selectId(id), "");
    assert.equal(selectId(id, { qualityGuidanceRelevant: true }), byId(id).tu);
  }
});

test("respiration calme : mobilité, étirements, retour au calme et respiration ; jamais effort intense", () => {
  for (const exerciseKind of ["mobility", "stretching", "cooldown", "breathing"]) {
    isolate("breathe-calmly");
    assert.equal(selectId("breathe-calmly", { exerciseKind, effort: "sustained" }), "");
    assert.equal(selectId("breathe-calmly", { exerciseKind, effort: "intense" }), "");
    assert.equal(selectId("breathe-calmly", { exerciseKind, effort: "calm" }), expected[12]);
  }
  isolate("breathe-calmly");
  assert.equal(selectId("breathe-calmly", { exerciseKind: "strength", effort: "moderate" }), "");
});

test("respiration soutenue, nasale et apprentissage : contextes distincts", () => {
  isolate("breathe-effort");
  assert.equal(selectId("breathe-effort", { effort: "calm" }), "");
  assert.equal(selectId("breathe-effort", { effort: "sustained" }), expected[13]);
  const nasal = { effort: "moderate", controlledExercise: true, nasalBreathingAppropriate: true };
  isolate("breathe-nose");
  for (const context of [{}, { ...nasal, effort: "intense" }, { ...nasal, controlledExercise: false },
    { ...nasal, nasalBreathingAppropriate: false }]) assert.equal(selectId("breathe-nose", context), "");
  assert.equal(selectId("breathe-nose", nasal), expected[14]);
  isolate("breathe-naturally");
  assert.equal(selectId("breathe-naturally"), "");
  assert.equal(selectId("breathe-naturally", { breathingGuidanceRelevant: true, effort: "intense" }), "");
  assert.equal(selectId("breathe-naturally", { breathingGuidanceRelevant: true, effort: "moderate" }), expected[15]);
});

test("hydratation : avant séance seulement, occasionnelle puis rare si habitude établie", () => {
  storage();
  assert.equal(select("water", { context: { phase: "exercise" } }), "");
  assert.equal(select("water", { context: { phase: "beforeSession" }, random: () => 0.2 }), expected[16]);
  storage();
  assert.equal(select("water", { context: { phase: "beforeSession", hydrationHabitEstablished: true }, random: () => 0.2 }), "");
  assert.equal(select("water", { context: { phase: "beforeSession", hydrationHabitEstablished: true } }), expected[16]);
});

const dumbbells = { phase: "afterSet", equipment: "dumbbells", appropriateSet: true, sufficientlyDemanding: true, physicalDifficulty: false };
test("haltères : série appropriée, sollicitation crédible et difficulté physique bloquante", () => {
  for (const id of ["dumbbells-feeling", "dumbbells-character"]) {
    isolate(id);
    for (const context of [{}, { ...dumbbells, phase: "exercise" }, { ...dumbbells, equipment: "none" },
      { ...dumbbells, appropriateSet: false }, { ...dumbbells, physicalDifficulty: true }, { ...dumbbells, physicalDifficulty: undefined }]) {
      assert.equal(selectId(id, context), "");
    }
    if (id === "dumbbells-feeling") assert.equal(selectId(id, { ...dumbbells, sufficientlyDemanding: false }), "");
    assert.equal(selectId(id, dumbbells), byId(id).tu);
  }
});

test("muscles : début du renforcement ou premier exercice avec haltères, aucun encouragement à forcer", () => {
  isolate("dumbbells-muscles");
  for (const context of [dumbbells, { phase: "strengthStart", physicalDifficulty: true },
    { phase: "firstDumbbellExercise", equipment: "none", physicalDifficulty: false }]) assert.equal(selectId("dumbbells-muscles", context), "");
  assert.equal(selectId("dumbbells-muscles", { phase: "strengthStart", physicalDifficulty: false }), expected[19]);
  isolate("dumbbells-muscles");
  assert.equal(selectId("dumbbells-muscles", { phase: "firstDumbbellExercise", equipment: "dumbbells", physicalDifficulty: false }), expected[19]);
});

test("chaise : seulement si utilisation de la chaise", () => {
  const store = storage();
  assert.equal(select("chair"), "");
  assert.equal(select("chair", { context: { equipment: "none" } }), "");
  assert.equal(store.writes(), 0);
  assert.equal(select("chair", { context: { equipment: "chair" } }), expected[20]);
});

for (const [dayForm, index] of [["low",21], ["normal",22], ["high",23]]) {
  test(`forme du jour ${dayForm} : uniquement sa conclusion en fin de séance`, () => {
    storage();
    const profile = { firstName: "Camille" };
    assert.equal(select("finishDayForm", { context: { phase: "exercise", dayForm }, profile }), "");
    assert.equal(select("finishDayForm", { context: { ...session, dayForm }, profile }), expected[index].replace("[Prénom]", "Camille"));
    storage();
    assert.equal(select("finishDayForm", { context: { ...session, dayForm: "unknown" }, profile }), "");
  });
}

test("anti-répétition globale : contexte différent et changement de variante ne réautorisent pas la phrase", () => {
  isolate("quality-first");
  assert.equal(selectId("quality-first", { qualityGuidanceRelevant: true }), expected[6]);
  assert.equal(select("maxim", { context: { qualityGuidanceRelevant: true }, profile: { addressMode: "vous" }, policy: policies({ recentWindow: 100 }) }), "");
  isolate("welcome-ready");
  assert.equal(selectId("welcome-ready"), expected[1]);
  assert.equal(select("welcome", { profile: { sex: "female", addressMode: "vous" }, policy: policies({ recentWindow: 100 }) }), "");
});

test("anti-répétition : fenêtres de rareté réglables, mémoire bornée", () => {
  storage({ recentPhraseIds: ["chair-discovery", "start-gently", "gesture-first"] });
  assert.equal(select("chair", { context: { equipment: "chair" }, policy: { occasional: { recentWindow: 4 } } }), "");
  assert.equal(select("chair", { context: { equipment: "chair" }, policy: { occasional: { recentWindow: 2 } } }), expected[20]);
  storage();
  for (let i=0;i<20;i++) select("start", { policy: policies({ recentWindow: 1 }) });
  assert.equal(loadCoachMemory().recentPhraseIds.length, 1);
});

test("fréquences : quatre niveaux configurables, même fréquente peut rester silencieuse", () => {
  assert.deepEqual(Object.keys(DEFAULT_COACH_POLICY), ["frequent", "occasional", "rare", "veryRare"]);
  const contexts = { frequent: ["welcome-reunion", {}], occasional: ["chair-discovery", { equipment: "chair" }],
    rare: ["breathe-naturally", { breathingGuidanceRelevant: true }], veryRare: ["dumbbells-character", dumbbells] };
  for (const [frequency, [id, context]] of Object.entries(contexts)) {
    isolate(id);
    const base = policies({ recentWindow: 100 });
    assert.equal(selectId(id, context, { policy: { ...base, [frequency]: { recentWindow: 100, probability: 0 } } }), "");
    assert.equal(selectId(id, context, { policy: { ...base, [frequency]: { recentWindow: 100, probability: 0.8 } } }), byId(id).tu);
  }
  const store = storage();
  assert.equal(select("start", { random: () => 0.99, policy: policies({ probability: 1 }), force: true }), "");
  assert.equal(store.writes(), 0);
});

test("silence : contexte inconnu, mémoire épuisée, silenceUntil, délai et force réelle", () => {
  const store = storage();
  assert.equal(select("missing", { force: true }), "");
  assert.equal(select("encouragement", { force: true }), "");
  assert.equal(store.writes(), 0);
  storage({ recentPhraseIds: COACH_PHRASE_IDS.start });
  assert.equal(select("start", { policy: policies({ recentWindow: 100 }) }), "");
  storage({ silenceUntil: 100001 });
  assert.equal(select("start", { force: true }), "");
  storage({ lastSpokenAt: 99999 });
  assert.equal(select("start", { minimumGapMs: 100 }), "");
  storage();
  assert.equal(select("start", { silenceChance: 1 }), "");
});

for (const [firstCategory, secondCategory] of [["finishFirst","finishSecond"], ["finishSecond","finishFirst"]]) {
  test(`A OU B : ${firstCategory} empêche ${secondCategory}, même après éviction et relecture`, () => {
    const store = storage();
    assert.ok(select(firstCategory, { context: session }));
    const saved = JSON.parse(store.data.get(key));
    saved.recentPhraseIds = ["start-gently"];
    store.data.set(key, JSON.stringify(saved));
    assert.ok(loadCoachMemory().sessionSpeechGroups[session.sessionId].includes("finish-satisfaction"));
    assert.equal(select(secondCategory, { context: session, force: true }), "");
    assert.equal(select(firstCategory, { context: session }), "");
    assert.equal(select("finishSatisfaction", { context: session }), "");
    assert.deepEqual(getFinishRitual({ context: session, random: () => 0 }), []);
    assert.ok(select(secondCategory, { context: { ...session, sessionId: "session-2" } }));
  });
}

test("A OU B : absence d'identifiant de séance ou stockage indisponible => silence", () => {
  const store = storage();
  assert.equal(select("finishSatisfaction", { context: { phase: "sessionEnd" } }), "");
  assert.equal(store.writes(), 0);
  globalThis.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(select("finishFirst", { context: session }), "");
  assert.equal(select("finishSecond", { context: session }), "");
  assert.ok(select("start"));
});

test("A moins fréquente que B : tous les accès publics, y compris finishFirst/finishSecond", () => {
  assert.ok(DEFAULT_SELECTION_POLICY.satisfactionLongRatio < 1);
  const counts = {};
  const entries = {
    finishFirst: options => getCoachPhrase("finishFirst", options),
    finishSecond: options => getCoachPhrase("finishSecond", options),
    finishSatisfaction: options => getCoachPhrase("finishSatisfaction", options),
    getFinishRitual: options => getFinishRitual(options)[0] || "",
  };
  for (const [name, invoke] of Object.entries(entries)) {
    const count = { a: 0, b: 0, silence: 0 };
    for (let i=0;i<1000;i++) {
      storage();
      let call = 0;
      const together = name === "finishSatisfaction" || name === "getFinishRitual";
      const text = invoke({ context: session, random: () => call++ === 0
        ? (together && i % 2 ? 0.75 : 0.25)
        : together ? (Math.floor(i/2)+0.5)/500 : (i+0.5)/1000 });
      if (text === expected[24]) count.a++;
      else if (text === expected[25]) count.b++;
      else { assert.equal(text, ""); count.silence++; }
    }
    counts[name] = count;
    assert.ok(count.silence > 0);
    if (name === "finishSatisfaction" || name === "getFinishRitual") assert.ok(count.a > 0 && count.a < count.b);
  }
  assert.equal(counts.finishFirst.a, 175);
  assert.equal(counts.finishSecond.b, 350);
  assert.equal(counts.finishFirst.b, 0);
  assert.equal(counts.finishSecond.a, 0);
});

test("ratio A configurable : effectif seule, avec B, au retour au calme et en preview non forcée", () => {
  for (const mode of [{}, { preview: true }, { noWrite: true }]) {
    for (const category of ["finishFirst", "finishSatisfaction"]) {
      storage();
      let calls = 0;
      const options = { ...mode, context: session, random: () => calls++ === 0 ? 0 : 0.1 };
      assert.equal(getCoachPhrase(category, { ...options, selectionPolicy: { satisfactionLongRatio: 0.1 } }), "");
      calls = 0;
      assert.equal(getCoachPhrase(category, { ...options, selectionPolicy: { satisfactionLongRatio: 0.8 } }), expected[24]);
    }
  }
  storage();
  let calls = 0;
  assert.deepEqual(getFinishRitual({ context: { phase: "cooldown", sessionId: "session-1" },
    random: () => calls++ === 0 ? 0 : 0.2 }), []);
  assert.deepEqual(getFinishRitual({ context: session, random: () => 0 }), [expected[24]]);
  assert.deepEqual(getFinishRitual({ context: session, random: () => 0 }), []);
});

test("preview/noWrite : catalogue complet, variantes et helpers sans écriture", () => {
  const store = storage({ lastPhraseGlobal: "La qualité avant la quantité.", lastVisitAt: "2020-01-01", custom: 42 });
  const before = store.data.get(key);
  for (const mode of ["preview", "noWrite"]) {
    for (const category of Object.keys(COACH_PHRASE_IDS)) {
      assert.ok(select(category, { [mode]: true, force: true, profile: { sex: "female", addressMode: "vous", firstName: "Camille" } }));
    }
    getWelcomePhrase({ [mode]: true, force: true });
    getFinishRitual({ [mode]: true, force: true });
    assert.equal(select("encouragement", { [mode]: true }), "");
    select("finishSatisfaction", { [mode]: true, context: session });
  }
  assert.equal(store.writes(), 0);
  assert.equal(store.data.get(key), before);
});

test("migration texte historique : anciennes formulations reconnues sans redevenir sélectionnables", () => {
  const store = storage({ lastPhraseByCategory: { start: "La qualité avant la quantité.", encouragement: "Tu peux être fier de toi." },
    lastPhraseGlobal: "La qualité avant la quantité.", sessionCount: 9, lastWorkoutAt: "2026-10-01", custom: "keep" });
  assert.deepEqual(loadCoachMemory().recentPhraseIds, ["proud", "quality-first"]);
  assert.equal(store.writes(), 0);
  select("start");
  const saved = JSON.parse(store.data.get(key));
  assert.equal(saved.sessionCount, 9);
  assert.equal(saved.custom, "keep");
  assert.equal(saved.lastWorkoutAt, "2026-10-01");
  assert.deepEqual(saved.recentPhraseIds, ["proud", "quality-first", "start-gently"]);
});

test("migration 6B-2 : IDs persistants conservés, variantes anciennes et alias fusionné", () => {
  const store = storage({ recentPhraseIds: ["welcome-ready", "shared-pace", "proud"], sessionCount: 3 });
  assert.deepEqual(loadCoachMemory().recentPhraseIds, ["welcome-ready", "today-pace", "proud"]);
  assert.equal(store.writes(), 0);
  isolate("welcome-ready");
  // L'ancien texte en mémoire doit bloquer la nouvelle formulation du même ID.
  storage({ lastPhraseGlobal: "Bonjour ! Prête pour une belle séance ?" });
  assert.ok(loadCoachMemory().recentPhraseIds.includes("welcome-ready"));
  storage({ lastPhraseByCategory: { start: "Aujourd'hui, on avance à votre rythme." } });
  assert.ok(loadCoachMemory().recentPhraseIds.includes("today-pace"));
});

test("stockage invalide : repli tolérant sans erreur ni écriture en lecture", () => {
  const store = storage();
  for (const value of ["null", "[]", "{", '{"recentPhraseIds":null,"lastPhraseByCategory":null}', '{"lastPhraseGlobal":"toString"}']) {
    store.data.set(key, value);
    assert.doesNotThrow(() => loadCoachMemory());
    assert.doesNotThrow(() => select("start"));
  }
});

const require = createRequire(import.meta.url);
test("Garage réel : prénom, contextes, variantes, boutons et aperçu sans écriture", () => {
  const store = storage({ recentPhraseIds: ["welcome-ready"], sessionCount: 7 });
  const before = [...store.data];
  const code = buildSync({ stdin: { contents: 'export {default as Garage} from "./src/pages/Garage.jsx";', resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", external: ["react"],
    define: { "import.meta.env.BASE_URL": '"/"' } }).outputFiles[0].text;
  let cells = [], index = 0, tree;
  const react = { ...React, useContext: () => ({ profile: { addressMode: "tu", sex: "male", firstName: "Camille" } }),
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial;
      return [cells[i], next => { cells[i] = next; }]; }, useMemo: fn => fn(), useEffect() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: name => name === "react" ? react : require(name), localStorage: store.api });
  const expand = node => Array.isArray(node) ? node.map(expand) : !node || typeof node !== "object" ? node
    : typeof node.type === "function" ? expand(node.type(node.props))
    : { ...node, props: { ...node.props, children: expand(React.Children.toArray(node.props.children)) } };
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props.children)];
  const text = node => Array.isArray(node) ? node.map(text).join("") : !node || typeof node !== "object" ? String(node ?? "") : text(node.props.children);
  const render = () => { index = 0; tree = expand(module.exports.Garage()); };
  render();
  const change = (position, value) => { nodes(tree).filter(n => n.type === "select")[position].props.onChange({ target: { value } }); render(); };
  const click = name => { nodes(tree).find(n => n.type === "button" && text(n) === name).props.onClick(); render(); };
  change(1, "vous"); change(2, "female");
  assert.ok(text(tree).includes("Bonjour ! Prête pour une bonne séance ?"));
  assert.ok(text(tree).includes("Bonjour ! Je suis content de vous retrouver."));
  change(0, "finishDayForm");
  nodes(tree).find(n => n.type === "input").props.onChange({ target: { value: "  élise  " } }); render();
  assert.ok(text(tree).includes("C’était une bonne séance aujourd’hui, Élise !"));
  for (let i=0;i<PREVIEW_CONTEXTS.length;i++) {
    change(3, String(i));
    click("Tester la sélection avec silence possible");
    click("Afficher une phrase");
  }
  const buttons = nodes(tree).filter(n => n.type === "button" && !text(n).includes("riff") && text(n) !== "×");
  for (const button of buttons) { button.props.onClick(); render(); }
  assert.equal(store.writes(), 0);
  assert.deepEqual([...store.data], before);
  assert.ok(!text(tree).includes("Réinitialiser la mémoire"));
});
