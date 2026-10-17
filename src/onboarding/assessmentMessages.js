// Les questions et leurs variantes restent exclusivement dans questions.js.
const confirmation = [
  "Je confirme ne pas avoir connaissance d’un problème de santé ou d’une limitation physique qui m’empêcherait de pratiquer les exercices proposés par Coach Antoine.",
  "En cas de doute, de douleur inhabituelle ou de problème de santé, je demanderai conseil à un professionnel de santé avant de poursuivre.",
];

export const ASSESSMENT_MESSAGES = {
  tu: {
    safety: "Avant de commencer, je veux m’assurer que tu peux pratiquer les exercices proposés dans de bonnes conditions.",
    safetyTransition: "De ton côté, confirme simplement ceci :",
    confirmation,
    equipment: "As-tu du matériel sportif que tu pourrais utiliser pour tes séances ?",
    introduction: [
      "Très bien. Maintenant, je vais te poser quelques questions simples pour te proposer le niveau de départ qui te conviendra le mieux.",
      "Cela te prendra moins de 2 minutes.",
      "Il n’y a pas de bonne ou de mauvaise réponse. Choisis simplement celle qui te correspond le mieux aujourd’hui.",
    ],
    proposal: (level) => `D’après tes réponses, je te propose de commencer au niveau ${level}.`,
    proposalDetails: [
      "Si tu es d’accord, on part avec ce niveau. Sinon, sélectionne celui qui te convient.",
      "Tu pourras à tout moment choisir un niveau plus facile si celui-ci est trop exigeant pour toi.",
      "Au fil du temps, je pourrai te proposer de faire évoluer ton niveau. Mais tu pourras également le changer toi-même à tout moment.",
      "Dans tous les cas, c’est toujours toi qui décideras.",
    ],
    manual: "Quel niveau préfères-tu choisir ?",
    errors: { safety: "La confirmation est nécessaire avant de continuer.", age: "L’âge doit être validé avant de continuer.",
      equipment: "Le choix du matériel n’est pas valide.", answer: "Choisis une des trois réponses proposées.",
      assessment: "Toutes les réponses doivent être validées et la proposition recalculée. Reviens au questionnaire.",
      level: "Sélectionne un niveau pour continuer.", step: "Cette étape n’est pas disponible." },
  },
  vous: {
    safety: "Avant de commencer, je veux m’assurer que vous pouvez pratiquer les exercices proposés dans de bonnes conditions.",
    safetyTransition: "De votre côté, confirmez simplement ceci :",
    confirmation,
    equipment: "Avez-vous du matériel sportif que vous pourriez utiliser pour vos séances ?",
    introduction: [
      "Très bien. Maintenant, je vais vous poser quelques questions simples pour vous proposer le niveau de départ qui vous conviendra le mieux.",
      "Cela vous prendra moins de 2 minutes.",
      "Il n’y a pas de bonne ou de mauvaise réponse. Choisissez simplement celle qui vous correspond le mieux aujourd’hui.",
    ],
    proposal: (level) => `D’après vos réponses, je vous propose de commencer au niveau ${level}.`,
    proposalDetails: [
      "Si vous êtes d’accord, on part avec ce niveau. Sinon, sélectionnez celui qui vous convient.",
      "Vous pourrez à tout moment choisir un niveau plus facile si celui-ci est trop exigeant pour vous.",
      "Au fil du temps, je pourrai vous proposer de faire évoluer votre niveau. Mais vous pourrez également le changer vous-même à tout moment.",
      "Dans tous les cas, c’est toujours vous qui déciderez.",
    ],
    manual: "Quel niveau préférez-vous choisir ?",
    errors: { safety: "La confirmation est nécessaire avant de continuer.", age: "L’âge doit être validé avant de continuer.",
      equipment: "Le choix du matériel n’est pas valide.", answer: "Choisissez une des trois réponses proposées.",
      assessment: "Toutes les réponses doivent être validées et la proposition recalculée. Revenez au questionnaire.",
      level: "Sélectionnez un niveau pour continuer.", step: "Cette étape n’est pas disponible." },
  },
};
