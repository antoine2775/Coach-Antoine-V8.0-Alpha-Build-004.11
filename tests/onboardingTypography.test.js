import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSync } from "esbuild";
import { QUESTIONS } from "../src/onboarding/questions.js";
import { EARLY_MESSAGES } from "../src/onboarding/earlyMessages.js";
import { COMPLETION_MESSAGES } from "../src/onboarding/completionMessages.js";

const require = createRequire(import.meta.url);
const code = buildSync({ entryPoints: ["src/components/onboarding/OnboardingText.jsx"],
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react"],
}).outputFiles[0].text;
const module = { exports: {} };
vm.runInNewContext(code, { module, require });
const OnboardingText = module.exports.default;

for (const mode of ["tu", "vous"]) {
  test(`ponctuation ${mode} : dernier mot et ponctuation insécables, texte et espaces conservés`, () => {
    const texts = [EARLY_MESSAGES[mode].firstName, COMPLETION_MESSAGES[mode].currentQuestion,
      ...QUESTIONS.map((question) => mode === "vous" ? question.textVous : question.text)];
    for (const text of texts) {
      const html = renderToStaticMarkup(React.createElement(OnboardingText, null, text));
      assert.equal(html.replace(/<[^>]*>/g, ""), text);
      assert.match(html, /<span class="onboarding-no-break">\S+ [?:]<\/span>$/u);
      assert.ok(!html.includes("<br"));
    }
  });
}

test("texte sans ponctuation française séparée : rendu inchangé", () => {
  for (const text of ["Une phrase explicative longue reste libre de revenir à la ligne.", "Reprise", "", "Un choix ?"]) {
    const html = renderToStaticMarkup(React.createElement(OnboardingText, null, text));
    assert.equal(html.replace(/<[^>]*>/g, ""), text);
  }
});
