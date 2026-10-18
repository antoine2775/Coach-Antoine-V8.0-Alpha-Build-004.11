import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../../context/UserProfileContext";
import { COMPLETION_MESSAGES } from "../../onboarding/completionMessages";
import { getStopReasonLabel } from "../../utils/personalizedTexts";
import { EXPERIENCE_OPTIONS, STOP_REASON_OPTIONS, canCompleteOnboarding, prepareCompletionStep } from "../../onboarding/completionSteps";

export default function CompletionSteps({ step }) {
  const { profile, updateUserProfile } = useUserProfile();
  const navigate = useNavigate();
  const finishing = useRef(false);
  const [error, setError] = useState(false);
  const [reasonReaction, setReasonReaction] = useState(null);
  const messages = COMPLETION_MESSAGES[profile.addressMode === "vous" ? "vous" : "tu"];
  const submit = (action, value) => {
    if (finishing.current) return;
    const result = prepareCompletionStep(profile, action, value);
    if (!result.ok) { setError(true); return; }
    if (action === "finish") finishing.current = true;
    const saved = updateUserProfile(result.changes);
    if (saved.status !== "saved") { finishing.current = false; setError(true); return; }
    setError(false);
    if (action === "reasonDraft") setReasonReaction(value);
    if (result.destination) navigate(result.destination, { replace: true });
  };
  const back = <button type="button" className="secondary-button" onClick={() => submit("back")}>Retour</button>;
  return <>
    {step.id === "previous-experience" && <>
      <h2>{messages.experience}</h2>
      <div className="onboarding-actions">
        {EXPERIENCE_OPTIONS.map((option) => <button type="button" className="secondary-button" key={option.value}
          aria-pressed={profile.previousProgramExperience === option.value}
          onClick={() => submit("experience", option.value)}>{option.label}</button>)}
        {back}
      </div>
    </>}
    {step.id === "stop-reason" && <>
      {reasonReaction ? <>
        <p>{reasonReaction === "preferNotToSay" ? messages.reasonDeclined : messages.reasonThanks}</p>
        <div className="onboarding-actions">
          <button type="button" className="primary-button" onClick={() => submit("reason", profile.previousProgramStopReason)}>Continuer</button>
          <button type="button" className="secondary-button" onClick={() => setReasonReaction(null)}>Retour</button>
        </div>
      </> : <>
      <h2>{messages.reason[0]}</h2>
      <p>{messages.reason[1]}</p>
      <div className="onboarding-actions">
        {STOP_REASON_OPTIONS.map((option) => <button type="button" className="secondary-button" key={option.value}
          aria-pressed={profile.previousProgramStopReason === option.value}
          onClick={() => submit("reasonDraft", option.value)}>{getStopReasonLabel(option, profile)}</button>)}
        <button type="button" className="secondary-button" onClick={() => submit("reason", null)}>Passer cette question</button>
        {back}
      </div>
      </>}
    </>}
    {step.id === "finish" && <>
      {canCompleteOnboarding(profile) ? <>
        {messages.conclusion(profile.firstName).map((text, index) => index === 0
          ? <h2 key={text}>{text}</h2> : <p key={text}>{text}</p>)}
        <div className="onboarding-actions">
          <button type="button" className="primary-button" onClick={() => submit("finish", "now")}>Oui, c’est parti !</button>
          <button type="button" className="secondary-button" onClick={() => submit("finish", "later")}>Pas maintenant</button>
          {back}
        </div>
      </> : <>
        <p role="alert">{messages.incomplete}</p>
        <div className="onboarding-actions">{back}</div>
      </>}
    </>}
    {error && <p role="alert">Cette étape n’a pas pu être enregistrée. Le profil n’a pas été finalisé.</p>}
  </>;
}
