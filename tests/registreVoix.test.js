import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { REGISTRE_VOIX, listerVoixSansAudioOfficiel, listerVoixProvisoires } from "../src/audio/registreVoix.js";
import { getPersonalizedTexts } from "../src/utils/personalizedTexts.js";
import { EARLY_MESSAGES } from "../src/onboarding/earlyMessages.js";

const fichier = path => new URL(`../${path}`, import.meta.url);
const reponses = REGISTRE_VOIX.filter(entree => !entree.exceptionHistorique);

test("registre vocal : quatre dialogues certains, identifiants uniques et champs explicites", () => {
  assert.equal(REGISTRE_VOIX.length, 4);
  assert.equal(new Set(REGISTRE_VOIX.map(entree => entree.identifiantAudio)).size, 4);
  for (const entree of REGISTRE_VOIX) {
    assert.match(entree.identifiantAudio, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(["tu", "vous", "commun"].includes(entree.adresse));
    assert.ok(["h", "f", "hf"].includes(entree.genre));
    assert.ok(entree.momentUtilisation.length);
    assert.ok(entree.referencesTechniques.length);
    for (const reference of entree.referencesTechniques) {
      assert.ok(existsSync(fichier(reference.fichier)), reference.fichier);
      assert.ok(reference.cle.length);
    }
    assert.ok(entree.revision === null || /^r\d{2,}$/.test(entree.revision));
    assert.ok([null, "navigateur"].includes(entree.voixProvisoire));
    assert.ok(["a-verifier", "sans-audio-officiel", "verifiee"].includes(entree.verificationCorrespondance));
    assert.equal(typeof entree.exceptionHistorique, "boolean");
  }
});

test("registre vocal : introduction historique présente, sans inventer sa révision ni sa vérification", () => {
  const introduction = REGISTRE_VOIX.find(entree => entree.identifiantAudio === "inscription-presentation-coach");
  assert.ok(introduction);
  assert.equal(introduction.cheminMp3Officiel, "audio/intro-coach-antoine.mp3");
  assert.ok(statSync(fichier(`public/${introduction.cheminMp3Officiel}`)).size > 0);
  assert.equal(introduction.exceptionHistorique, true);
  assert.equal(introduction.revision, null);
  assert.equal(introduction.voixProvisoire, null);
  assert.equal(introduction.verificationCorrespondance, "a-verifier");
  assert.equal(introduction.adresse, "commun");
  assert.equal(introduction.genre, "hf");
  const composant = readFileSync(fichier("src/components/onboarding/EarlySteps.jsx"), "utf8");
  assert.ok(composant.includes(introduction.cheminMp3Officiel));
  assert.ok(composant.includes("EARLY_MESSAGES.tu.introduction"));
  assert.deepEqual(EARLY_MESSAGES.tu.introduction, EARLY_MESSAGES.vous.introduction);
  assert.ok(introduction.precisionHistorique);
});

test("registre vocal : trois réponses rattachées aux clés actuelles, communes aux quatre profils", () => {
  assert.deepEqual(reponses.map(entree => entree.identifiantAudio), [
    "forme-du-jour-reponse-petite-forme", "forme-du-jour-reponse-en-forme", "forme-du-jour-reponse-pleine-forme",
  ]);
  const cles = reponses.map(entree => {
    const reference = entree.referencesTechniques[0];
    assert.equal(reference.fichier, "src/utils/personalizedTexts.js");
    const correspondance = /^getPersonalizedTexts\(\)\.dayFormReply\.(low|normal|high)$/.exec(reference.cle);
    assert.ok(correspondance);
    return correspondance[1];
  });
  assert.deepEqual(cles, ["low", "normal", "high"]);
  for (const cle of cles) {
    const texte = getPersonalizedTexts().dayFormReply[cle];
    assert.ok(texte.length);
    for (const addressMode of ["tu", "vous"]) for (const sex of ["male", "female"]) {
      assert.equal(getPersonalizedTexts({ addressMode, sex }).dayFormReply[cle], texte);
    }
  }
});

test("registre vocal : MP3 prévus nommés selon la convention, explicitement absents", () => {
  for (const entree of reponses) {
    assert.equal(entree.cheminMp3Officiel, null);
    assert.equal(entree.revision, null);
    assert.equal(entree.voixProvisoire, "navigateur");
    assert.equal(entree.verificationCorrespondance, "sans-audio-officiel");
    assert.equal(entree.adresse, "commun");
    assert.equal(entree.genre, "hf");
    assert.equal(entree.cheminMp3Prevu,
      `audio/voix/seance/forme-du-jour/${entree.identifiantAudio}--commun--hf--r01.mp3`);
    assert.equal(existsSync(fichier(`public/${entree.cheminMp3Prevu}`)), false);
  }
  const chemins = REGISTRE_VOIX.map(entree => entree.cheminMp3Officiel || entree.cheminMp3Prevu);
  assert.equal(new Set(chemins).size, 4);
  assert.ok(chemins.every(chemin => !chemin.includes("ancienne")));
});

test("registre vocal : inventaires automatiques des audios manquants et voix provisoires", () => {
  assert.deepEqual(listerVoixSansAudioOfficiel(), reponses);
  assert.deepEqual(listerVoixProvisoires(), reponses);
  const resultat = listerVoixSansAudioOfficiel();
  resultat.pop();
  assert.equal(listerVoixSansAudioOfficiel().length, 3);
  assert.equal(REGISTRE_VOIX.length, 4);
});

test("registre vocal : arborescence française disponible, sans créer de MP3", () => {
  for (const dossier of ["inscription", "accueil", "general", "seance/forme-du-jour",
    "seance/transitions", "seance/retours", "exercices", "seances"]) {
    assert.ok(statSync(fichier(`public/audio/voix/${dossier}`)).isDirectory(), dossier);
    assert.ok(existsSync(fichier(`public/audio/voix/${dossier}/.gitkeep`)), dossier);
  }
});
