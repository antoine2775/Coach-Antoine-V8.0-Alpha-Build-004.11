import { QUESTIONS } from "./questions.js";

/**
 * Évaluation pure du questionnaire version 1.
 * @param {Array<"a"|"b"|"c">} answers Exactement neuf valeurs, dans l'ordre q1–q9.
 * @returns {{capacityScore: number, activityScore: number, proposedLevel: string}}
 * activityScore regroupe habitudes Q5–Q8 ET perception Q9 (4 à 15 points).
 * Matrice validée (colonnes activityScore : 4–7 / 8–12 / 13–15) :
 * capacités 0–11 : reprise / reprise / reprise ;
 * capacités 12–13 : reprise / forme / forme ;
 * capacités 14–16 : forme / forme / tonique.
 * @throws {TypeError} Structure, longueur ou réponse invalide/manquante.
 * Aucune réponse par défaut, aucun stockage, aucune modification de l'entrée.
 * Le futur onboarding enregistrera lui-même le résultat, la date et la version.
 */
export function evaluateLevel(answers) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
    throw new TypeError("L’évaluation attend un tableau de exactement 9 réponses (q1 à q9).");
  }

  let capacityScore = 0;
  let activityScore = 0;
  for (let index = 0; index < QUESTIONS.length; index += 1) {
    const question = QUESTIONS[index];
    const answer = Object.hasOwn(answers, index)
      ? question.answers.find((option) => option.value === answers[index])
      : undefined;
    if (!answer) {
      throw new TypeError(`Réponse invalide ou manquante pour ${question.id} : valeur attendue a, b ou c.`);
    }
    if (question.scoreGroup === "capacity") capacityScore += answer.points;
    else activityScore += answer.points;
  }

  // 11 est atteignable (4 + 4 + 3 + 0) et appartient à la ligne 0–11.
  let proposedLevel;
  if (capacityScore <= 11) proposedLevel = "reprise";
  else if (capacityScore <= 13) proposedLevel = activityScore <= 7 ? "reprise" : "forme";
  else proposedLevel = activityScore >= 13 ? "tonique" : "forme";

  return { capacityScore, activityScore, proposedLevel };
}
