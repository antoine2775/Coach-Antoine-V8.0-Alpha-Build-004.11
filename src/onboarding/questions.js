// Version à conserver plus tard avec assessmentAnswers / assessmentDate.
export const QUESTIONNAIRE_VERSION = "1";

// Source unique du barème : les réponses exposées ci-dessous portent leurs points.
const CAPACITY_POINTS = [4, 3, 0];
const HABIT_POINTS = [3, 2, 1];
const PERCEPTION_POINTS = [3, 2, 0];
const VALUES = ["a", "b", "c"];

function question(id, text, labels, points, scoreGroup) {
  return Object.freeze({
    id,
    text,
    scoreGroup,
    // value est interne ; seul text est destiné au futur écran, sans lettre A/B/C.
    answers: Object.freeze(labels.map((text, index) => Object.freeze({
      value: VALUES[index], text, points: points[index],
    }))),
  });
}

// L'ordre q1 à q9 est aussi l'ordre du tableau assessmentAnswers du profil V1.
export const QUESTIONS = Object.freeze([
  question("q1", "Monter un étage par les escaliers, à ton rythme, te paraît :", [
    "Facile", "Faisable sans difficulté particulière", "Fatiguant",
  ], CAPACITY_POINTS, "capacity"),
  question("q2", "Te lever plusieurs fois de suite d’une chaise sans utiliser les mains te paraît :", [
    "Facile", "Faisable", "Trop fatiguant",
  ], CAPACITY_POINTS, "capacity"),
  question("q3", "Rester debout sur une jambe uniquement, pendant 5 secondes, te paraît :", [
    "Facile", "Faisable", "Difficile",
  ], CAPACITY_POINTS, "capacity"),
  question("q4", "Debout, tourner le haut du corps pour regarder derrière toi, sans déplacer les pieds, te paraît :", [
    "Facile", "Faisable, mais avec un peu de raideur", "Difficile",
  ], CAPACITY_POINTS, "capacity"),
  question("q5", "En ce moment, à quelle fréquence pratiques-tu une activité pour entretenir ta forme ?", [
    "3 fois par semaine ou plus", "1 à 2 fois par semaine", "Rarement ou jamais",
  ], HABIT_POINTS, "activity"),
  question("q6", "Fais-tu des exercices pour entretenir ou renforcer tes muscles ?", [
    "Oui, régulièrement", "De temps en temps", "Rarement ou jamais",
  ], HABIT_POINTS, "activity"),
  question("q7", "Fais-tu des exercices pour entretenir ta souplesse ou ta mobilité ?", [
    "Oui, régulièrement", "De temps en temps", "Rarement ou jamais",
  ], HABIT_POINTS, "activity"),
  question("q8", "As-tu déjà pratiqué régulièrement une activité pour entretenir ta forme ?", [
    "Oui, et encore récemment", "Oui, mais il y a quelque temps", "Non, jamais vraiment",
  ], HABIT_POINTS, "activity"),
  question("q9", "Faire régulièrement une séance d’exercices d’environ 20 minutes te semblerait :", [
    "Facile", "Tout à fait raisonnable", "Assez exigeant",
  ], PERCEPTION_POINTS, "activity"),
]);
