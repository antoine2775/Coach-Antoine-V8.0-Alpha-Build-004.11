import test from "node:test";
import assert from "node:assert/strict";
import { getPersonalizedTexts } from "../src/utils/personalizedTexts.js";
import { EARLY_MESSAGES } from "../src/onboarding/earlyMessages.js";
import { COMPLETION_MESSAGES } from "../src/onboarding/completionMessages.js";

test("Lot 6A : prénom normalisé uniquement à l’affichage", () => {
  const profile = { firstName: "  marie  " };
  const before = JSON.stringify(profile);
  assert.equal(getPersonalizedTexts(profile).welcome, "Bonjour Marie !");
  for (const mode of ["tu", "vous"]) {
    assert.ok(EARLY_MESSAGES[mode].greeting(profile.firstName).includes("Marie"));
    assert.ok(COMPLETION_MESSAGES[mode].conclusion(profile.firstName)[0].includes("Marie"));
  }
  assert.equal(JSON.stringify(profile), before);
});

test("Lot 6A : au revoir aux seuils locaux de 17 h et 20 h", () => {
  const texts = getPersonalizedTexts({ firstName: "marie" });
  for (const [hour, greeting] of [[0, "Bonne journée"], [16, "Bonne journée"], [17, "Bonne fin de journée"], [19, "Bonne fin de journée"], [20, "Bonne soirée"], [23, "Bonne soirée"]]) {
    assert.equal(texts.goodbye(hour), `${greeting} Marie !`);
  }
  assert.equal(getPersonalizedTexts(null).goodbye(20), "Bonne soirée !");
});

test("phrases de pause : cycle stable sans répétitions consécutives en tu et vous", () => {
  for (const addressMode of ["tu", "vous"]) {
    const texts = getPersonalizedTexts({ addressMode });
    for (let step = 0; step < 11; step++) {
      assert.equal(texts.restMessage(step), texts.restMessage(step));
      if (step) assert.notEqual(texts.restMessage(step), texts.restMessage(step - 1));
    }
    assert.ok(texts.restMessage(1).startsWith(addressMode === "vous" ? "Relâchez" : "Relâche "));
  }
});
