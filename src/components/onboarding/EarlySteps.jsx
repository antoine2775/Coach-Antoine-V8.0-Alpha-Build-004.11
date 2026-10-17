import React, { useState } from "react";
import { useUserProfile } from "../../context/UserProfileContext";
import { prepareEarlyStep } from "../../onboarding/earlySteps";
import { EARLY_MESSAGES } from "../../onboarding/earlyMessages";

function Paragraphs({ texts }) {
  return texts.map((text) => <p key={text}>{text}</p>);
}

function Back({ onClick }) {
  return <button type="button" className="secondary-button" onClick={onClick}>Retour</button>;
}

function Introduction({ messages, submit, profile }) {
  return <>
    <h2>Bonjour, moi c’est Coach Antoine.</h2>
    <Paragraphs texts={messages.introduction} />
    <div className="onboarding-actions">
      <button type="button" className="primary-button" aria-pressed={profile?.addressMode === "tu"} onClick={() => submit("addressMode", "tu")}>Oui, on se tutoie</button>
      <button type="button" className="secondary-button" aria-pressed={profile?.addressMode === "vous"} onClick={() => submit("addressMode", "vous")}>Je préfère qu’on se vouvoie</button>
    </div>
  </>;
}

function Explanation({ messages, submit, back }) {
  return <>
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
    <h2>{messages.sex}</h2>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" aria-pressed={profile?.sex === "female"} onClick={() => submit("sex", "female")}>Femme</button>
      <button type="button" className="secondary-button" aria-pressed={profile?.sex === "male"} onClick={() => submit("sex", "male")}>Homme</button>
      <Back onClick={back} />
    </div>
  </>;
}

function FirstName({ messages, submit, back, profile }) {
  const [name, setName] = useState(profile?.firstName || "");
  const [greeting, setGreeting] = useState(false);
  const [error, setError] = useState(false);
  if (greeting) return <>
    <h2 role="status">{messages.greeting(profile.firstName)}</h2>
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
    <h2>{messages.firstName}</h2>
    <label className="field"><span>Prénom</span>
      <input name="firstName" autoComplete="given-name" type="text" required value={name}
        aria-invalid={error} aria-describedby={error ? "onboarding-name-error" : undefined}
        onChange={(event) => { setName(event.target.value); setError(false); }} />
    </label>
    {error && <p id="onboarding-name-error" role="alert">{messages.firstNameError}</p>}
    <div className="onboarding-actions">
      <button type="submit" className="primary-button">Continuer</button>
      <Back onClick={back} />
    </div>
  </form>;
}

function Age({ messages, submit, back, profile }) {
  const [age, setAge] = useState(profile?.age?.toString() || "");
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  if (blocked) return <>
    <div role="alert"><Paragraphs texts={messages.underage} /></div>
    <div className="onboarding-actions">
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
    <h2>{messages.age}</h2>
    <label className="field"><span>Âge en années</span>
      <input name="age" type="number" inputMode="numeric" min="1" step="1" required value={age}
        aria-invalid={error} aria-describedby={error ? "onboarding-age-error" : undefined}
        onChange={(event) => { setAge(event.target.value); setError(false); }} />
    </label>
    {error && <p id="onboarding-age-error" role="alert">{messages.ageError}</p>}
    <div className="onboarding-actions">
      <button type="submit" className="primary-button">Continuer</button>
      <Back onClick={back} />
    </div>
  </form>;
}

const screens = { introduction: Introduction, "getting-to-know": Explanation, sex: Sex, "first-name": FirstName, age: Age };
export const EARLY_STEP_IDS = Object.freeze(Object.keys(screens));

export default function EarlySteps({ step }) {
  const { profile, updateUserProfile } = useUserProfile();
  const messages = EARLY_MESSAGES[profile?.addressMode === "vous" ? "vous" : "tu"];
  const submit = (action, value) => {
    const result = prepareEarlyStep(action, value);
    if (!result.ok) return result;
    const saved = updateUserProfile(result.changes);
    return { ...result, saved: saved.status === "saved" };
  };
  const Screen = screens[step.id];
  return <Screen messages={messages} profile={profile} submit={submit} back={() => submit("back", step.index)} />;
}
