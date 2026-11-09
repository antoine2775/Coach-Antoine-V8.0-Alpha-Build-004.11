import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../../context/UserProfileContext";
import { COMPLETION_MESSAGES } from "../../onboarding/completionMessages";
import { getStopReasonLabel } from "../../utils/personalizedTexts";
import OnboardingText from "./OnboardingText";
import OnboardingAudio from "./OnboardingAudio";
import { sequenceInscription } from "../../audio/voixInscription";
import { EXPERIENCE_OPTIONS, STOP_REASON_OPTIONS, CURRENT_PROGRAM_MISSING_OPTIONS, getCompletionStage, canCompleteOnboarding, prepareCompletionStep } from "../../onboarding/completionSteps";

export default function CompletionSteps({ step }) {
  const { profile, updateUserProfile, openSplash } = useUserProfile();
  const navigate = useNavigate();
  const finishing = useRef(false);
  const [error, setError] = useState(false);
  const messages = COMPLETION_MESSAGES[profile.addressMode === "vous" ? "vous" : "tu"];
  const stage = getCompletionStage(profile);
  const current = profile.previousProgramExperience === "current";
  // Les sous-écrans changent aussi sans changement d'identifiant principal.
  const audioScreen = step.id === "previous-experience"
    ? `completion-${stage === "transition" ? "transition" : "experience"}`
    : step.id === "stop-reason"
      ? `completion-${stage === "reaction" ? "reaction" : current ? "current" : "stopped"}`
      : step.id === "finish" && canCompleteOnboarding(profile) ? "finish" : "incomplete";
  const submit = (action, value) => {
    if (finishing.current) return;
    const result = prepareCompletionStep(profile, action, value);
    if (!result.ok) { setError(true); return; }
    if (action === "finish") finishing.current = true;
    const saved = updateUserProfile(result.changes, result.destination);
    if (saved.status !== "saved") { finishing.current = false; setError(true); return; }
    setError(false);
    if (action === "finish" && value === "later") openSplash?.();
    if (result.destination) navigate(result.destination, { replace: true });
  };
  const back = <button type="button" className="secondary-button" onClick={() => submit("back")}>Retour</button>;
  return <>
    <OnboardingAudio key={audioScreen} sources={sequenceInscription(audioScreen, profile.addressMode)} />
    {step.id === "previous-experience" && (stage === "transition" ? <>
      {messages.transition.map((text, index) => index === 0 ? <h2 key={text}><OnboardingText>{text}</OnboardingText></h2> : <p key={text}><OnboardingText>{text}</OnboardingText></p>)}
      <div className="onboarding-actions">
        <button type="button" className="primary-button" onClick={() => submit("transition")}>Continuer</button>
        {back}
      </div>
    </> : <>
      <h2><OnboardingText>{messages.experience}</OnboardingText></h2>
      <div className="onboarding-actions">
        {EXPERIENCE_OPTIONS.map((option) => <button type="button" className="secondary-button" key={option.value}
          aria-pressed={profile.previousProgramExperience === option.value}
          onClick={() => submit("experience", option.value)}>{option.label}</button>)}
        {back}
      </div>
    </>)}
    {step.id === "stop-reason" && (stage === "reaction" ? <>
      <p><OnboardingText>{messages.reaction}</OnboardingText></p>
      <div className="onboarding-actions">
        <button type="button" className="primary-button" onClick={() => submit("continue")}>Continuer</button>
        {back}
      </div>
    </> : <>
      <h2><OnboardingText>{current ? messages.currentQuestion : messages.reason}</OnboardingText></h2>
      <div className="onboarding-actions">
        {(current ? CURRENT_PROGRAM_MISSING_OPTIONS : STOP_REASON_OPTIONS).map((option) => <button type="button" className="secondary-button" key={option.value}
          aria-pressed={(current ? profile.currentProgramMissing : profile.previousProgramStopReason) === option.value}
          onClick={() => submit("answer", option.value)}>{current ? option.label : getStopReasonLabel(option, profile)}</button>)}
        {back}
      </div>
    </>)}
    {step.id === "finish" && <>
      {canCompleteOnboarding(profile) ? <>
        {messages.conclusion(profile.firstName).map((text, index) => index === 0
          ? <h2 key={text}><OnboardingText>{text}</OnboardingText></h2> : <p key={text}><OnboardingText>{text}</OnboardingText></p>)}
        <div className="onboarding-actions">
          <button type="button" className="primary-button" onClick={() => submit("finish", "now")}>Oui, c’est parti !</button>
          <button type="button" className="secondary-button" onClick={() => submit("finish", "later")}>Pas maintenant</button>
          {back}
        </div>
      </> : <>
        <p role="alert"><OnboardingText>{messages.incomplete}</OnboardingText></p>
        <div className="onboarding-actions">{back}</div>
      </>}
    </>}
    {error && <p role="alert">Cette étape n’a pas pu être enregistrée. Le profil n’a pas été finalisé.</p>}
  </>;
}
