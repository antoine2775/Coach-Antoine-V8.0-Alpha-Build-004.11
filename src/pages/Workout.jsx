import React, { useEffect, useMemo, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";

import CoachAvatar from "../components/CoachAvatar";
import { workoutSteps } from "../data";
import { playRiff } from "../utils/sound";

const DEFAULT_REST = 15;
const MIN_REST = 10;
const MAX_REST = 30;
const REST_STEP = 5;

const fmt = (t) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;

function loadRestDuration() {
  const saved = Number(
    localStorage.getItem("coachAntoineRestDuration")
  );

  if (!Number.isFinite(saved) || saved === 0) {
    return DEFAULT_REST;
  }

  return Math.min(MAX_REST, Math.max(MIN_REST, saved));
}

export default function Workout() {
  const [step, setStep] = useState(0);
  const [remaining, setRemaining] = useState(
    workoutSteps[0].seconds
  );
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const [isResting, setIsResting] = useState(false);
  const [restDuration, setRestDuration] =
    useState(loadRestDuration);
  const [restRemaining, setRestRemaining] =
    useState(restDuration);

  const [restFeedbackDone, setRestFeedbackDone] =
    useState(false);

  const cur = workoutSteps[step];

  const progress = useMemo(() => {
    if (isResting) {
      return ((step + 1) / workoutSteps.length) * 100;
    }

    return (
      ((step + (1 - remaining / cur.seconds)) /
        workoutSteps.length) *
      100
    );
  }, [step, remaining, cur.seconds, isResting]);

  useEffect(() => {
    if (!running || finished) return;

    const timer = setInterval(() => {
      if (isResting) {
        setRestRemaining((value) => {
          if (value > 1) {
            return value - 1;
          }

          const nextStep = step + 1;

          setStep(nextStep);
          setRemaining(workoutSteps[nextStep].seconds);
          setIsResting(false);

          return restDuration;
        });

        return;
      }

      setRemaining((value) => {
        if (value > 1) {
          return value - 1;
        }

        if (step < workoutSteps.length - 1) {
          setIsResting(true);
          setRestRemaining(restDuration);
          return 0;
        }

        finishWorkout();
        return 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    running,
    finished,
    step,
    isResting,
    restDuration,
  ]);

  function finishWorkout() {
    setRunning(false);
    setFinished(true);

    playRiff("finish");

    const old = JSON.parse(
      localStorage.getItem("coachAntoineHistory") || "[]"
    );

    localStorage.setItem(
      "coachAntoineHistory",
      JSON.stringify(
        [
          {
            date: new Date().toISOString(),
            minutes: 5,
            label: "Séance découverte",
          },
          ...old,
        ].slice(0, 20)
      )
    );
  }

  function next() {
    if (isResting) {
      const nextStep = step + 1;

      if (nextStep < workoutSteps.length) {
        setStep(nextStep);
        setRemaining(workoutSteps[nextStep].seconds);
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
    setStep(0);
    setRemaining(workoutSteps[0].seconds);
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

  if (finished) {
    return (
      <section className="finish-card">
        <CoachAvatar size={230} />

        <p className="eyebrow">SÉANCE TERMINÉE</p>

        <h1>Bravo Antoine !</h1>

        <p>Tu peux être fier de toi.</p>

        <blockquote>
          « On n'a pas rajeuni aujourd'hui… mais on est en
          meilleure forme qu'hier ! »
        </blockquote>

        {!restFeedbackDone ? (
          <>
            <h2>Les pauses t'ont-elles convenu ?</h2>

            <p>
              Elles duraient {restDuration} secondes aujourd'hui.
            </p>

            <div className="workout-actions">
              <button
                className="secondary-button"
                onClick={() => adjustRest("short")}
              >
                Trop courtes
              </button>

              <button
                className="secondary-button"
                onClick={() => adjustRest("perfect")}
              >
                Parfaites
              </button>

              <button
                className="secondary-button"
                onClick={() => adjustRest("long")}
              >
                Trop longues
              </button>
            </div>
          </>
        ) : (
          <p>
            C'est enregistré. Les prochaines pauses dureront{" "}
            <strong>{restDuration} secondes</strong>.
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

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">SÉANCE DU JOUR</p>
        <h1>On y va à ton rythme.</h1>
      </header>

      <section className="workout-card">
        <CoachAvatar size={140} />

        {isResting ? (
          <>
            <span className="pill">PAUSE</span>

            <h2>Respire tranquillement.</h2>

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
              Étape {step + 1}/{workoutSteps.length}
            </span>

            <h2>{cur.name}</h2>

            <div className="timer">
              {fmt(remaining)}
            </div>

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
            onClick={() => setRunning((v) => !v)}
          >
            {running ? <Pause /> : <Play />}
            {running ? "Pause" : "Démarrer"}
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
        Reste dans une amplitude confortable. Arrête
        l'exercice en cas de douleur ou de malaise.
      </p>
    </>
  );
}