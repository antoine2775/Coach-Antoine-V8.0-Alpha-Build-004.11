// Indices persistés dans onboardingCurrentStep : ne pas réordonner sans migration.
// Les étapes sont des points d'extension, pas encore des écrans de formulaire.
export const ONBOARDING_STEPS = Object.freeze([
  { id: "introduction", title: "Présentation et choix du mode d’adresse" },
  { id: "getting-to-know", title: "Le niveau de départ" },
  { id: "sex", title: "Sexe déclaré" },
  { id: "first-name", title: "Prénom" },
  { id: "age", title: "Âge — pratique réservée aux adultes" },
  { id: "safety", title: "Sécurité et aptitude à la pratique" },
  { id: "equipment", title: "Matériel sportif disponible" },
  { id: "assessment-introduction", title: "Présentation du questionnaire" },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `assessment-q${index + 1}`,
    questionId: `q${index + 1}`,
    title: `Question ${index + 1} sur 9`,
  })),
  { id: "level-proposal", title: "Proposition du niveau de départ" },
  { id: "previous-experience", title: "Expérience avec un programme ou une application" },
  // Le futur parcours ne présentera cette étape que si l'expérience vaut stopped.
  { id: "stop-reason", title: "Raison éventuelle de l’abandon", condition: "stopped" },
  { id: "finish", title: "Première séance maintenant ou plus tard" },
].map((step, index) => Object.freeze({ ...step, index })));
