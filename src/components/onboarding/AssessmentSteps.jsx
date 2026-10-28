import React, { useState } from "react";
import { useUserProfile } from "../../context/UserProfileContext";
import { QUESTIONS } from "../../onboarding/questions";
import { ASSESSMENT_MESSAGES } from "../../onboarding/assessmentMessages";
import { EQUIPMENT_OPTIONS, LEVEL_LABELS, getAssessmentProposal, prepareAssessmentStep, toggleEquipment, hasEquipmentSelection } from "../../onboarding/assessmentSteps";
import OnboardingText from "./OnboardingText";

const Paragraphs = ({ texts }) => texts.map((text) => <p key={text}><OnboardingText>{text}</OnboardingText></p>);
const Back = ({ onClick }) => <button type="button" className="secondary-button" onClick={onClick}>Retour</button>;

function Safety({ profile, messages, submit, back }) {
  const [confirmed, setConfirmed] = useState(profile.safetyConfirmed === true);
  return <>
    <h2>Avant de commencer</h2>
    <p><OnboardingText>{messages.safety}</OnboardingText></p>
    <p><OnboardingText>{messages.safetyTransition}</OnboardingText></p>
    <Paragraphs texts={messages.confirmation} />
    <label className="onboarding-check">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>J’ai lu et je confirme</span>
    </label>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" disabled={!confirmed} onClick={() => submit("safety", confirmed)}>Continuer</button>
      <Back onClick={back} />
    </div>
  </>;
}

function Equipment({ profile, messages, submit, back }) {
  const equipment = profile.equipment;
  const chosen = hasEquipmentSelection(profile);
  return <>
    <h2><OnboardingText>{messages.equipment}</OnboardingText></h2>
    <div className="onboarding-options">
      {[{ value: "none", label: "Non, pas de matériel" }, ...EQUIPMENT_OPTIONS].map((option) =>
        <label className="onboarding-check" key={option.value}>
          <input type="checkbox" checked={option.value === "none" ? chosen && equipment.length === 0 : equipment.includes(option.value)}
            onChange={(event) => submit("equipmentDraft", toggleEquipment(equipment, option.value, event.target.checked))} />
          <span>{option.label}</span>
        </label>)}
    </div>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" disabled={!chosen} onClick={() => submit("equipment", equipment)}>Continuer</button>
      <Back onClick={back} />
    </div>
  </>;
}

function Introduction({ messages, submit, back }) {
  return <>
    <h2>Quelques questions pour commencer</h2>
    <Paragraphs texts={messages.introduction} />
    <div className="onboarding-actions">
      <button type="button" className="primary-button" onClick={() => submit("assessmentIntroduction")}>Continuer</button>
      <Back onClick={back} />
    </div>
  </>;
}

function Question({ profile, step, submit, back }) {
  const index = QUESTIONS.findIndex((question) => question.id === step.questionId);
  const question = QUESTIONS[index];
  return <>
    <p className="onboarding-secondary onboarding-progress-label">Avancée du questionnaire</p>
    <div className="onboarding-question-progress" role="progressbar" aria-label="Progression du questionnaire"
      aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={index + 1}>
      <div style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} />
    </div>
    <h2 className="onboarding-question"><OnboardingText>{profile.addressMode === "vous" ? question.textVous : question.text}</OnboardingText></h2>
    <div className="onboarding-actions">
      {question.answers.map((answer) => <button type="button" className="secondary-button" key={answer.value}
        aria-pressed={profile.assessmentAnswers[index] === answer.value}
        onClick={() => submit("answer", { questionId: question.id, value: answer.value })}>{answer.text}</button>)}
      <Back onClick={back} />
    </div>
  </>;
}

function Proposal({ profile, messages, submit, back }) {
  const [manual, setManual] = useState(false);
  const [selected, setSelected] = useState(profile.proposedLevel);
  const proposal = getAssessmentProposal(profile);
  if (!proposal) return <>
    <p role="alert"><OnboardingText>{messages.errors.assessment}</OnboardingText></p>
    <Back onClick={back} />
  </>;
  if (manual) return <>
    <h2><OnboardingText>{messages.manual}</OnboardingText></h2>
    <p className="onboarding-secondary"><OnboardingText>{messages.manualHint}</OnboardingText></p>
    <div className="onboarding-options" role="radiogroup" aria-label="Niveau de départ">
      {Object.entries(LEVEL_LABELS).map(([value, label]) => <label className="onboarding-check" key={value}>
        <input type="radio" name="selectedLevel" value={value} checked={selected === value} onChange={() => setSelected(value)} />
        <span>{label}</span>
      </label>)}
    </div>
    {selected && <p><OnboardingText>{messages.levelDescriptions[selected]}</OnboardingText></p>}
    <div className="onboarding-actions">
      <button type="button" className="primary-button" disabled={!selected} onClick={() => submit("manualLevel", selected)}>Valider mon choix</button>
      <Back onClick={() => setManual(false)} />
    </div>
  </>;
  return <div className="onboarding-proposal">
    <h2><OnboardingText>{messages.proposal(LEVEL_LABELS[proposal.proposedLevel])}</OnboardingText></h2>
    <p><OnboardingText>{messages.levelDescriptions[proposal.proposedLevel]}</OnboardingText></p>
    <Paragraphs texts={messages.proposalDetails} />
    <p><OnboardingText>{messages.levelChange[proposal.proposedLevel]}</OnboardingText></p>
    <div className="onboarding-actions">
      <button type="button" className="primary-button" onClick={() => submit("acceptCoach")}>Commencer avec ce niveau</button>
      <button type="button" className="secondary-button" onClick={() => { setSelected(proposal.proposedLevel); setManual(true); }}>Je préfère choisir mon niveau</button>
      <Back onClick={back} />
    </div>
  </div>;
}

const screens = { safety: Safety, equipment: Equipment, "assessment-introduction": Introduction, "level-proposal": Proposal };
export const ASSESSMENT_STEP_IDS = Object.freeze([...Object.keys(screens), ...QUESTIONS.map((question) => `assessment-${question.id}`)]);

export default function AssessmentSteps({ step }) {
  const { profile, updateUserProfile } = useUserProfile();
  const [error, setError] = useState(null);
  const messages = ASSESSMENT_MESSAGES[profile.addressMode === "vous" ? "vous" : "tu"];
  const submit = (action, value) => {
    const result = prepareAssessmentStep(profile, action, value);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    updateUserProfile(result.changes);
  };
  const Screen = screens[step.id] || Question;
  return <>
    <Screen profile={profile} step={step} messages={messages} submit={submit} back={() => submit("back")} />
    {error && <p role="alert"><OnboardingText>{messages.errors[error]}</OnboardingText></p>}
  </>;
}
