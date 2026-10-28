import { displayName } from "../utils/displayName.js";

export const COMPLETION_MESSAGES = {
  tu: {
    transition: [
      "Voilà, ton niveau de départ est choisi !",
      "Mais avant de terminer, j’aimerais encore te poser une dernière question sur ton expérience avec les programmes d’exercices.",
      "Cela m’aidera à mieux t’accompagner.",
    ],
    experience: "As-tu déjà utilisé une application ou suivi un programme pour faire de l’exercice ?",
    currentQuestion: "Qu’est-ce qui te manque le plus dans l’application que tu utilises actuellement ?",
    reason: "Peux-tu me dire pourquoi tu as arrêté ?",
    reaction: "Merci, c’est bon à savoir. J’essaierai d’en tenir compte pour mieux t’accompagner.",
    incomplete: "Le profil doit être complet et valide avant de terminer. Reviens aux étapes précédentes pour le compléter.",
    conclusion: (firstName) => [
      `Merci ${displayName(firstName)}, c’est bon pour moi.`,
      "Avec ce que tu viens de me dire, je vais pouvoir te proposer des séances adaptées à ton niveau, à ton matériel et à ta forme du jour.",
      "Mais rien n’est figé : tu pourras changer de niveau, faire évoluer ton matériel à tout moment et m’indiquer ta forme du jour au début de chaque séance.",
      "On fait ta première séance maintenant ?",
    ],
  },
  vous: {
    transition: [
      "Voilà, votre niveau de départ est choisi !",
      "Mais avant de terminer, j’aimerais encore vous poser une dernière question sur votre expérience avec les programmes d’exercices.",
      "Cela m’aidera à mieux vous accompagner.",
    ],
    experience: "Avez-vous déjà utilisé une application ou suivi un programme pour faire de l’exercice ?",
    currentQuestion: "Qu’est-ce qui vous manque le plus dans l’application que vous utilisez actuellement ?",
    reason: "Pouvez-vous me dire pourquoi vous avez arrêté ?",
    reaction: "Merci, c’est bon à savoir. J’essaierai d’en tenir compte pour mieux vous accompagner.",
    incomplete: "Le profil doit être complet et valide avant de terminer. Revenez aux étapes précédentes pour le compléter.",
    conclusion: (firstName) => [
      `Merci ${displayName(firstName)}, c’est bon pour moi.`,
      "Avec ce que vous venez de me dire, je vais pouvoir vous proposer des séances adaptées à votre niveau, à votre matériel et à votre forme du jour.",
      "Mais rien n’est figé : vous pourrez changer de niveau, faire évoluer votre matériel à tout moment et m’indiquer votre forme du jour au début de chaque séance.",
      "On fait votre première séance maintenant ?",
    ],
  },
};
