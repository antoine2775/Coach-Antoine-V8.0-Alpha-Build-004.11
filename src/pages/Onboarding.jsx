import React from "react";
import { useUserProfile } from "../context/UserProfileContext";
import { ONBOARDING_STEPS } from "../onboarding/steps";

const errors = {
  invalid: "Le profil enregistré est invalide ou illisible. Il n’a pas été remplacé.",
  "unsupported-version": "Cette version du profil n’est pas prise en charge. Les données ont été conservées.",
  unavailable: "Le stockage du profil est indisponible. L’accès à l’application nécessite sa lecture.",
  "invalid-step": "L’étape enregistrée n’est pas reconnue. Le profil et les réponses ont été conservés.",
};

// Point d'insertion des futurs écrans : aucun formulaire ni saut d'étape en 4A.
function PendingStep({ step }) {
  return <section className="card" aria-labelledby="onboarding-step-title">
    <p className="eyebrow">Étape {step.index + 1} sur {ONBOARDING_STEPS.length}</p>
    <h2 id="onboarding-step-title">{step.title}</h2>
    <p>Le parcours initial est en cours de préparation.</p>
  </section>;
}

export default function Onboarding() {
  const { onboarding, saveError, reloadProfile } = useUserProfile();
  const error = errors[onboarding.status];
  return <main className="page" data-onboarding-status={onboarding.status}>
    <header className="page-header">
      <p className="eyebrow">COACH ANTOINE</p>
      <h1>Configuration initiale</h1>
    </header>
    {onboarding.status === "loading" && <p role="status">Chargement du profil…</p>}
    {error && <section className="card">
      <p role="alert">{error}</p>
      <button type="button" className="secondary-button" onClick={reloadProfile}>Réessayer la lecture</button>
    </section>}
    {(onboarding.status === "absent" || onboarding.status === "incomplete") &&
      <div data-onboarding-resuming={onboarding.isResuming}>
        <PendingStep step={onboarding.step} />
      </div>}
    {saveError && <p role="alert">La mise à jour du profil n’a pas pu être enregistrée.</p>}
  </main>;
}
