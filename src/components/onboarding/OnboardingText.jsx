import React from "react";

// Garde la ponctuation française finale avec son dernier mot, sans changer le texte.
export default function OnboardingText({ children }) {
  if (typeof children !== "string") return children;
  const match = children.match(/^(.*?)(\S+[ \u00a0\u202f]+[?!:;])$/u);
  if (!match) return children;
  return <>{match[1]}<span className="onboarding-no-break">{match[2]}</span></>;
}
