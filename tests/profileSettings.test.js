import { MemoryRouter } from "react-router-dom";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as settings from "../src/utils/profileSettings.js";
import { createEmptyProfile, readProfile, updateProfile, PROFILE_KEY } from "../src/utils/userProfile.js";
import { getOnboardingState } from "../src/onboarding/onboardingState.js";

function completedProfile() {
  return { ...createEmptyProfile(), firstName: "Camille", age: 40, sex: "female", addressMode: "tu",
    proposedLevel: "forme", selectedLevel: "forme", levelOrigin: "coach", safetyConfirmed: true,
    assessmentAnswers: Array(9).fill("b"), assessmentDate: "2026-10-17T12:00:00Z", assessmentVersion: "1",
    previousProgramExperience: "stopped", previousProgramStopReason: "tooLong",
    onboardingCurrentStep: 20, onboardingCompleted: true, equipment: ["dumbbells"] };
}
function storageWith(profile) {
  const data = new Map([[PROFILE_KEY, JSON.stringify(profile)]]);
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

for (const level of ["reprise", "forme", "tonique"]) {
  test(`niveau ${level} : choix manuel, aucun recalcul et historique du changement`, () => {
    const before = completedProfile();
    const changes = settings.prepareProfileSetting(before, "selectedLevel", level);
    assert.deepEqual(changes, { selectedLevel: level, levelOrigin: "manual" });
    const storage = storageWith(before);
    const date = "2026-10-29T12:00:00Z";
    assert.equal(updateProfile(changes, storage, date).status, "saved");
    const loaded = readProfile(storage);
    assert.deepEqual(loaded.profile, { ...before, selectedLevel: level, levelOrigin: "manual",
      ...(level === before.selectedLevel ? {} : { levelHistory: [{ level: before.selectedLevel, startedAt: null }, { level, startedAt: date }] }) });
    assert.equal(getOnboardingState(loaded).status, "complete");
  });
}

test("patches limités aux champs autorisés, profil terminé requis, valeurs invalides refusées", () => {
  for (const [field, value] of [["age", 45], ["sex", "male"], ["firstName", "Autre"],
    ["assessmentAnswers", Array(9).fill("a")], ["proposedLevel", "tonique"], ["levelOrigin", "manual"],
    ["onboardingCompleted", false], ["equipment", ["none"]], ["equipment", ["chair"]],
    ["equipment", ["wall"]], ["equipment", ["support"]], ["equipment", ["dumbbells", "dumbbells"]],
    ["equipment", null], ["selectedLevel", "expert"], ["addressMode", "other"]]) {
    assert.equal(settings.prepareProfileSetting(completedProfile(), field, value), null);
  }
  for (const profile of [null, {}, { ...completedProfile(), onboardingCompleted: false }]) {
    assert.equal(settings.prepareProfileSetting(profile, "addressMode", "vous"), null);
  }
});

test("matériel : liste multiple, suppression et aucun représenté exclusivement par []", () => {
  let equipment = settings.toggleProfileEquipment([], "dumbbells", true);
  equipment = settings.toggleProfileEquipment(equipment, "longBar", true);
  equipment = settings.toggleProfileEquipment(equipment, "resistanceBands", true);
  assert.deepEqual(equipment, ["dumbbells", "longBar", "resistanceBands"]);
  equipment = settings.toggleProfileEquipment(equipment, "longBar", false);
  assert.deepEqual(equipment, ["dumbbells", "resistanceBands"]);
  for (const value of [[], equipment]) {
    const changes = settings.prepareProfileSetting(completedProfile(), "equipment", value);
    assert.deepEqual(changes, { equipment: value });
    assert.notEqual(changes.equipment, value);
    const storage = storageWith(completedProfile());
    assert.equal(updateProfile(changes, storage).status, "saved");
    assert.deepEqual(readProfile(storage).profile, { ...completedProfile(), equipment: value });
  }
});

for (const mode of ["tu", "vous"]) {
  test(`mode ${mode} : sauvegarde partielle sans autre modification`, () => {
    const storage = storageWith(completedProfile());
    const changes = settings.prepareProfileSetting(completedProfile(), "addressMode", mode);
    assert.deepEqual(changes, { addressMode: mode });
    assert.equal(updateProfile(changes, storage).status, "saved");
    assert.deepEqual(readProfile(storage).profile, { ...completedProfile(), addressMode: mode });
  });
}

const code = buildSync({ entryPoints: ["src/components/ProfileSettings.jsx"], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["react", "../context/UserProfileContext", "../utils/profileSettings"],
}).outputFiles[0].text;

function setup(initial = completedProfile()) {
  const storage = storageWith(initial);
  let profile = initial, tree, error = false, saveError = null;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => [error, (next) => { error = next; }],
  };
  const context = { useUserProfile: () => ({ profile, saveError, updateUserProfile(changes) {
    const saved = updateProfile(changes, storage);
    if (saved.status === "saved") { profile = saved.profile; saveError = null; }
    else saveError = saved.status;
    return saved;
  } }) };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: (name) => {
    if (name === "react") return react;
    if (name.includes("UserProfileContext")) return context;
    if (name.includes("profileSettings")) return settings;
    throw Error(name);
  } });
  const text = (node) => node === null || node === undefined || typeof node === "boolean" ? "" :
    typeof node !== "object" ? String(node) : node.props.children.map(text).join("");
  const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...node.props.children.flatMap(nodes)];
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    return { ...node, props: { ...node.props, children: node.props.children.flat(Infinity).map(expand) } };
  }
  const render = () => { tree = expand(module.exports.default()); };
  function input(label) {
    const node = nodes(tree).find((item) => item.type === "label" && text(item) === label);
    assert.ok(node, `choix ${label}`);
    return nodes(node).find((item) => item.type === "input");
  }
  const choose = (label, checked = true) => { input(label).props.onChange({ target: { checked } }); render(); };
  render();
  return { storage, render, input, choose, text: () => text(tree), profile: () => readProfile(storage).profile };
}

test("interface : niveau, matériel et mode actuels sélectionnés dès l’ouverture", () => {
  const ui = setup();
  assert.equal(ui.input("Équilibré").props.checked, true);
  assert.equal(ui.input("Reprise").props.checked, false);
  assert.equal(ui.input("Haltères").props.checked, true);
  assert.equal(ui.input("Aucun matériel").props.checked, false);
  assert.equal(ui.input("Tutoiement").props.checked, true);
  assert.equal(ui.input("Vouvoiement").props.checked, false);
});

test("interface : chaque niveau sauvegardé immédiatement et conservé après rechargement", () => {
  let ui = setup();
  for (const [label, value] of [["Reprise", "reprise"], ["Tonique", "tonique"], ["Équilibré", "forme"]]) {
    ui.choose(label);
    assert.equal(ui.profile().selectedLevel, value);
    assert.equal(ui.profile().levelOrigin, "manual");
    assert.equal(ui.profile().proposedLevel, "forme");
    ui = setup(ui.profile());
    assert.equal(ui.input(label).props.checked, true);
  }
});

test("interface : aucun exclusif, plusieurs matériels, retrait du dernier et rechargement", () => {
  let ui = setup();
  ui.choose("Barre longue"); ui.choose("Élastiques de résistance");
  assert.deepEqual(ui.profile().equipment, ["dumbbells", "longBar", "resistanceBands"]);
  ui = setup(ui.profile());
  assert.equal(ui.input("Barre longue").props.checked, true);
  ui.choose("Aucun matériel");
  assert.deepEqual(ui.profile().equipment, []);
  for (const label of ["Haltères", "Barre longue", "Élastiques de résistance"]) assert.equal(ui.input(label).props.checked, false);
  ui.choose("Élastiques de résistance");
  assert.equal(ui.input("Aucun matériel").props.checked, false);
  ui.choose("Élastiques de résistance", false);
  assert.equal(ui.input("Aucun matériel").props.checked, true);
  assert.deepEqual(ui.profile().equipment, []);
});

test("textes tu/vous validés et mise à jour immédiate après sauvegarde du mode", () => {
  const ui = setup();
  assert.ok(ui.text().includes("Tu peux changer de niveau quand tu le souhaites. Coach Antoine pourra aussi te proposer d'en changer au fil du temps, mais ce sera toujours toi qui décideras."));
  assert.ok(ui.text().includes("Coach Antoine tiendra compte de ton matériel pour te proposer les exercices adaptés."));
  ui.choose("Vouvoiement");
  assert.equal(ui.profile().addressMode, "vous");
  assert.equal(ui.input("Vouvoiement").props.checked, true);
  assert.ok(ui.text().includes("Vous pouvez changer de niveau quand vous le souhaitez. Coach Antoine pourra aussi vous proposer d'en changer au fil du temps, mais ce sera toujours vous qui déciderez."));
  assert.ok(ui.text().includes("Coach Antoine tiendra compte de votre matériel pour vous proposer les exercices adaptés."));
  const reloaded = setup(ui.profile());
  assert.equal(reloaded.input("Vouvoiement").props.checked, true);
  reloaded.choose("Tutoiement");
  assert.ok(reloaded.text().includes(settings.PROFILE_SETTINGS_MESSAGES.tu.level));
});

for (const label of ["Tonique", "Aucun matériel", "Vouvoiement"]) {
  test(`échec d’écriture pour ${label} : état enregistré conservé et nouvelle tentative possible`, () => {
    const ui = setup();
    const before = ui.profile();
    const write = ui.storage.setItem;
    ui.storage.setItem = () => { throw Error("quota"); };
    ui.choose(label);
    assert.deepEqual(ui.profile(), before);
    assert.equal(ui.input("Équilibré").props.checked, true);
    assert.equal(ui.input("Haltères").props.checked, true);
    assert.equal(ui.input("Tutoiement").props.checked, true);
    assert.ok(ui.text().includes(settings.PROFILE_SETTINGS_MESSAGES.tu.error));
    ui.storage.setItem = write;
    ui.choose(label);
    assert.notDeepEqual(ui.profile(), before);
    assert.ok(!ui.text().includes("n’a pas pu être enregistrée"));
  });
}

test("modifications successives : autres champs, historique et réglages intégralement préservés", () => {
  const ui = setup();
  const keys = ["coachAntoineSound", "coachAntoineRestDuration", "coachAntoineDayForm", "coachAntoineHistory", "coachAntoineWeight", "coachAntoineBrainV1"];
  keys.forEach((key) => ui.storage.data.set(key, `original:${key}`));
  ui.choose("Tonique"); ui.choose("Barre longue"); ui.choose("Vouvoiement");
  assert.deepEqual(ui.profile(), { ...completedProfile(), selectedLevel: "tonique", levelOrigin: "manual",
    equipment: ["dumbbells", "longBar"], addressMode: "vous", levelHistory: ui.profile().levelHistory });
  assert.deepEqual(ui.profile().levelHistory.map((entry) => entry.level), ["forme", "tonique"]);
  assert.equal(ui.profile().levelHistory[0].startedAt, null);
  assert.ok(Number.isFinite(Date.parse(ui.profile().levelHistory[1].startedAt)));
  keys.forEach((key) => assert.equal(ui.storage.getItem(key), `original:${key}`));
  assert.deepEqual([...ui.storage.data.keys()].sort(), [...keys, PROFILE_KEY].sort());
  assert.equal(getOnboardingState(readProfile(ui.storage)).status, "complete");
});

test("page Coach : trois blocs intégrés, contrôles sonores et voix existants conservés", () => {
  const code = buildSync({
    stdin: { contents: 'export { default as Coach } from "./src/pages/Coach.jsx"; export { UserProfileContext } from "./src/context/UserProfileContext.jsx";', resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"],
    define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": JSON.stringify("/Coach-Antoine-V8.0-Alpha-Build-004.11/") },
  }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, require: createRequire(import.meta.url) });
  const { Coach, UserProfileContext } = module.exports;
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(UserProfileContext.Provider,
    { value: { profile: completedProfile(), updateUserProfile() {} } },
    React.createElement(Coach, { soundEnabled: true, setSoundEnabled() {} }))));
  for (const text of ["Mon niveau", "Mon matériel", "Comment Coach Antoine me parle", "Riff de guitare",
    "Tester le riff", "Voix du Coach", "Prévue dans une prochaine version", "Présentation", "À propos"]) {
    assert.ok(html.includes(text));
  }
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /type="checkbox" disabled=""/);
});
