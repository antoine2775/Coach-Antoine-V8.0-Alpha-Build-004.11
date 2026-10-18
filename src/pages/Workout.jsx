import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";
import { workoutSteps } from "../data";
import { getPersonalizedTexts } from "../utils/personalizedTexts";
import { useUserProfile } from "../context/UserProfileContext";
import { useWorkoutSession } from "../workout/useWorkoutSession";
import { FEEDBACK_OPTIONS, feedbackAnswers, isFeedbackComplete } from "../workout/feedback";

const fmt = (value) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

export default function Workout() {
  const { profile } = useUserProfile();
  const texts = getPersonalizedTexts(profile);
  const { state: s, act } = useWorkoutSession();
  const cur = workoutSteps[s.step];
  const warning = s.draftError && <p role="alert">{s.draftError}</p>;

  if (s.interrupted) return <section className="workout-card">
    <CoachAvatar size={180} />
    <h1>{texts.interrupted}</h1>
    {warning}
    <button className="primary-button" onClick={() => act("resume")}>REPRENDRE LA SÉANCE</button>
    <button className="secondary-button full" onClick={() => act("abandon")}>NOUVELLE SÉANCE</button>
  </section>;

  if (!s.dayForm) return <>
    <header className="page-header">
      <p className="eyebrow">AVANT DE COMMENCER</p>
      <h1>{texts.dayFormQuestion}</h1>
    </header>
    <section className="workout-card">
      <CoachAvatar size={180} />
      <p>{texts.dayFormExplanation}</p>
      {warning}
      {s.draftError ? <button className="secondary-button" onClick={() => act("abandon")}>NOUVELLE SÉANCE</button> :
        <div className="workout-actions workout-choices day-form-choices">
          {[["high", "Pleine forme"], ["normal", "En forme"], ["low", "Petite forme"]].map(([value, label]) =>
            <button key={value} className="secondary-button" onClick={() => act("chooseDayForm", value, profile?.selectedLevel ?? null)}>{label}</button>)}
        </div>}
      <p className="safety-note">{texts.dayFormNote}</p>
    </section>
  </>;

  if (s.finished) {
    const close = s.feedbackScreen === "close";
    const labels = { pauses: "Récupération", duration: "Durée des exercices", difficulty: "Difficulté des exercices" };
    const feedbackCoach = <div className="feedback-coach"><CoachAvatar phase="finish" size={88} /></div>;
    const issues = <>
      {warning}
      {s.saveStatus === "error" && <>
        <p role="alert">La séance est terminée, mais son enregistrement a échoué.</p>
        <button className="secondary-button" onClick={() => act("save")}>Réessayer l'enregistrement</button>
      </>}
      {s.feedbackError && <p role="alert">{s.feedbackError}</p>}
      {s.feedbackError && close && <button className="secondary-button" onClick={() => act("save")}>Réessayer le suivi des avis</button>}
    </>;

    if (s.feedbackScreen === "category") return <section key="category" className="card feedback-card" aria-labelledby="feedback-categories-title">
      <div className="feedback-heading"><h1 id="feedback-categories-title">{texts.adaptationCategory}</h1>{feedbackCoach}</div>
      <p>{texts.adaptationMultiple}</p>
      {issues}
      <div className="feedback-categories">
        {Object.entries(labels).map(([category, label]) => <label className={"feedback-selection-card" + (s.feedbackCategories.includes(category) ? " is-selected" : "")} key={category}>
          <input type="checkbox" checked={s.feedbackCategories.includes(category)}
            onChange={() => act("toggleFeedbackCategory", category)} />
          <span className="feedback-selection-mark" aria-hidden="true">{s.feedbackCategories.includes(category) ? "✓" : ""}</span>
          <span>{label}</span>
        </label>)}
      </div>
      <button className="primary-button" disabled={s.feedbackCategories.length === 0}
        onClick={() => act("continueFeedback")}>CONTINUER</button>
    </section>;

    if (s.feedbackScreen === "detail") return <section key="detail" className="card feedback-card feedback-details-screen" aria-labelledby="feedback-details-title">
      <div className="feedback-heading"><h1 id="feedback-details-title">{texts.adaptationDetails}</h1>{feedbackCoach}</div>
      {issues}
      <div className="feedback-details">
        {s.feedbackCategories.map((category) => <fieldset key={category}>
          <legend>{labels[category].toLocaleUpperCase("fr-FR")}</legend>
          {FEEDBACK_OPTIONS[category].map(([value, label]) => <label className={"feedback-selection-card feedback-detail-choice" + (s.feedbackDetails[category] === value ? " is-selected" : "")} key={value}>
            <input type="radio" name={"feedback-" + category} value={value}
              checked={s.feedbackDetails[category] === value} onChange={() => act("setFeedbackDetail", category, value)} />
            <span className="feedback-selection-mark" aria-hidden="true">{s.feedbackDetails[category] === value ? "✓" : ""}</span>
            <span>{label}</span>
          </label>)}
        </fieldset>)}
      </div>
      <button className="primary-button" disabled={!isFeedbackComplete(s.feedbackCategories, s.feedbackDetails)}
        onClick={() => act("submitFeedback")}>VALIDER</button>
    </section>;

    if (s.feedbackScreen === "acknowledgement") {
      const reply = s.feedbackReply;
      const answers = feedbackAnswers(reply);
      return <section key="acknowledgement" className="card feedback-card" aria-labelledby="feedback-acknowledgement-title">
        <div className="feedback-heading"><h1 id="feedback-acknowledgement-title">{texts.feedbackAcknowledgementTitle}</h1>{feedbackCoach}</div>
        {warning}
        <div className="feedback-confirmation" role="status">
          <p>{answers.pauses ? texts.restFeedback(answers.pauses, reply.restDuration) : texts.feedbackThanks}</p>
          {answers.pauses && (answers.duration || answers.difficulty) && <p>{texts.feedbackOtherThanks}</p>}
        </div>
      </section>;
    }

    if (close) {
      return <section key="close" className="finish-card farewell-card">
        <h1>Séance terminée !</h1>
        <p>{texts.finish(s.dayForm)}</p>
        {s.reminder && <p className="early-skip-reminder" role="status">{texts.earlySkipReminder}</p>}
        {issues}

        <p className="farewell-goodbye">{texts.goodbye()}</p>
        <Link className="primary-button" to="/" onClick={() => act("abandon")}>À BIENTÔT</Link>
        <p className="farewell-caption">pour une prochaine séance.</p>
        <div className="farewell-coach"><CoachAvatar phase="finish" size={180} /></div>
      </section>;
    }

    return <section key="general" className="card feedback-card" aria-labelledby="feedback-general-title">
      <div className="feedback-heading"><h1 id="feedback-general-title">{texts.adaptationQuestion}</h1>{feedbackCoach}</div>
      {s.reminder && <p className="early-skip-reminder" role="status">{texts.earlySkipReminder}</p>}
      {issues}
      <div className="workout-actions">
        <button className="secondary-button" onClick={() => act("answer", "yes")}>OUI</button>
        <button className="secondary-button" onClick={() => act("answer", "no")}>NON</button>
      </div>
    </section>;
  }

  const resting = s.phase === "rest";
  const target = s.dayForm === "low" ? cur.targetLow : s.dayForm === "high" ? cur.targetHigh : cur.targetNormal;
  return <>
    <header className="page-header"><p className="eyebrow">SÉANCE DU JOUR</p><h1>{texts.pace}</h1></header>
    <section className="workout-card">
      <CoachAvatar size={140} />
      {warning}
      <div className="workout-actions">
        <button className="secondary-button" onClick={() => act("toggle")}>{s.running ? "Pause" : s.started ? "Reprendre" : "Démarrer"}</button>
        <button className="secondary-button" onClick={() => act("next")}>Suivant</button>
      </div>
      {resting ? <>
        <h2 className="recovery-status">RÉCUPÉRATION</h2>
        <h2>{texts.restMessage(s.step)}</h2>
        {s.reminder && <p className="early-skip-reminder" role="status">{texts.earlySkipReminder}</p>}
        <p className="timer-label">{s.countdown ? texts.getReady : "Temps restant de récupération"}</p>
        <div className={`timer${s.countdown ? " timer--countdown" : ""}`} aria-label={s.countdown ? texts.getReady : undefined}>
          {s.countdown ? s.displayedRemaining : fmt(s.displayedRemaining)}
        </div>
        <p>Prochain exercice : <strong>{workoutSteps[s.step + 1]?.name}</strong></p>
      </> : <>
        <h2>{cur.name}</h2>
        <p className="timer-label">Temps restant de l’exercice</p>
        <div className="timer">{fmt(s.displayedRemaining)}</div>
        <p><strong>Objectif : {target}</strong></p>
        <p>{profile?.addressMode === "vous" ? cur.noteVous : cur.note}</p>
      </>}
      <p id="workout-progress-label" className="muted">Progression globale de la séance</p>
      <div className="progress-track" role="progressbar" aria-labelledby="workout-progress-label"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, s.progress))}>
        <div style={{ width: `${Math.max(0, Math.min(100, s.progress))}%` }} />
      </div>
      <p className="muted">Exercice {s.step + 1} / {workoutSteps.length}</p>
    </section>
    <p className="safety-note">{texts.safety}</p>
  </>;
}
