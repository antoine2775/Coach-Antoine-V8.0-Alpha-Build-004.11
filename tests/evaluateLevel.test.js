import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, QUESTIONNAIRE_VERSION } from "../src/onboarding/questions.js";
import { evaluateLevel } from "../src/onboarding/evaluateLevel.js";

test("version explicite, neuf questions uniques et trois réponses stables chacune", () => {
  assert.equal(QUESTIONNAIRE_VERSION, "1");
  assert.equal(QUESTIONS.length, 9);
  assert.equal(new Set(QUESTIONS.map((question) => question.id)).size, 9);
  assert.deepEqual(QUESTIONS.map((question) => question.id), Array.from({ length: 9 }, (_, i) => `q${i + 1}`));
  for (const [index, question] of QUESTIONS.entries()) {
    assert.equal(question.answers.length, 3);
    assert.deepEqual(question.answers.map((answer) => answer.value), ["a", "b", "c"]);
    assert.deepEqual(question.answers.map((answer) => answer.points), index < 4 ? [4, 3, 0] : index < 8 ? [3, 2, 1] : [3, 2, 0]);
    assert.equal(question.scoreGroup, index < 4 ? "capacity" : "activity");
    assert.ok(Object.isFrozen(question));
    assert.ok(Object.isFrozen(question.answers));
    for (const answer of question.answers) {
      assert.ok(Object.isFrozen(answer));
      assert.equal(typeof answer.text, "string");
      assert.ok(answer.text.length > 0);
      assert.doesNotMatch(answer.text, /^[ABC][.)]\s/);
    }
  }
  assert.ok(Object.isFrozen(QUESTIONS));
});

test("textes des neuf questions et de leurs réponses strictement conformes", () => {
  assert.deepEqual(QUESTIONS.map(({ text, answers }) => [text, ...answers.map((answer) => answer.text)]), [
    ["Monter un étage par les escaliers, à ton rythme, te paraît :", "Facile", "Faisable sans difficulté particulière", "Fatiguant"],
    ["Te lever plusieurs fois de suite d’une chaise sans utiliser les mains te paraît :", "Facile", "Faisable", "Trop fatiguant"],
    ["Rester debout sur une jambe uniquement, pendant 5 secondes, te paraît :", "Facile", "Faisable", "Difficile"],
    ["Debout, tourner le haut du corps pour regarder derrière toi, sans déplacer les pieds, te paraît :", "Facile", "Faisable, mais avec un peu de raideur", "Difficile"],
    ["En ce moment, à quelle fréquence pratiques-tu une activité pour entretenir ta forme ?", "3 fois par semaine ou plus", "1 à 2 fois par semaine", "Rarement ou jamais"],
    ["Fais-tu des exercices pour entretenir ou renforcer tes muscles ?", "Oui, régulièrement", "De temps en temps", "Rarement ou jamais"],
    ["Fais-tu des exercices pour entretenir ta souplesse ou ta mobilité ?", "Oui, régulièrement", "De temps en temps", "Rarement ou jamais"],
    ["As-tu déjà pratiqué régulièrement une activité pour entretenir ta forme ?", "Oui, et encore récemment", "Oui, mais il y a quelque temps", "Non, jamais vraiment"],
    ["Faire régulièrement une séance d’exercices d’environ 20 minutes te semblerait :", "Facile", "Tout à fait raisonnable", "Assez exigeant"],
  ]);
});

test("scores minimum et maximum", () => {
  assert.deepEqual(evaluateLevel(Array(9).fill("c")), { capacityScore: 0, activityScore: 4, proposedLevel: "reprise" });
  assert.deepEqual(evaluateLevel(Array(9).fill("a")), { capacityScore: 16, activityScore: 15, proposedLevel: "tonique" });
});

// Toutes les frontières sont évaluées à partir de vraies réponses, jamais de scores injectés.
const capacities = { 10: "abbc", 11: "aabc", 12: "bbbb", 13: "abbb", 14: "aabb", 15: "aaab", 16: "aaaa" };
const activities = { 4: "ccccc", 7: "bbbcc", 8: "bbbbc", 12: "aaaac", 13: "aaabb", 15: "aaaaa" };
const matrix = {
  10: ["reprise", "reprise", "reprise"],
  11: ["reprise", "reprise", "reprise"],
  12: ["reprise", "forme", "forme"],
  13: ["reprise", "forme", "forme"],
  14: ["forme", "forme", "tonique"],
  15: ["forme", "forme", "tonique"],
  16: ["forme", "forme", "tonique"],
};
for (const [capacity, prefix] of Object.entries(capacities)) {
  for (const [activity, suffix] of Object.entries(activities)) {
    test(`matrice : capacités ${capacity}, activité ${activity}`, () => {
      const column = Number(activity) <= 7 ? 0 : Number(activity) <= 12 ? 1 : 2;
      assert.deepEqual(evaluateLevel([...(prefix + suffix)]), {
        capacityScore: Number(capacity), activityScore: Number(activity), proposedLevel: matrix[capacity][column],
      });
    });
  }
}

test("les 19 683 combinaisons valides : scores, matrice et capacités 0–11 donnant Reprise", () => {
  const capacityValues = new Set();
  const activityValues = new Set();
  let lowCapacityCases = 0;
  for (let combination = 0; combination < 3 ** 9; combination += 1) {
    let value = combination;
    const answers = Array.from({ length: 9 }, () => {
      const answer = ["a", "b", "c"][value % 3];
      value = Math.floor(value / 3);
      return answer;
    });
    const result = evaluateLevel(answers);
    // Oracle de test indépendant des données de production.
    const capacityScore = answers.slice(0, 4).reduce((sum, answer) => sum + { a: 4, b: 3, c: 0 }[answer], 0);
    const activityScore = answers.slice(4, 8).reduce((sum, answer) => sum + { a: 3, b: 2, c: 1 }[answer], 0) + { a: 3, b: 2, c: 0 }[answers[8]];
    assert.equal(result.capacityScore, capacityScore);
    assert.equal(result.activityScore, activityScore);
    capacityValues.add(capacityScore);
    activityValues.add(activityScore);
    if (capacityScore <= 11) {
      assert.equal(result.proposedLevel, "reprise");
      lowCapacityCases += 1;
    } else {
      const column = activityScore <= 7 ? 0 : activityScore <= 12 ? 1 : 2;
      assert.equal(result.proposedLevel, matrix[capacityScore][column]);
    }
  }
  assert.ok(lowCapacityCases > 0);
  assert.deepEqual([...capacityValues].sort((a, b) => a - b), [0, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual([...activityValues].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 4));
});

test("structures et longueurs invalides refusées explicitement", () => {
  for (const answers of [null, undefined, {}, "aaaaaaaaa", 9, true, new Set(Array(9).fill("a")), [], Array(8).fill("a"), Array(10).fill("a"), { length: 9 }]) {
    assert.throws(() => evaluateLevel(answers), { name: "TypeError", message: /9 réponses/ });
  }
});

test("valeurs inconnues, réponses manquantes et tableaux creux refusés", () => {
  for (let index = 0; index < 9; index += 1) {
    for (const invalid of [null, undefined, "", "d", "A", " a", "a ", 0, 1, false, {}, ["a"]]) {
      const answers = Array(9).fill("a");
      answers[index] = invalid;
      assert.throws(() => evaluateLevel(answers), { name: "TypeError", message: new RegExp(`q${index + 1}`) });
    }
    const sparse = Array(9).fill("a");
    delete sparse[index];
    assert.throws(() => evaluateLevel(sparse), TypeError);
  }
});

test("fonction pure : entrée figée inchangée, résultat reproductible sans stockage", () => {
  const answers = Object.freeze(Array(9).fill("b"));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("Aucun accès au stockage autorisé"); } });
    const first = evaluateLevel(answers);
    assert.deepEqual(first, { capacityScore: 12, activityScore: 10, proposedLevel: "forme" });
    assert.deepEqual(evaluateLevel(answers), first);
    assert.deepEqual(answers, Array(9).fill("b"));
    first.proposedLevel = "changed";
    assert.equal(evaluateLevel(answers).proposedLevel, "forme");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});
