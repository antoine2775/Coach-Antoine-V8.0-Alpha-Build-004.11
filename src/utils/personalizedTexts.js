import { displayName } from "./displayName.js";

// Variantes rédigées explicitement ; aucune substitution de mots à l'exécution.
export function getStopReasonLabel(option, profile) {
  return option.value === "notSupportedEnough" && profile?.sex === "female"
    ? "Je ne me sentais pas assez accompagnée" : option.label;
}

export function getPersonalizedTexts(profile) {
  const vous = profile?.addressMode === "vous";
  const name = displayName(profile?.firstName);
  const bravo = name ? `Bravo ${name} !` : "Bravo !";
  return {
    goodbye: (hour = new Date().getHours()) => {
      const greeting = hour < 17 ? "Bonne journée" : hour < 20 ? "Bonne fin de journée" : "Bonne soirée";
      return `${greeting}${name ? ` ${name}` : ""} !`;
    },
    restFeedback: (choice, seconds) => choice === "perfect"
      ? `Parfait${name ? ` ${name}` : ""}. La prochaine fois, on garde les pauses à ${seconds} secondes.`
      : `D’accord${name ? ` ${name}` : ""}. La prochaine fois, les pauses passeront à ${seconds} secondes.`,
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
    restQuestion: vous ? "Les pauses vous ont-elles convenu ?" : "Les pauses t’ont-elles convenu ?",
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
        ? `Belle séance aujourd’hui, ${name} ! À bientôt pour la prochaine.`
        : "Belle séance aujourd’hui ! À bientôt pour la prochaine.";
      if (dayForm === "high") return `Une séance un peu plus soutenue aujourd’hui. ${bravo}`;
      return bravo;
    },
  };
}
