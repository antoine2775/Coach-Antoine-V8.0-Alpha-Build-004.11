import React, { useState } from "react";
import { CalendarCheck, Clock, Timer } from "lucide-react";
import { getStatistics, readHistory } from "../utils/workoutHistory";
import { useUserProfile } from "../context/UserProfileContext";
import { getPersonalizedTexts } from "../utils/personalizedTexts";

export default function Progress() {
  const { profile } = useUserProfile();
  const texts = getPersonalizedTexts(profile);
  const [weight, setWeight] = useState(() => {
    try { return localStorage.getItem("coachAntoineWeight") || ""; }
    catch { return ""; }
  });
  const [weightError, setWeightError] = useState(false);
  const result = readHistory();
  const statistics = getStatistics(result);
  const icons = [CalendarCheck, Timer, Clock];
  const recent = [...result.history].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20);
  const validWeight = weight !== "" && Number.isFinite(Number(weight)) && Number(weight) >= 30 && Number(weight) <= 250;
  function saveWeight(value) {
    setWeight(value);
    try {
      if (value === "") localStorage.removeItem("coachAntoineWeight");
      else if (Number(value) >= 30 && Number(value) <= 250) localStorage.setItem("coachAntoineWeight", value);
      setWeightError(false);
    } catch { setWeightError(true); }
  }
  return <>
    <header className="page-header"><p className="eyebrow">{texts.journey}</p><h1>Progression</h1><p>Chaque séance compte.</p></header>
    <section className="stats-grid">
      {statistics.cards.map(({ label, value }, index) => {
        const Icon = icons[index];
        return <article className="mini-card" key={label}><Icon /><strong>{value}</strong><span>{label}</span></article>;
      })}
    </section>
    <p className="muted">{statistics.note}</p>
    <section className="card">
      <h2>Mon poids</h2><p>{validWeight ? weight + " kg" : "Non renseigné"}</p>
      <label className="field"><span>Poids actuel en kilogrammes</span><input type="number" min="30" max="250" step="0.1" value={weight} onChange={(event) => saveWeight(event.target.value)} /></label>
      <p className="muted">{weightError ? "L’enregistrement du poids a échoué." : "La valeur est enregistrée sur cet appareil."}</p>
    </section>
    <section className="card"><h2>Historique récent</h2>
      {result.error && <p role="status">L’historique ne peut pas être affiché intégralement. Les données ont été conservées.</p>}
      {!result.error && recent.length === 0 && <p className="muted">{texts.emptyHistory}</p>}
      {recent.map((entry, index) => <div className="history-row" key={entry.id || index}><strong>{entry.label}</strong><span>{new Date(entry.date).toLocaleDateString("fr-FR")}</span></div>)}
    </section>
  </>;
}
