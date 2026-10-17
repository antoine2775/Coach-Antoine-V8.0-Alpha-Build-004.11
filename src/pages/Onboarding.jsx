import React from "react";
import { useUserProfile } from "../context/UserProfileContext";
import { ONBOARDING_STEPS } from "../onboarding/steps";
import CoachAvatar from "../components/CoachAvatar";
import EarlySteps, { EARLY_STEP_IDS } from "../components/onboarding/EarlySteps";
import AssessmentSteps, { ASSESSMENT_STEP_IDS } from "../components/onboarding/AssessmentSteps";
import { prepareAssessmentStep } from "../onboarding/assessmentSteps";

const errors = {
  invalid: "Le profil enregistré est invalide ou illisible. Il n’a pas été remplacé.",
  "unsupported-version": "Cette version du profil n’est pas prise en charge. Les données ont été conservées.",
  unavailable: "Le stockage du profil est indisponible. L’accès à l’application nécessite sa lecture.",
  "invalid-step": "L’étape enregistrée n’est pas reconnue. Le profil et les réponses ont été conservés.",
};

// L'expérience et les étapes suivantes restent des conteneurs, sans avancée.
function PendingStep({ step, profile, updateUserProfile }) {
  return <>
    <p className="eyebrow">Étape {step.index + 1} sur {ONBOARDING_STEPS.length}</p>
    <h2 id="onboarding-step-title">{step.title}</h2>
    <p>Le parcours initial est en cours de préparation.</p>
    {step.id === "previous-experience" && <button type="button" className="secondary-button" onClick={() => {
      updateUserProfile(prepareAssessmentStep(profile, "back").changes);
    }}>Retour</button>}
  </>;
}

export default function Onboarding() {
  const { onboarding, profile, saveError, reloadProfile, updateUserProfile } = useUserProfile();
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
                : <PendingStep step={onboarding.step} profile={profile} updateUserProfile={updateUserProfile} />}
          </div>
        </section>
      </div>}
    {saveError && <p role="alert">La mise à jour du profil n’a pas pu être enregistrée.</p>}
  </main>;
}
