export const dailyProgram = [
  {
    label: "Mise en mouvement",
    minutes: 3,
    icon: "🧍",
  },
  {
    label: "Renforcement musculaire",
    minutes: 7,
    icon: "💪",
  },
  {
    label: "Équilibre & coordination",
    minutes: 3,
    icon: "⚖️",
  },
  {
    label: "Mobilité & souplesse",
    minutes: 5,
    icon: "🙆",
  },
];

export function getCoachSayings(profile) {
  const vous = profile?.addressMode === "vous";
  return [
  "Le plus difficile, c'est de commencer.",
  "Chaque séance compte.",
  vous ? "On avance à votre rythme." : "On avance à ton rythme.",
  vous ? "Respirez." : "Respire.",
  vous ? "Continuez comme ça." : "Continue comme ça.",
  "Pas besoin d'en faire trop. Il faut surtout avoir envie de recommencer.",
];
}

export const workoutSteps = [
  {
    id: "mobilite-epaules",
    name: "Mobilité des épaules",
    seconds: 60,

    targetLow: "6 à 8 rotations dans chaque sens",
    targetNormal: "8 à 10 rotations dans chaque sens",
    targetHigh: "10 à 12 rotations dans chaque sens",

    note: "Fais des mouvements lents et confortables.",
    noteVous: "Faites des mouvements lents et confortables.",
    pillar: "mobilite",
    equipment: "none",
  },

  {
    id: "marche-active",
    name: "Marche active sur place",
    seconds: 75,

    targetLow: "Rythme tranquille et régulier",
    targetNormal: "Rythme régulier et confortable",
    targetHigh: "Rythme soutenu mais confortable",

    note: "Bouge les bras naturellement et garde le contrôle de ta respiration.",
    noteVous: "Bougez les bras naturellement et gardez le contrôle de votre respiration.",
    pillar: "cardio",
    equipment: "none",
  },

  {
    id: "assis-debout-chaise",
    name: "Assis-debout avec chaise",
    seconds: 75,

    targetLow: "6 à 8 répétitions",
    targetNormal: "8 à 12 répétitions",
    targetHigh: "12 à 15 répétitions",

    note: "Pousse dans les jambes et redresse-toi sans précipitation.",
    noteVous: "Poussez dans les jambes et redressez-vous sans précipitation.",
    pillar: "renforcement",
    equipment: "chair",
  },

  {
    id: "pompes-mur",
    name: "Pompes contre un mur",
    seconds: 75,

    targetLow: "6 à 8 répétitions",
    targetNormal: "8 à 12 répétitions",
    targetHigh: "12 à 15 répétitions",

    note: "Garde le corps droit et contrôle le mouvement.",
    noteVous: "Gardez le corps droit et contrôlez le mouvement.",
    pillar: "renforcement",
    equipment: "none",
  },

  {
    id: "pas-lateraux",
    name: "Pas latéraux",
    seconds: 75,

    targetLow: "6 à 8 passages de chaque côté",
    targetNormal: "8 à 10 passages de chaque côté",
    targetHigh: "10 à 12 passages de chaque côté",

    note: "Déplace-toi de droite à gauche avec contrôle.",
    noteVous: "Déplacez-vous de droite à gauche avec contrôle.",
    pillar: "cardio",
    equipment: "none",
  },

  {
    id: "equilibre",
    name: "Équilibre contrôlé",
    seconds: 75,

    targetLow: "15 à 20 secondes de chaque côté",
    targetNormal: "20 à 30 secondes de chaque côté",
    targetHigh: "30 à 40 secondes de chaque côté",

    note: "Stabilise-toi sans forcer. Appuie-toi si nécessaire.",
    noteVous: "Stabilisez-vous sans forcer. Appuyez-vous si nécessaire.",
    pillar: "equilibre",
    equipment: "none",
  },

  {
    id: "extension-jambes-assis",
    name: "Extension des jambes en position assise",
    seconds: 75,

    targetLow: "6 à 8 répétitions par jambe",
    targetNormal: "8 à 10 répétitions par jambe",
    targetHigh: "10 à 12 répétitions par jambe",

    note: "Tends alternativement chaque jambe sans donner d'élan.",
    noteVous: "Tendez alternativement chaque jambe sans donner d’élan.",
    pillar: "renforcement",
    equipment: "chair",
  },

  {
    id: "montees-pointe-pieds",
    name: "Montées sur la pointe des pieds",
    seconds: 75,

    targetLow: "8 à 10 répétitions",
    targetNormal: "10 à 15 répétitions",
    targetHigh: "15 à 18 répétitions",

    note: "Monte doucement, reste stable, puis redescends lentement.",
    noteVous: "Montez doucement, restez stable, puis redescendez lentement.",
    pillar: "renforcement",
    equipment: "none",
  },

  {
    id: "rotations-buste",
    name: "Rotations douces du buste",
    seconds: 75,

    targetLow: "6 à 8 rotations de chaque côté",
    targetNormal: "8 à 10 rotations de chaque côté",
    targetHigh: "10 à 12 rotations de chaque côté",

    note: "Tourne tranquillement de chaque côté sans forcer.",
    noteVous: "Tournez tranquillement de chaque côté sans forcer.",
    pillar: "mobilite",
    equipment: "none",
  },

  {
    id: "ouverture-poitrine",
    name: "Ouverture de la poitrine",
    seconds: 75,

    targetLow: "6 à 8 mouvements contrôlés",
    targetNormal: "8 à 10 mouvements contrôlés",
    targetHigh: "10 à 12 mouvements contrôlés",

    note: "Redresse-toi et ramène doucement les épaules vers l'arrière.",
    noteVous: "Redressez-vous et ramenez doucement les épaules vers l’arrière.",
    pillar: "posture",
    equipment: "none",
  },

  {
    id: "etirement-mollets",
    name: "Étirement doux des mollets",
    seconds: 75,

    targetLow: "20 secondes par côté",
    targetNormal: "25 à 30 secondes par côté",
    targetHigh: "30 secondes par côté",

    note: "Garde le talon au sol et cherche seulement une tension confortable.",
    noteVous: "Gardez le talon au sol et cherchez seulement une tension confortable.",
    pillar: "mobilite",
    equipment: "none",
  },

  {
    id: "respiration-grandissement",
    name: "Respiration et étirements",
    seconds: 105,

    targetLow: "5 respirations lentes",
    targetNormal: "5 à 8 respirations lentes",
    targetHigh: "6 à 8 respirations lentes",

    note: "Respire lentement, relâche les épaules et termine la séance en te redressant.",
    noteVous: "Respirez lentement, relâchez les épaules et terminez la séance en vous redressant.",
    pillar: "posture",
    equipment: "none",
  },
];
