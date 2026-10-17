import React from "react";
import { useUserProfile } from "../context/UserProfileContext";
import CoachAvatar from "../components/CoachAvatar";
import EarlySteps, { EARLY_STEP_IDS } from "../components/onboarding/EarlySteps";
import AssessmentSteps, { ASSESSMENT_STEP_IDS } from "../components/onboarding/AssessmentSteps";
import CompletionSteps from "../components/onboarding/CompletionSteps";

const errors = {
  invalid: "Le profil enregistré est invalide ou illisible. Il n’a pas été remplacé.",
  "unsupported-version": "Cette version du profil n’est pas prise en charge. Les données ont été conservées.",
  unavailable: "Le stockage du profil est indisponible. L’accès à l’application nécessite sa lecture.",
  "invalid-step": "L’étape enregistrée n’est pas reconnue. Le profil et les réponses ont été conservés.",
};

export default function Onboarding() {
  const { onboarding, saveError, reloadProfile } = useUserProfile();
  const error = errors[onboarding.status];
  return <main className="page" data-onboarding-status={onboarding.status}>
    <header className="page-header">
      <p className="eyebrow">COACH ANTOINE</p>
      <h1>Faisons connaissance.</h1>
    </header>
    {onboarding.status === "loading" && <p role="status">Chargement du profil…</p>}
    {error && <section className="card">
      <p role="alert">{error}</p>
      <button type="button" className="secondary-button" onClick={reloadProfile}>Réessayer la lecture</button>
    </section>}
    {(onboarding.status === "absent" || onboarding.status === "incomplete") &&
      <div data-onboarding-resuming={onboarding.isResuming}>
        <section className="card onboarding-stage" key={onboarding.step.id}>
          <div className="onboarding-avatar"><CoachAvatar size={160} /></div>
          <div className="onboarding-content">
            {EARLY_STEP_IDS.includes(onboarding.step.id)
              ? <EarlySteps step={onboarding.step} />
              : ASSESSMENT_STEP_IDS.includes(onboarding.step.id)
                ? <AssessmentSteps step={onboarding.step} />
                : <CompletionSteps step={onboarding.step} />}
          </div>
        </section>
      </div>}
    {saveError && <p role="alert">La mise à jour du profil n’a pas pu être enregistrée.</p>}
  </main>;
}
