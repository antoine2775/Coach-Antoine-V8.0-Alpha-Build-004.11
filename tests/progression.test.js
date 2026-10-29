import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSync } from "esbuild";
import { createEmptyProfile, readProfile, saveProfile, updateProfile, PROFILE_KEY } from "../src/utils/userProfile.js";
import { getLevelHistory } from "../src/utils/levelHistory.js";
import { getRecentForms, sessionCountLabel, levelLabel, dayFormLabel, sessionDurationLabel, isCompleteSession } from "../src/utils/progression.js";
import { HISTORY_KEY, readHistory, getStatistics } from "../src/utils/workoutHistory.js";
import { createWorkoutSession } from "../src/workout/session.js";
import { DISCOVERY_KEY } from "../src/utils/exerciseDiscovery.js";

const now = new Date("2026-10-29T12:00:00Z");
const profile = () => ({ ...createEmptyProfile(), firstName: "Alex", age: 40, sex: "male", addressMode: "tu",
  selectedLevel: "reprise", levelOrigin: "manual", proposedLevel: "reprise", assessmentAnswers: Array(9).fill("c"),
  assessmentDate: "2026-10-29T10:00:00Z", assessmentVersion: "1", safetyConfirmed: true,
  previousProgramExperience: "never", onboardingCurrentStep: 20, onboardingCompleted: true });
function memory(entries = []) {
  const data = new Map(entries);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const entry = (date, extra = {}) => ({ label: "Séance Coach Antoine", date, ...extra });

test("activité : séances dédoublonnées, temps réellement effectué et semaine en cours", () => {
  const storage = memory([[HISTORY_KEY, JSON.stringify([
    entry("2026-10-25T12:00:00Z", { id: "sun", activeSeconds: 120 }),
    entry("2026-10-26T12:00:00Z", { id: "mon", activeSeconds: 60 }),
    entry("2026-10-29T11:00:00Z", { id: "today", activeSeconds: 90 }),
    entry("2026-10-29T11:00:00Z", { id: "today", activeSeconds: 90 }),
    entry("2025-01-01T12:00:00Z"),
  ])]]);
  const statistics = getStatistics(readHistory(storage), now);
  assert.deepEqual(statistics.cards.map((card) => card.value), [4, "4 min 30 s", "2 min 30 s"]);
  assert.match(statistics.note, /anciennes durées sont inconnues/);
});

test("forme : fenêtre glissante exacte de 28 jours, bornes incluses, futur exclu, aucun score", () => {
  const start = now.getTime() - 28 * 86400000;
  const forms = getRecentForms([
    entry(new Date(start).toISOString(), { dayForm: "low" }),
    entry(new Date(start - 1).toISOString(), { dayForm: "low" }),
    entry("2026-10-10T12:00:00Z", { dayForm: "normal" }),
    entry(now.toISOString(), { dayForm: "high" }),
    entry(new Date(now.getTime() + 1).toISOString(), { dayForm: "high" }),
    entry(now.toISOString()),
  ], now);
  assert.deepEqual(forms, { counts: { low: 1, normal: 1, high: 1 }, unknown: 1 });
  assert.deepEqual(getRecentForms([], now), { counts: { low: 0, normal: 0, high: 0 }, unknown: 0 });
});

test("forme : la période traverse le mois civil", () => {
  const forms = getRecentForms([entry("2026-11-10T12:00:00Z", { dayForm: "low" }), entry("2026-11-01T12:00:00Z", { dayForm: "high" })], new Date("2026-12-02T12:00:00Z"));
  assert.deepEqual(forms.counts, { low: 1, normal: 0, high: 0 });
});

test("libellés : singulier/pluriel et anciennes données absentes sans invention", () => {
  assert.deepEqual([0, 1, 2, 7].map(sessionCountLabel), ["0 séance", "1 séance", "2 séances", "7 séances"]);
  assert.equal(levelLabel("forme"), "Équilibré");
  assert.equal(levelLabel(undefined), "Niveau non renseigné");
  assert.equal(dayFormLabel(null), "Forme non renseignée");
  assert.equal(sessionDurationLabel({}), "Durée inconnue");
  assert.equal(sessionDurationLabel({ activeSeconds: 61 }), "1 min 1 s");
  assert.equal(sessionDurationLabel({ activeSeconds: -1 }), "Durée inconnue");
});

test("niveau initial puis changements réels uniquement, y compris retour, conservés après relecture", () => {
  const storage = memory();
  const dates = ["2026-11-03T12:00:00Z", "2026-12-16T12:00:00Z", "2027-02-04T12:00:00Z"];
  assert.equal(saveProfile(profile(), storage, dates[0]).status, "saved");
  assert.equal(updateProfile({ selectedLevel: "reprise" }, storage, dates[1]).status, "saved");
  assert.equal(readProfile(storage).profile.levelHistory.length, 1);
  updateProfile({ selectedLevel: "forme" }, storage, dates[1]);
  updateProfile({ selectedLevel: "forme" }, storage, dates[2]);
  updateProfile({ equipment: ["dumbbells"] }, storage, dates[2]);
  updateProfile({ selectedLevel: "reprise" }, storage, dates[2]);
  const loaded = readProfile(storage).profile;
  assert.deepEqual(getLevelHistory(loaded), [
    { level: "reprise", startedAt: dates[0] }, { level: "forme", startedAt: dates[1] }, { level: "reprise", startedAt: dates[2] },
  ]);
  assert.ok(!loaded.levelHistory.some((period) => period.level === "tonique"));
  assert.deepEqual(JSON.parse(storage.getItem(PROFILE_KEY)).levelHistory, loaded.levelHistory);
});

test("niveau d'onboarding non confirmé : aucune période avant finalisation", () => {
  const storage = memory();
  saveProfile({ ...profile(), onboardingCompleted: false }, storage, now.toISOString());
  assert.equal(readProfile(storage).profile.levelHistory, undefined);
  updateProfile({ onboardingCompleted: true }, storage, now.toISOString());
  assert.deepEqual(readProfile(storage).profile.levelHistory, [{ level: "reprise", startedAt: now.toISOString() }]);
});

test("ancien profil : pas de date inventée ni migration en lecture ; changement daté ensuite", () => {
  const storage = memory([[PROFILE_KEY, JSON.stringify(profile())]]);
  const before = storage.getItem(PROFILE_KEY);
  assert.deepEqual(getLevelHistory(readProfile(storage).profile), [{ level: "reprise", startedAt: null }]);
  assert.equal(storage.getItem(PROFILE_KEY), before);
  updateProfile({ selectedLevel: "forme" }, storage, now.toISOString());
  assert.deepEqual(readProfile(storage).profile.levelHistory, [{ level: "reprise", startedAt: null }, { level: "forme", startedAt: now.toISOString() }]);
});

test("échec de sauvegarde du niveau : profil et historique précédent intégralement conservés", () => {
  const storage = memory(); saveProfile(profile(), storage, now.toISOString());
  const before = storage.getItem(PROFILE_KEY);
  storage.setItem = () => { throw Error("quota"); };
  assert.equal(updateProfile({ selectedLevel: "tonique" }, storage).status, "unavailable");
  assert.equal(storage.getItem(PROFILE_KEY), before);
});

test("historique de niveaux mal formé refusé sans écrasement", () => {
  const storage = memory(); saveProfile(profile(), storage, now.toISOString());
  const before = storage.getItem(PROFILE_KEY);
  for (const levelHistory of [null, [{ level: "expert", startedAt: null }], [{ level: "forme", startedAt: "invalid" }]]) {
    assert.equal(updateProfile({ levelHistory }, storage).status, "invalid");
    assert.equal(storage.getItem(PROFILE_KEY), before);
  }
});

test("séance : niveau utilisé figé au début, conservé après reprise et sauvegardes sans doublon", () => {
  const storage = memory([[DISCOVERY_KEY, '["one"]']]);
  const steps = [{ id: "one", seconds: 10 }];
  let clock = 0;
  let session = createWorkoutSession({ storage, steps, now: () => clock, uuid: () => "first" });
  session.chooseDayForm("low", "forme"); session.toggle(); clock = 3000; session.interrupt();
  session = createWorkoutSession({ storage, steps, now: () => clock });
  session.resume(); clock = 6000; session.next(); session.save();
  const history = readHistory(storage).history;
  assert.equal(history.length, 1);
  assert.equal(history[0].level, "forme");
  assert.equal(history[0].dayForm, "low");
  assert.equal(history[0].activeSeconds, 6);
});

const require = createRequire(import.meta.url);
const code = buildSync({ entryPoints: ["src/pages/Progress.jsx"], bundle: true, write: false, platform: "node", format: "cjs", external: ["react"] }).outputFiles[0].text;
function render(profileValue, storage) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => name === "react" ? { ...React, useContext: () => ({ profile: profileValue }) } : require(name), localStorage: storage,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } } });
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

for (const mode of ["tu", "vous"]) {
  test(`Progression ${mode} : poids et séances individuelles supprimés, formes récentes neutres`, () => {
    const storage = memory([["coachAntoineWeight", "82"], [HISTORY_KEY, JSON.stringify([
      entry("2026-10-29T10:00:00Z", { id: "new", level: "forme", dayForm: "normal", activeSeconds: 1080 }),
      entry("2026-10-01T10:00:00Z", { id: "old" }),
    ])]]);
    const html = render({ ...profile(), addressMode: mode }, storage);
    assert.ok(!html.includes(mode === "tu" ? "Historique de tes niveaux" : "Historique de vos niveaux"));
    assert.ok(html.includes(mode === "tu" ? "Ta forme ces 4 dernières semaines" : "Votre forme ces 4 dernières semaines"));
    assert.ok(!html.includes("Petite forme : 0 séance"));
    assert.ok(html.includes("En forme : 1 séance"));
    assert.ok(!html.includes("Pleine forme : 0 séance"));
    assert.ok(!html.includes("Équilibré · En forme · 18 min"));
    assert.ok(!html.includes("Niveau non renseigné · Forme non renseignée · Durée inconnue"));
    assert.ok(!html.includes("Date de début non renseignée"));
    assert.doesNotMatch(html, /Mon poids|kilogrammes|Séance Coach Antoine|score|régression|calorie|<input/i);
    assert.equal(storage.getItem("coachAntoineWeight"), "82");
  });
}

test("Progression : seules les périodes utilisées sont affichées, retour inclus sans date de fin", () => {
  const html = render({ ...profile(), levelHistory: [
    { level: "reprise", startedAt: "2025-11-03T12:00:00Z" },
    { level: "forme", startedAt: "2025-12-16T12:00:00Z" },
    { level: "reprise", startedAt: "2026-02-04T12:00:00Z" },
  ] }, memory());
  assert.ok(html.includes("3 novembre 2025"));
  assert.ok(html.includes("16 décembre 2025"));
  assert.ok(html.includes("4 février 2026"));
  assert.doesNotMatch(html, /Tonique|régression|fin de|terminé/i);
  assert.equal((html.match(/Niveau actuel/g) || []).length, 1);
});

test("Progression : données corrompues signalées et conservées, sans crash", () => {
  const storage = memory([[HISTORY_KEY, "{broken"]]);
  const html = render(profile(), storage);
  assert.ok(html.includes("Les données ont été conservées."));
  assert.ok(html.includes("Indisponible"));
  assert.equal(storage.getItem(HISTORY_KEY), "{broken");
});

test("lignes de séance : chaque information requise doit être exploitable", () => {
  const complete = entry(now.toISOString(), { level: "reprise", dayForm: "normal", activeSeconds: 19 });
  assert.equal(isCompleteSession(complete), true);
  assert.equal(isCompleteSession({ ...complete, activeSeconds: 0 }), true);
  for (const fields of [{ date: undefined }, { date: "invalid" }, { level: undefined }, { level: "expert" },
    { dayForm: undefined }, { dayForm: "unknown" }, { activeSeconds: undefined }, { activeSeconds: "19" },
    { activeSeconds: -1 }, { activeSeconds: Infinity }]) {
    assert.equal(isCompleteSession({ ...complete, ...fields }), false, JSON.stringify(fields));
  }
});

test("anciennes séances masquées : compteurs et répartition conservés, stockage intact", () => {
  const entries = [
    entry("2026-10-29T09:00:00Z", { id: "complete", level: "reprise", dayForm: "low", activeSeconds: 60 }),
    entry("2026-10-29T10:00:00Z", { id: "no-level", dayForm: "normal", activeSeconds: 19 }),
    entry("2026-10-29T10:30:00Z", { id: "no-form", level: "tonique", activeSeconds: 20 }),
    entry("2026-10-29T11:00:00Z", { id: "no-duration", level: "forme", dayForm: "high" }),
  ];
  const raw = JSON.stringify(entries), storage = memory([[HISTORY_KEY, raw]]);
  const html = render(profile(), storage);
  assert.deepEqual(getStatistics(readHistory(storage), now).cards.map((card) => card.value), [4, "1 min 39 s", "1 min 39 s"]);
  assert.deepEqual(getRecentForms(readHistory(storage).history, now).counts, { low: 1, normal: 1, high: 1 });
  assert.ok(!html.includes("Reprise · Petite forme · 1 min"));
  assert.equal((html.match(/class="history-row progression-session"/g) || []).length, 0);
  assert.doesNotMatch(html, /Niveau non renseigné|Forme non renseignée|Durée inconnue|Date de début non renseignée/);
  for (const label of ["Petite forme : 1 séance", "En forme : 1 séance", "Pleine forme : 1 séance"]) assert.ok(html.includes(label));
  assert.equal(storage.getItem(HISTORY_KEY), raw);
  assert.equal(readHistory(storage).history.length, 4);
});

test("historique de niveau : masquer seulement les périodes sans date, sans faux Niveau actuel", () => {
  const value = { ...profile(), levelHistory: [
    { level: "reprise", startedAt: "2026-10-01T12:00:00Z" },
    { level: "forme", startedAt: "2026-10-15T12:00:00Z" },
    { level: "reprise", startedAt: null },
  ] };
  const before = JSON.stringify(value);
  const html = render(value, memory());
  const list = html.match(/<ol[^>]*class="level-history"[^>]*>([\s\S]*?)<\/ol>/)[1];
  assert.equal((list.match(/<li>/g) || []).length, 2);
  assert.ok(list.includes("1 octobre 2026"));
  assert.ok(list.includes("15 octobre 2026"));
  assert.doesNotMatch(list, /non renseign|Niveau actuel/);
  assert.equal(JSON.stringify(value), before);
});

test("séances individuelles masquées sans limiter les données enregistrées", () => {
  const entries = Array.from({ length: 25 }, (_, index) => entry("2026-10-29T11:00:00Z", { id: `incomplete-${index}`, activeSeconds: 19, dayForm: "normal" }));
  entries.push(entry("2026-10-28T11:00:00Z", { id: "older-complete", level: "forme", dayForm: "high", activeSeconds: 120 }));
  const storage = memory([[HISTORY_KEY, JSON.stringify(entries)]]);
  const html = render(profile(), storage);
  assert.ok(!html.includes("Équilibré · Pleine forme · 2 min"));
  assert.equal((html.match(/class="history-row progression-session"/g) || []).length, 0);
  assert.equal(readHistory(storage).history.length, 26);
});

for (const mode of ["tu", "vous"]) {
  test(`rubriques vides ${mode} : titres et carte entièrement masqués`, () => {
    const html = render({ ...profile(), addressMode: mode }, memory());
    assert.doesNotMatch(html, /level-history-title|recent-forms-title|Aucun niveau daté|progression-summary/);
    assert.ok(!html.includes("Historique récent"));
  });
}

test("formes visibles : masquer les zéros puis réafficher une catégorie dès sa première séance récente", () => {
  const storage = memory([[HISTORY_KEY, JSON.stringify([
    entry("2026-10-29T10:00:00Z", { id: "one", dayForm: "normal", activeSeconds: 19 }),
    entry("2026-10-28T10:00:00Z", { id: "two", dayForm: "normal", activeSeconds: 19 }),
    entry("2026-09-01T10:00:00Z", { id: "old", dayForm: "low", activeSeconds: 19 }),
  ])]]);
  let html = render(profile(), storage);
  assert.ok(html.includes("En forme : 2 séances"));
  assert.doesNotMatch(html, /Petite forme :|Pleine forme :|0 séance/);
  const entries = readHistory(storage).history;
  entries.push(entry(now.toISOString(), { id: "new", dayForm: "low", activeSeconds: 20 }));
  storage.setItem(HISTORY_KEY, JSON.stringify(entries));
  html = render(profile(), storage);
  assert.ok(html.includes("Petite forme : 1 séance"));
  assert.ok(html.includes("En forme : 2 séances"));
  assert.ok(!html.includes("Pleine forme :"));
});

test("niveaux et formes apparaissent indépendamment, selon les données exploitables", () => {
  const known = { ...profile(), levelHistory: [{ level: "reprise", startedAt: now.toISOString() }] };
  const html = render(known, memory([[HISTORY_KEY, JSON.stringify([entry("2026-09-01T10:00:00Z", { dayForm: "normal", activeSeconds: 30 })])]]));
  assert.ok(html.includes("Historique de tes niveaux"));
  assert.ok(!html.includes("recent-forms-title"));
});

test("durées conservées sans afficher les séances individuelles", () => {
  for (const [seconds, label] of [[0, "0 s"], [0.5, "0 s"], [1, "1 s"], [19, "19 s"], [59.9, "59 s"], [60, "1 min"], [61, "1 min 1 s"], [120, "2 min"]]) {
    const storage = memory([[HISTORY_KEY, JSON.stringify([entry(now.toISOString(), { level: "tonique", dayForm: "normal", activeSeconds: seconds })])]]);
    assert.equal(sessionDurationLabel({ activeSeconds: seconds }), label);
    assert.ok(!render(profile(), storage).includes(`Tonique · En forme · ${label}`));
    assert.equal(readHistory(storage).history[0].activeSeconds, seconds);
  }
});

function interactiveHistory(value, storage) {
  let expanded = false, tree;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => name === "react" ? {
    ...React, useContext: () => ({ profile: value }), useState: () => [expanded, (next) => { expanded = next; }],
  } : require(name), localStorage: storage });
  const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
  const refresh = () => { tree = module.exports.default(); };
  refresh();
  return {
    html: () => renderToStaticMarkup(tree),
    toggle() {
      const button = nodes(tree).find((node) => node.type === "button" && node.props["aria-controls"] === "level-history-list");
      assert.ok(button);
      button.props.onClick(); refresh();
    },
  };
}

for (const mode of ["tu", "vous"]) {
  test(`niveaux ${mode} : trois plus récents puis tout afficher et réduire, sans toucher au stockage`, () => {
    const value = { ...profile(), addressMode: mode, selectedLevel: "tonique", levelHistory: [
      { level: "forme", startedAt: null },
      { level: "reprise", startedAt: "2025-01-01T12:00:00Z" },
      { level: "forme", startedAt: "2025-02-02T12:00:00Z" },
      { level: "tonique", startedAt: "2025-03-03T12:00:00Z" },
      { level: "reprise", startedAt: "2025-04-04T12:00:00Z" },
      { level: "tonique", startedAt: "2025-05-05T12:00:00Z" },
    ] };
    const raw = JSON.stringify(value), storage = memory([[PROFILE_KEY, raw]]);
    const ui = interactiveHistory(value, storage);
    let html = ui.html();
    assert.ok(html.includes(mode === "tu" ? "Historique de tes niveaux" : "Historique de vos niveaux"));
    assert.ok(!html.includes(mode === "tu" ? "Historique de vos niveaux" : "Historique de tes niveaux"));
    assert.equal((html.match(/<li>/g) || []).length, 3);
    assert.ok(html.indexOf("5 mai 2025") < html.indexOf("4 avril 2025"));
    assert.ok(html.indexOf("4 avril 2025") < html.indexOf("3 mars 2025"));
    assert.ok(!html.includes("2 février 2025"));
    assert.ok(html.includes("Voir tout l’historique"));
    assert.ok(html.includes('aria-expanded="false"'));
    ui.toggle(); html = ui.html();
    assert.equal((html.match(/<li>/g) || []).length, 5);
    assert.ok(html.includes("1 janvier 2025"));
    assert.ok(html.indexOf("5 mai 2025") < html.indexOf("1 janvier 2025"));
    assert.ok(html.includes("Réduire l’historique"));
    assert.ok(html.includes('aria-expanded="true"'));
    assert.doesNotMatch(html, /non renseign|régression|0 séance/i);
    ui.toggle(); html = ui.html();
    assert.equal((html.match(/<li>/g) || []).length, 3);
    assert.ok(html.includes("Voir tout l’historique"));
    assert.equal(storage.getItem(PROFILE_KEY), raw);
    assert.equal(JSON.stringify(value), raw);
  });

  test(`niveau stable ${mode} : une seule entrée depuis la date connue, sans commande inutile`, () => {
    const html = render({ ...profile(), addressMode: mode, selectedLevel: "forme", levelHistory: [
      { level: "forme", startedAt: "2024-12-16T12:00:00Z" },
    ] }, memory());
    assert.ok(html.includes("Équilibré — depuis le"));
    assert.ok(html.includes("16 décembre 2024"));
    assert.equal((html.match(/<li>/g) || []).length, 1);
    assert.doesNotMatch(html, /Voir tout|Réduire|régression|absence de progression/i);
  });
}

test("aucune limite persistante au nombre de périodes, aucune duplication pour un niveau stable", () => {
  const storage = memory();
  saveProfile(profile(), storage, "2020-01-01T12:00:00Z");
  for (let index = 1; index <= 40; index++) {
    const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString();
    updateProfile({ selectedLevel: index % 2 ? "forme" : "reprise" }, storage, date);
  }
  const before = readProfile(storage).profile.levelHistory;
  assert.equal(before.length, 41);
  updateProfile({ selectedLevel: "reprise" }, storage, "2026-10-29T12:00:00Z");
  assert.deepEqual(readProfile(storage).profile.levelHistory, before);
  const ui = interactiveHistory(readProfile(storage).profile, storage);
  assert.equal((ui.html().match(/<li>/g) || []).length, 3);
  ui.toggle();
  assert.equal((ui.html().match(/<li>/g) || []).length, 41);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).levelHistory.length, 41);
});

test("trois périodes datées : aucune commande d’extension", () => {
  const html = render({ ...profile(), levelHistory: [
    { level: "reprise", startedAt: "2025-01-01T12:00:00Z" },
    { level: "forme", startedAt: "2025-02-01T12:00:00Z" },
    { level: "reprise", startedAt: "2025-03-01T12:00:00Z" },
  ] }, memory());
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.doesNotMatch(html, /Voir tout|Réduire/);
});
