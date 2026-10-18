import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Timer,
  CalendarDays,
  Clock,
} from "lucide-react";

import CoachPresence from "../components/CoachPresence";
import { getStatistics, readHistory } from "../utils/workoutHistory";
import { useUserProfile } from "../context/UserProfileContext";
import { getPersonalizedTexts } from "../utils/personalizedTexts";

const programBlocks = [
  { label: "Mise en mouvement", icon: "🧍", description: "Préparer progressivement le corps." },
  { label: "Renforcement musculaire", icon: "💪", description: "Entretenir force et tonus." },
  { label: "Équilibre & coordination", icon: "⚖️", description: "Travailler stabilité et contrôle." },
  { label: "Mobilité, posture & souplesse", icon: "🙆", description: "Conserver de l’aisance et terminer en douceur." },
];

export default function Home() {
  const { profile } = useUserProfile();
  const texts = getPersonalizedTexts(profile);
  const nav = useNavigate();
  const statistics = getStatistics(readHistory());
  const statIcons = [CalendarDays, Timer, Clock];

  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">COACH ANTOINE</p>
          <h1>{texts.welcome}</h1>
          <p className="hero-card__ready">{texts.ready}</p>
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
        <div className="section-title" style={{ flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">AUJOURD'HUI</p>
            <h2>Programme du jour</h2>
          </div>

        </div>
        <p className="muted" style={{ color: "#243B53", fontSize: "16px" }}>{texts.program}</p>

        <div className="program-list">
          {programBlocks.map((x) => (
            <div className="program-row" key={x.label} style={{ gridTemplateColumns: "42px minmax(0, 1fr)" }}>
              <span className="program-icon">{x.icon}</span>
              <div>
                <strong>{x.label}</strong>
                <p className="muted" style={{ margin: "4px 0 0", color: "#243B53", fontSize: "16px" }}>{x.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        {statistics.cards.map(({ label, value }, index) => {
          const Icon = statIcons[index];
          return <article className="mini-card" key={label}>
            <Icon /><strong>{value}</strong><span>{label}</span>
          </article>;
        })}
      </section>
    </>
  );
}
