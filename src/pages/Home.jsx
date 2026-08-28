import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Flame,
  CalendarDays,
  TrendingUp,
} from "lucide-react";

import CoachPresence from "../components/CoachPresence";
import { dailyProgram } from "../data";

export default function Home() {
  const nav = useNavigate();

  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">COACH ANTOINE</p>
          <h1>Bonjour Antoine !</h1>
          <p className="hero-card__ready">Prêt ?</p>
          <p className="hero-card__quote">
            « Le plus difficile, c'est de commencer. »
          </p>
        </div>

        <CoachPresence size={180} />
      </section>

      <button
        className="primary-button"
        onClick={() => nav("/seances")}
      >
        <Play fill="currentColor" size={22} />
        Commencer la séance
      </button>

      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">AUJOURD'HUI</p>
            <h2>Programme du jour</h2>
          </div>

          <span className="pill">≈ 18 min</span>
        </div>

        <div className="program-list">
          {dailyProgram.map((x) => (
            <div className="program-row" key={x.label}>
              <span className="program-icon">{x.icon}</span>
              <strong>{x.label}</strong>
              <span>{x.minutes} min</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <article className="mini-card">
          <TrendingUp />
          <strong>72 %</strong>
          <span>Progression</span>
        </article>

        <article className="mini-card">
          <Flame />
          <strong>420</strong>
          <span>Calories</span>
        </article>

        <article className="mini-card">
          <CalendarDays />
          <strong>12</strong>
          <span>Séances</span>
        </article>
      </section>

      <p className="version-label">
        V8.0 Alpha — Build 004.10.2
      </p>
    </>
  );
}
