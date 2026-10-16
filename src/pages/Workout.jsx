import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";

import CoachAvatar from "../components/CoachAvatar";
import { workoutSteps } from "../data";
import { playRiff } from "../utils/sound";
import { HISTORY_KEY, readHistory } from "../utils/workoutHistory";

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

    setRestFeedbackDone(true);
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
            Comment tu te sens aujourd'hui ?
          </h1>
        </header>

        <section className="workout-card">
          <CoachAvatar size={180} />

          <p>
            Dis-moi simplement comment tu te sens.
            J'en tiendrai compte pour ta séance.
          </p>

          <div className="workout-actions">
            <button
              className="secondary-button"
              onClick={() =>
                chooseDayForm("low")
              }
            >
              Petite forme
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
                chooseDayForm("high")
              }
            >
              Pleine forme
            </button>
          </div>

          <p className="safety-note">
            Aujourd'hui ne définit pas ton niveau
            général. C'est simplement ta forme du jour.
          </p>
        </section>
      </>
    );
  }

  // FIN DE SÉANCE

  if (finished) {
    return (
      <section className="finish-card">
        <CoachAvatar size={230} />

        <p className="eyebrow">
          SÉANCE TERMINÉE
        </p>

        <h1>Bravo Antoine !</h1>

        <p>Tu peux être fier de toi.</p>

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

        <blockquote>
          « On n'a pas rajeuni aujourd'hui…
          mais on est en meilleure forme qu'hier ! »
        </blockquote>

        {!restFeedbackDone ? (
          <>
            <h2>
              Les pauses t'ont-elles convenu ?
            </h2>

            <p>
              Elles duraient {restDuration} secondes
              aujourd'hui.
            </p>

            <div className="workout-actions">
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
        ) : (
          <p>
            C'est enregistré. Les prochaines
            pauses dureront{" "}
            <strong>
              {restDuration} secondes
            </strong>
            .
          </p>
        )}

        <button
          className="primary-button"
          onClick={reset}
        >
          <RotateCcw size={20} />
          Nouvelle séance
        </button>
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
          On y va à ton rythme.
        </h1>
      </header>

      <section className="workout-card">
        <CoachAvatar size={140} />

        {isResting ? (
          <>
            <span className="pill">
              PAUSE
            </span>

            <h2>
              Respire tranquillement.
            </h2>

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
            <span className="pill">
              Étape {step + 1}/
              {workoutSteps.length}
            </span>

            <h2>{cur.name}</h2>

            <div className="timer">
              {fmt(remaining)}
            </div>

            <p>
              <strong>
                Objectif : {getCurrentTarget()}
              </strong>
            </p>

            <p>{cur.note}</p>
          </>
        )}

        <div className="progress-track">
          <div
            style={{
              width: `${Math.max(
                0,
                Math.min(100, progress)
              )}%`,
            }}
          />
        </div>

        <div className="workout-actions">
          <button
            className="secondary-button"
            onClick={() => {
              if (running) {
                measureExercise();
                exerciseClock.current.startedAt = null;
              }
              setRunning((value) => !value);
            }}
          >
            {running ? (
              <Pause />
            ) : (
              <Play />
            )}

            {running
              ? "Pause"
              : "Démarrer"}
          </button>

          <button
            className="secondary-button"
            onClick={next}
          >
            <SkipForward />
            Suivant
          </button>
        </div>
      </section>

      <p className="safety-note">
        Reste dans une amplitude confortable.
        Arrête l'exercice en cas de douleur ou de
        malaise.
      </p>
    </>
  );
}
