import React, { useState } from "react";
import { CalendarCheck, Clock, Timer } from "lucide-react";
import { getStatistics, readHistory } from "../utils/workoutHistory";
import { getLevelHistory } from "../utils/levelHistory";
import { DAY_FORM_LABELS, getRecentForms, levelLabel, sessionCountLabel } from "../utils/progression";
import { useUserProfile } from "../context/UserProfileContext";
import { getPersonalizedTexts } from "../utils/personalizedTexts";

export default function Progress() {
  const { profile } = useUserProfile();
  const texts = getPersonalizedTexts(profile);
  const [showAllLevels, setShowAllLevels] = useState(false);
  const result = readHistory();
  const statistics = getStatistics(result);
  const icons = [CalendarCheck, Timer, Clock];
  const periods = getLevelHistory(profile);
  const levels = periods.filter((entry) => typeof entry.startedAt === "string" && Number.isFinite(Date.parse(entry.startedAt)))
    .reverse().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const visibleLevels = showAllLevels ? levels : levels.slice(0, 3);
  const forms = getRecentForms(result.history);
  const visibleForms = Object.entries(DAY_FORM_LABELS).filter(([value]) => forms.counts[value] > 0);
  return <>
    <header className="page-header"><p className="eyebrow">{texts.journey}</p><h1>Progression</h1><p>Chaque séance compte.</p></header>
    <section className="stats-grid">
      {statistics.cards.map(({ label, value }, index) => {
        const Icon = icons[index];
        return <article className="mini-card" key={label}><Icon /><strong>{value}</strong><span>{label}</span></article>;
      })}
    </section>
    <p className="muted">{statistics.note}</p>
    {(levels.length > 0 || visibleForms.length > 0) && <section className="card progression-summary">
      {levels.length > 0 && <div aria-labelledby="level-history-title">
        <h2 id="level-history-title">{texts.levelHistoryTitle}</h2>
        <ol id="level-history-list" className="level-history">
          {visibleLevels.map((entry, index) => <li key={index}>
            <span>{levelLabel(entry.level)} — depuis le <time dateTime={entry.startedAt}>{new Date(entry.startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</time></span>
            {entry === periods.at(-1) && entry.level === profile?.selectedLevel && <small className="muted">Niveau actuel</small>}
          </li>)}
        </ol>
        {levels.length > 3 && <button type="button" className="secondary-button" aria-controls="level-history-list"
          aria-expanded={showAllLevels} onClick={() => setShowAllLevels(!showAllLevels)}>
          {showAllLevels ? texts.levelHistoryCollapse : texts.levelHistoryExpand}
        </button>}
      </div>}
      {visibleForms.length > 0 && <div className="progression-forms" aria-labelledby="recent-forms-title">
        <h2 id="recent-forms-title">{texts.recentFormsTitle}</h2>
        <ul className="recent-forms">
          {visibleForms.map(([value, label]) => <li key={value}>{label} : {sessionCountLabel(forms.counts[value])}</li>)}
        </ul>
        {forms.unknown > 0 && <p className="muted">Les séances dont la forme n’est pas renseignée ne sont pas comptées dans cette répartition.</p>}
      </div>}
    </section>}
  </>;
}
