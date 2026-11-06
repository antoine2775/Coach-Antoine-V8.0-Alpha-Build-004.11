import React, { useState } from "react";
import { useUserProfile } from "../../context/UserProfileContext";
import { prepareEarlyStep } from "../../onboarding/earlySteps";
import { EARLY_MESSAGES } from "../../onboarding/earlyMessages";
import OnboardingText from "./OnboardingText";
import OnboardingAudio from "./OnboardingAudio";
import { sequenceInscription, PAUSE_ENTRE_PARAGRAPHES_MS } from "../../audio/voixInscription";

function Paragraphs({ texts }) {
  return texts.map((text) => <p key={text}><OnboardingText>{text}</OnboardingText></p>);
}

function Back({ onClick }) {
  return <button type="button" className="secondary-button" onClick={onClick}>Retour</button>;
}

function playIntroductionAudio(audio) {
  if (!audio) return;
  audio.src = `${import.meta.env.BASE_URL}audio/intro-coach-antoine.mp3`;
  try {
    Promise.resolve(audio.play()).catch(() => { /* La lecture automatique peut être bloquée par le navigateur. */ });
  } catch { /* Un échec audio ne bloque pas l’introduction. */ }
  // React 19 appelle ce nettoyage dès que l’élément quitte l’écran.
  return () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };
}

function Introduction({ submit, profile }) {
  return <>
    <audio ref={playIntroductionAudio} />
    <h2>Bonjour, moi c’est Coach Antoine.</h2>
    <Paragraphs texts={EARLY_MESSAGES.tu.introduction} />
    <div className="onboarding-actions">
      <button type="button" className="primary-button" aria-pressed={profile?.addressMode === "tu"} onClick={() => submit("addressMode", "tu")}>Oui, on se tutoie</button>
      <button type="button" className="secondary-button" aria-pressed={profile?.addressMode === "vous"} onClick={() => submit("addressMode", "vous")}>Je préfère qu’on se vouvoie</button>
    </div>
  </>;
}

function Explanation({ messages, submit, back, profile }) {
  return <>
    <OnboardingAudio sources={sequenceInscription('getting-to-know', profile?.addressMode)} pauseMs={PAUSE_ENTRE_PARAGRAPHES_MS} />
    <h2>Une séance adaptée</h2>
    <Paragraphs texts={messages.explanation} />
    <div className="onboarding-actions">
      <button type="button" className="primary-button" onClick={() => submit("explanation")}>Continuer</button>
      <Back onClick={back} />
    </div>
  </>;
}

function Sex({ messages, submit, back, profile }) {
  return <>
    <OnboardingAudio sources={sequenceInscription('sex', profile?.addressMode)} />
    <h2><OnboardingText>{messages.sex}</OnboardingText></h2>
    <div className="onboarding-actions">
      <button type="button" className="secondary-button onboarding-sex-choice" aria-pressed={profile?.sex === "female"} onClick={() => submit("sex", "female")}>Une femme</button>
      <button type="button" className="secondary-button onboarding-sex-choice" aria-pressed={profile?.sex === "male"} onClick={() => submit("sex", "male")}>Un homme</button>
      <Back onClick={back} />
    </div>
  </>;
}

function FirstName({ messages, submit, back, profile }) {
  const [name, setName] = useState(profile?.firstName || "");
  const [greeting, setGreeting] = useState(false);
  const [error, setError] = useState(false);
  if (greeting) return <>
    <h2 role="status"><OnboardingText>{messages.greeting(profile.firstName)}</OnboardingText></h2>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" onClick={() => submit("confirmFirstName")}>Continuer</button>
      <Back onClick={() => setGreeting(false)} />
    </div>
  </>;
  return <form noValidate onSubmit={(event) => {
    event.preventDefault();
    const result = submit("firstName", name);
    setError(!result.ok);
    if (result.saved) setGreeting(true);
  }}>
    <OnboardingAudio sources={sequenceInscription('first-name', profile?.addressMode)} />
    <h2><OnboardingText>{messages.firstName}</OnboardingText></h2>
    <label className="field"><span>Prénom</span>
      <input name="firstName" autoComplete="given-name" type="text" required value={name}
        aria-invalid={error} aria-describedby={error ? "onboarding-name-error" : undefined}
        onChange={(event) => { setName(event.target.value); setError(false); }} />
    </label>
    {error && <p id="onboarding-name-error" role="alert"><OnboardingText>{messages.firstNameError}</OnboardingText></p>}
    <div className="onboarding-actions">
      <button type="submit" className="primary-button">Continuer</button>
      <Back onClick={back} />
    </div>
  </form>;
}

function Age({ messages, submit, back, profile, restartOnboarding }) {
  const [age, setAge] = useState(profile?.age?.toString() || "");
  const validAge = /^\d+$/.test(age.trim()) && Number.isSafeInteger(Number(age)) && Number(age) > 0;
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  if (blocked) return <>
    <OnboardingAudio sources={sequenceInscription('underage', profile?.addressMode)} />
    <div role="alert"><Paragraphs texts={messages.underage} /></div>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" onClick={restartOnboarding}>Recommencer pour une autre personne</button>
      <button type="button" className="secondary-button" onClick={() => { setAge(""); setBlocked(false); }}>Corriger l’âge</button>
      <Back onClick={back} />
    </div>
  </>;
  return <form noValidate onSubmit={(event) => {
    event.preventDefault();
    const result = submit("age", age);
    setError(!result.ok);
    if (result.blocked) { setAge(""); setBlocked(true); }
  }}>
    <OnboardingAudio sources={sequenceInscription('age', profile?.addressMode)} />
    <h2><OnboardingText>{messages.age}</OnboardingText></h2>
    <label className="field"><span>Âge en années</span>
      <input name="age" type="number" inputMode="numeric" min="1" step="1" required value={age}
        aria-invalid={error} aria-describedby={error ? "onboarding-age-error" : undefined}
        onChange={(event) => { setAge(event.target.value); setError(false); }} />
    </label>
    {error && <p id="onboarding-age-error" role="alert"><OnboardingText>{messages.ageError}</OnboardingText></p>}
    <div className="onboarding-actions">
      <button type="submit" className="primary-button" disabled={!validAge}>Continuer</button>
      <Back onClick={back} />
    </div>
  </form>;
}

const screens = { introduction: Introduction, "getting-to-know": Explanation, sex: Sex, "first-name": FirstName, age: Age };
export const EARLY_STEP_IDS = Object.freeze(Object.keys(screens));

export default function EarlySteps({ step }) {
  const { profile, updateUserProfile, restartOnboarding } = useUserProfile();
  const messages = EARLY_MESSAGES[profile?.addressMode === "vous" ? "vous" : "tu"];
  const submit = (action, value) => {
    const result = prepareEarlyStep(action, value);
    if (!result.ok) return result;
    const saved = updateUserProfile(result.changes);
    return { ...result, saved: saved.status === "saved" };
  };
  const Screen = screens[step.id];
  return <Screen messages={messages} profile={profile} submit={submit} restartOnboarding={restartOnboarding} back={() => submit("back", step.index)} />;
}
