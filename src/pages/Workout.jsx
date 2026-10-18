import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import CoachAvatar from "../components/CoachAvatar";
import { workoutSteps } from "../data";
import { playRiff } from "../utils/sound";
import { HISTORY_KEY, readHistory } from "../utils/workoutHistory";
import { useUserProfile } from "../context/UserProfileContext";
import { getPersonalizedTexts } from "../utils/personalizedTexts";

const DEFAULT_REST = 15;
const MIN_REST = 10;
const MAX_REST = 30;
const REST_STEP = 5;

const fmt = (t) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60)
    .toString()
    .padStart(2, "0")}`;

function loadRestDuration() {
  const saved = Number(
    localStorage.getItem("coachAntoineRestDuration")
  );

  if (!Number.isFinite(saved) || saved === 0) {
    return DEFAULT_REST;
  }

  return Math.min(
    MAX_REST,
    Math.max(MIN_REST, saved)
  );
}

export default function Workout() {
  const { profile } = useUserProfile();
  const texts = getPersonalizedTexts(profile);
  const [dayForm, setDayForm] = useState(null);

  const [step, setStep] = useState(0);

  const [remaining, setRemaining] = useState(
    workoutSteps[0].seconds
  );

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveStatus, setSaveStatus] = useState("pending");
  const session = useRef(null);
  const finalizationStarted = useRef(false);
  const saveInProgress = useRef(false);
  const saved = useRef(false);
  const exerciseClock = useRef({ step: 0, startedAt: null, seconds: 0, total: 0 });

  const [isResting, setIsResting] = useState(false);

  const [restDuration, setRestDuration] =
    useState(loadRestDuration);

  const [restRemaining, setRestRemaining] =
    useState(restDuration);

  const [restFeedbackDone, setRestFeedbackDone] =
    useState(false);

  const controlsStarted = useRef(false);

  const cur = workoutSteps[step];

  function getCurrentTarget() {
    if (dayForm === "low") {
      return cur.targetLow;
    }

    if (dayForm === "high") {
      return cur.targetHigh;
    }

    return cur.targetNormal;
  }

  const progress = useMemo(() => {
    if (isResting) {
      return (
        ((step + 1) / workoutSteps.length) * 100
      );
    }

    return (
      ((step +
        (1 - remaining / cur.seconds)) /
        workoutSteps.length) *
      100
    );
  }, [
    step,
    remaining,
    cur.seconds,
    isResting,
  ]);

  const measureExercise = useCallback(() => {
    const clock = exerciseClock.current;
    if (clock.startedAt === null) return;
    const now = performance.now();
    const elapsed = Math.min(
      Math.max(0, (now - clock.startedAt) / 1000),
      Math.max(0, workoutSteps[clock.step].seconds - clock.seconds)
    );
    clock.seconds += elapsed;
    clock.total += elapsed;
    clock.startedAt = now;
    setRemaining(Math.max(0, Math.ceil(workoutSteps[clock.step].seconds - clock.seconds)));
  }, []);

  const saveWorkout = useCallback(() => {
    if (!session.current || saveInProgress.current || saved.current) return;
    saveInProgress.current = true;
    setSaveStatus("pending");

    try {
      const { history, error } = readHistory();
      if (error) throw new Error("Invalid history");

      if (!history.some((entry) => entry?.id === session.current.id)) {
        localStorage.setItem(
          HISTORY_KEY,
          JSON.stringify([session.current, ...history])
        );
      }

      saved.current = true;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      saveInProgress.current = false;
    }
  }, []);

  const finishWorkout = useCallback(() => {
    if (finalizationStarted.current || !session.current) return;
    finalizationStarted.current = true;
    measureExercise();
    exerciseClock.current.startedAt = null;
    setRunning(false);
    setFinished(true);

    session.current = {
      ...session.current,
      date: new Date().toISOString(),
      activeSeconds: exerciseClock.current.total,
      label: "Séance Coach Antoine",
      dayForm,
    };

    // Le son ne fait pas partie de la sauvegarde : une tentative ne le rejoue pas.
    try {
      if (localStorage.getItem("coachAntoineSound") !== "off") {
        playRiff("finish");
      }
    } catch {
      // Une erreur audio ou de préférence ne doit pas empêcher la sauvegarde.
    }
    saveWorkout();
  }, [dayForm, saveWorkout, measureExercise]);

  useEffect(() => {
    if (!running || finished || isResting || finalizationStarted.current) return;
    const clock = exerciseClock.current;
    if (clock.step !== step) {
      clock.step = step;
      clock.seconds = 0;
    }
    if (clock.startedAt === null) clock.startedAt = performance.now();
  }, [running, finished, isResting, step]);

  useEffect(() => {
    if (!running || finished) return;

    const timer = setInterval(() => {
      if (isResting) {
        setRestRemaining((value) => Math.max(0, value - 1));
      } else {
        if (!finalizationStarted.current) measureExercise();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    running,
    finished,
    isResting,
    measureExercise,
  ]);

  useEffect(() => {
    if (!running || finished || finalizationStarted.current) return;

    if (isResting) {
      if (restRemaining > 0) return;
      const nextStep = step + 1;
      setStep(nextStep);
      setRemaining(workoutSteps[nextStep].seconds);
      setIsResting(false);
      setRestRemaining(restDuration);
    } else if (remaining === 0) {
      if (step < workoutSteps.length - 1) {
        exerciseClock.current.startedAt = null;
        setIsResting(true);
        setRestRemaining(restDuration);
      } else {
        finishWorkout();
      }
    }
  }, [running, finished, isResting, restRemaining, remaining, step, restDuration, finishWorkout]);

  function chooseDayForm(choice) {
    if (!session.current) session.current = { id: crypto.randomUUID() };
    setDayForm(choice);

    localStorage.setItem(
      "coachAntoineDayForm",
      choice
    );
  }

  function next() {
    if (finalizationStarted.current) return;
    measureExercise();
    exerciseClock.current.startedAt = null;
    if (isResting) {
      const nextStep = step + 1;

      if (nextStep < workoutSteps.length) {
        setStep(nextStep);

        setRemaining(
          workoutSteps[nextStep].seconds
        );

        setIsResting(false);
      }

      return;
    }

    if (step < workoutSteps.length - 1) {
      setIsResting(true);
      setRestRemaining(restDuration);
    } else {
      finishWorkout();
    }
  }

  function reset() {
    exerciseClock.current = { step: 0, startedAt: null, seconds: 0, total: 0 };
    session.current = null;
    finalizationStarted.current = false;
    saveInProgress.current = false;
    saved.current = false;
    setSaveStatus("pending");
    setDayForm(null);

    setStep(0);

    setRemaining(
      workoutSteps[0].seconds
    );

    setRunning(false);
    setFinished(false);

    setIsResting(false);

    setRestRemaining(restDuration);

    setRestFeedbackDone(false);
  }

  function adjustRest(choice) {
    let newDuration = restDuration;

    if (choice === "short") {
      newDuration = Math.min(
        MAX_REST,
        restDuration + REST_STEP
      );
    }

    if (choice === "long") {
      newDuration = Math.max(
        MIN_REST,
        restDuration - REST_STEP
      );
    }

    setRestDuration(newDuration);

    setRestRemaining(newDuration);

    localStorage.setItem(
      "coachAntoineRestDuration",
      String(newDuration)
    );

    setRestFeedbackDone(choice);
  }

  // FORME DU JOUR

  if (!dayForm) {
    return (
      <>
        <header className="page-header">
          <p className="eyebrow">
            AVANT DE COMMENCER
          </p>

          <h1>
            {texts.dayFormQuestion}
          </h1>
        </header>

        <section className="workout-card">
          <CoachAvatar size={180} />

          <p>
            {texts.dayFormExplanation}
          </p>

          <div className="workout-actions workout-choices day-form-choices">
            <button
              className="secondary-button"
              onClick={() =>
                chooseDayForm("high")
              }
            >
              Pleine forme
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                chooseDayForm("normal")
              }
            >
              En forme
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                chooseDayForm("low")
              }
            >
              Petite forme
            </button>
          </div>

          <p className="safety-note">
            {texts.dayFormNote}
          </p>
        </section>
      </>
    );
  }

  // FIN DE SÉANCE

  if (finished && restFeedbackDone) {
    return (
      <section className="finish-card farewell-card" aria-labelledby="farewell-title">
        <CoachAvatar size={180} />
        <h1 id="farewell-title">{texts.restFeedback(restFeedbackDone, restDuration)}</h1>
        <p className="farewell-goodbye">{texts.goodbye()}</p>
        {saveStatus === "error" && <>
          <p role="alert">La séance est terminée, mais son enregistrement a échoué.</p>
          <button className="secondary-button" onClick={saveWorkout}>Réessayer l'enregistrement</button>
        </>}
        <Link className="primary-button" to="/">À BIENTÔT</Link>
      </section>
    );
  }

  if (finished) {
    return (
      <section className="finish-card">
        <CoachAvatar size={230} />

        <h1>Séance terminée !</h1>

        <p>{texts.finish(dayForm)}</p>

        <p role="status">
          {saveStatus === "pending" && "Enregistrement de la séance…"}
          {saveStatus === "saved" && "Séance enregistrée."}
          {saveStatus === "error" && "La séance est terminée, mais son enregistrement a échoué."}
        </p>
        {saveStatus === "error" && (
          <button className="secondary-button" onClick={saveWorkout}>
            Réessayer l'enregistrement
          </button>
        )}

        {(
          <>
            <h2>
              {texts.restQuestion}
            </h2>

            <p>
              Elles duraient {restDuration} secondes
              aujourd'hui.
            </p>

            <div className="workout-actions workout-choices">
              <button
                className="secondary-button"
                onClick={() =>
                  adjustRest("short")
                }
              >
                Trop courtes
              </button>

              <button
                className="secondary-button"
                onClick={() =>
                  adjustRest("perfect")
                }
              >
                Parfaites
              </button>

              <button
                className="secondary-button"
                onClick={() =>
                  adjustRest("long")
                }
              >
                Trop longues
              </button>
            </div>
          </>
        )}

        <Link className="finish-home" to="/">Accueil</Link>
      </section>
    );
  }

  // SÉANCE

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">
          SÉANCE DU JOUR
        </p>

        <h1>
          {texts.pace}
        </h1>
      </header>

      <section className="workout-card">
        <CoachAvatar size={140} />

        <div className="workout-actions">
          <button
            className="secondary-button"
            onClick={() => {
              controlsStarted.current = true;
              if (running) {
                measureExercise();
                exerciseClock.current.startedAt = null;
              }
              setRunning((value) => !value);
            }}
          >
            {running ? "Pause" : controlsStarted.current ? "Reprendre" : "Démarrer"}
          </button>

          <button
            className="secondary-button"
            onClick={next}
          >
            Suivant
          </button>
        </div>

        {isResting ? (
          <>
            <span className="pill">
              RÉCUPÉRATION
            </span>

            <h2>
              {texts.restMessage(step)}
            </h2>

            <p className="timer-label">Temps restant de la pause</p>
            <div className="timer">
              {fmt(restRemaining)}
            </div>

            <p>
              Prochain exercice :{" "}
              <strong>
                {workoutSteps[step + 1]?.name}
              </strong>
            </p>
          </>
        ) : (
          <>
            <h2>{cur.name}</h2>

            <p className="timer-label">Temps restant de l’exercice</p>
            <div className="timer">
              {fmt(remaining)}
            </div>

            <p>
              <strong>
                Objectif : {getCurrentTarget()}
              </strong>
            </p>

            <p>{profile?.addressMode === "vous" ? cur.noteVous : cur.note}</p>
          </>
        )}

        <p id="workout-progress-label" className="muted">Progression globale de la séance</p>
        <div className="progress-track" role="progressbar" aria-labelledby="workout-progress-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, progress))}>
          <div
            style={{
              width: `${Math.max(
                0,
                Math.min(100, progress)
              )}%`,
            }}
          />
        </div>
        <p className="muted">Exercice {step + 1} / {workoutSteps.length}</p>

      </section>

      <p className="safety-note">
        {texts.safety}
      </p>
    </>
  );
}
