export const COMPLETION_MESSAGES = {
  tu: {
    experience: "As-tu déjà utilisé une application ou suivi un programme pour entretenir ta forme ?",
    reason: ["Est-ce que je peux te demander pourquoi ça n’a pas marché ?",
      "C’est important pour moi de le comprendre pour te proposer quelque chose qui te donne envie de continuer."],
    reasonThanks: "Merci de me l’avoir dit. Je vais essayer d’en tenir compte.",
    reasonDeclined: "Bien sûr, aucun problème.",
    conclusion: (firstName) => [
      `Je te connais déjà un peu mieux, ${firstName}.`,
      "On a tout ce qu’il faut pour commencer.",
      "À partir de maintenant, je vais pouvoir te proposer des séances adaptées à ton niveau, à ton matériel et à ta forme du jour.",
      "Et on ajustera les choses ensemble au fil des séances.",
      "Tu veux faire ta première séance maintenant ?",
    ],
  },
  vous: {
    experience: "Avez-vous déjà utilisé une application ou suivi un programme pour entretenir votre forme ?",
    reason: ["Est-ce que je peux vous demander pourquoi ça n’a pas marché ?",
      "C’est important pour moi de le comprendre pour vous proposer quelque chose qui vous donne envie de continuer."],
    reasonThanks: "Merci de me l’avoir dit. Je vais essayer d’en tenir compte.",
    reasonDeclined: "Bien sûr, aucun problème.",
    conclusion: (firstName) => [
      `Je vous connais déjà un peu mieux, ${firstName}.`,
      "On a tout ce qu’il faut pour commencer.",
      "À partir de maintenant, je vais pouvoir vous proposer des séances adaptées à votre niveau, à votre matériel et à votre forme du jour.",
      "Et nous ajusterons les choses ensemble au fil des séances.",
      "Voulez-vous faire votre première séance maintenant ?",
    ],
  },
};
