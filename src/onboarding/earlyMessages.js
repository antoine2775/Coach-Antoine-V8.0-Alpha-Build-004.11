import { displayName } from "../utils/displayName.js";

// Variantes explicites : aucune substitution automatique de pronoms.
const introduction = [
  "Mon rôle est d’accompagner chacun pour entretenir sa forme, à son rythme, avec des séances simples et adaptées.",
  "Pas besoin d’être sportif : l’important, c’est de bouger régulièrement et d’avoir envie d’aller à la séance suivante.",
  "Pour que ce soit plus simple entre nous, je propose qu’on se tutoie.",
  "D’accord pour qu’on se tutoie ?",
];
export const EARLY_MESSAGES = {
  tu: {
    introduction,
    explanation: [
      "Pour te proposer le bon niveau de départ, j’ai besoin d’en savoir un peu plus sur toi : tes habitudes, ce que tu es en capacité de faire aujourd’hui et le matériel dont tu disposes.",
      "Et par la suite, avant chaque séance, je te demanderai simplement comment tu te sens aujourd’hui.",
      "La séance s’adaptera à toi, pas l’inverse.",
    ],
    sex: "Tu es :",
    firstName: "Pour commencer, comment t’appelles-tu ?",
    greeting: (name) => `Enchanté ${displayName(name)} ! Moi, tu le sais déjà, c’est Coach Antoine.`,
    age: "Et quel âge as-tu ?",
    underage: [
      "Merci pour ton intérêt pour Coach Antoine.",
      "Pour le moment, Coach Antoine est réservé aux personnes âgées de 18 ans ou plus.",
      "Tu pourras nous retrouver lorsque tu auras 18 ans.",
    ],
    firstNameError: "Indique ton prénom pour continuer.",
    ageError: "Indique ton âge avec un nombre entier positif.",
  },
  vous: {
    introduction,
    explanation: [
      "Pour vous proposer le bon niveau de départ, j’ai besoin d’en savoir un peu plus sur vous : vos habitudes, ce que vous êtes en capacité de faire aujourd’hui et le matériel dont vous disposez.",
      "Et par la suite, avant chaque séance, je vous demanderai simplement comment vous vous sentez aujourd’hui.",
      "La séance s’adaptera à vous, pas l’inverse.",
    ],
    sex: "Vous êtes :",
    firstName: "Pour commencer, comment vous appelez-vous ?",
    greeting: (name) => `Enchanté ${displayName(name)} ! Moi, vous le savez déjà, c’est Coach Antoine.`,
    age: "Et quel âge avez-vous ?",
    underage: [
      "Merci pour votre intérêt pour Coach Antoine.",
      "Pour le moment, Coach Antoine est réservé aux personnes âgées de 18 ans ou plus.",
      "Vous pourrez nous retrouver lorsque vous aurez 18 ans.",
    ],
    firstNameError: "Indiquez votre prénom pour continuer.",
    ageError: "Indiquez votre âge avec un nombre entier positif.",
  },
};
