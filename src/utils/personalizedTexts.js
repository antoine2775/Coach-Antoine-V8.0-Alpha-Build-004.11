import { displayName } from "./displayName.js";

// Variantes rédigées explicitement ; aucune substitution de mots à l'exécution.
export function getStopReasonLabel(option, profile) {
  if (option.value === "notSupportedOrMotivated" && profile?.sex === "female") {
    return "Je ne me sentais pas assez accompagnée ni assez motivée";
  }
  return option.value === "notSupportedEnough" && profile?.sex === "female"
    ? "Je ne me sentais pas assez accompagnée" : option.label;
}

export function getPersonalizedTexts(profile) {
  const vous = profile?.addressMode === "vous";
  const name = displayName(profile?.firstName);
  const bravo = name ? `Bravo ${name} !` : "Bravo !";
  return {
    interrupted: vous ? "Votre séance est en pause. Que souhaitez-vous faire ?" : "Ta séance est en pause. Que souhaites-tu faire ?",
    getReady: vous ? "Préparez-vous pour la suite." : "Prépare-toi pour la suite.",
    earlySkipReminder: vous ? "Prenez votre temps. Un exercice fait lentement est plus efficace."
      : "Prends ton temps. Un exercice fait lentement est plus efficace.",
    adaptationQuestion: vous ? "Vos exercices et vos temps de récupération étaient-ils bien adaptés aujourd’hui ?"
      : "Tes exercices et tes temps de récupération étaient-ils bien adaptés aujourd’hui ?",
    adaptationCategory: "Qu’est-ce qu’on pourrait mieux adapter ?",
    adaptationMultiple: vous ? "Vous pouvez choisir plusieurs éléments." : "Tu peux choisir plusieurs éléments.",
    adaptationDetails: vous ? "Précisez-moi ce qui vous conviendrait." : "Précise-moi ce qui te conviendrait.",
    adaptationDetail: { pauses: "Comment étaient les temps de récupération ?", duration: "Comment était la durée de la séance ?",
      difficulty: "Comment était la difficulté des exercices ?" },
    feedbackYes: name ? `Parfait ${name}.` : "Parfait.",
    feedbackThanks: vous ? "Merci, votre avis est enregistré." : "Merci, ton avis est enregistré.",
    feedbackOtherThanks: vous ? "Merci, j’ai bien noté vos autres remarques et je vais essayer d’en tenir compte à l’avenir."
      : "Merci, j’ai bien noté tes autres remarques et je vais essayer d’en tenir compte à l’avenir.",
    feedbackAcknowledgementTitle: vous ? "Merci pour votre retour." : "Merci pour ton retour.",
    goodbye: (hour = new Date().getHours()) => {
      const greeting = hour < 17 ? "Bonne journée" : hour < 20 ? "Bonne fin de journée" : "Bonne soirée";
      return `${greeting}${name ? ` ${name}` : ""} !`;
    },
    restFeedback: (choice, seconds) => choice === "perfect"
      ? `Parfait${name ? ` ${name}` : ""}. La prochaine fois, on garde les récupérations à ${seconds} secondes.`
      : `D’accord${name ? ` ${name}` : ""}. La prochaine fois, les récupérations passeront à ${seconds} secondes.`,
    restMessage: (step) => (vous ? [
      "Respirez tranquillement.", "Relâchez un peu les épaules.", "Prenez quelques secondes.",
      "On récupère tranquillement.", "Très bien, soufflez un peu.", "Préparez-vous pour la suite.",
    ] : [
      "Respire tranquillement.", "Relâche un peu les épaules.", "Prends quelques secondes.",
      "On récupère tranquillement.", "Très bien, souffle un peu.", "Prépare-toi pour la suite.",
    ])[step % 6],
    welcome: name ? `Bonjour ${name} !` : "Bonjour !",
    ready: profile?.sex === "female" ? "Prête ?" : profile?.sex === "male" ? "Prêt ?" : "On y va ?",
    program: vous ? "Coach Antoine va vous préparer la bonne séance pour aujourd’hui."
      : "Coach Antoine va te préparer la bonne séance pour aujourd’hui.",
    dayFormQuestion: vous ? "Comment vous sentez-vous aujourd’hui ?" : "Comment te sens-tu aujourd’hui ?",
    dayFormExplanation: vous ? "Dites-moi simplement comment vous vous sentez. J’en tiendrai compte pour votre séance."
      : "J’en tiendrai compte pour ta séance.",
    dayFormNote: vous ? "Aujourd’hui ne définit pas votre niveau général. C’est simplement votre forme du jour."
      : "Aujourd’hui ne définit pas ton niveau général. C’est simplement ta forme du jour.",
    pace: vous ? "On y va à votre rythme." : "On y va à ton rythme.",
    rest: vous ? "Respirez tranquillement." : "Respire tranquillement.",
    safety: vous ? "Restez dans une amplitude confortable. Arrêtez l’exercice en cas de douleur ou de malaise."
      : "Reste dans une amplitude confortable. Arrête l’exercice en cas de douleur ou de malaise.",
    restQuestion: vous ? "Les temps de récupération vous ont-ils convenu ?" : "Les temps de récupération t’ont-ils convenu ?",
    journey: vous ? "VOTRE PARCOURS" : "TON PARCOURS",
    emptyHistory: vous ? "Votre prochaine séance apparaîtra ici." : "Ta prochaine séance apparaîtra ici.",
    understand: vous ? "Vous commencez à comprendre ?" : "Tu commences à comprendre ?",
    zzTop: vous
      ? "Si les lunettes et la barbe vous ont fait penser à ZZ Top… bienvenue au club ! Je ne dirai pas quel âge j’ai… mais on a sûrement quelques souvenirs en commun. 😉"
      : "Si les lunettes et la barbe t’ont fait penser à ZZ Top… bienvenue au club ! Je ne dirai pas quel âge j’ai… mais on a sûrement quelques souvenirs en commun. 😉",
    finish: (dayForm) => {
      if (dayForm === "low") return vous
        ? `Aujourd’hui, on a fait plus léger. Mais l’important, c’est que vous avez quand même fait votre séance. ${bravo}`
        : `Aujourd’hui, on a fait plus léger. Mais l’important, c’est que tu as quand même fait ta séance. ${bravo}`;
      if (dayForm === "normal") return name
        ? `Belle séance aujourd’hui, ${name} !`
        : "Belle séance aujourd’hui !";
      if (dayForm === "high") return `Une séance un peu plus soutenue aujourd’hui. ${bravo}`;
      return bravo;
    },
  };
}
