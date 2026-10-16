export const HISTORY_KEY = "coachAntoineHistory";

export function readHistory(storage = localStorage) {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    const entries = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error("Invalid history");
    const seen = new Set();
    let error = false;
    const history = entries.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
          typeof entry.label !== "string" || typeof entry.date !== "string" ||
          !Number.isFinite(Date.parse(entry.date))) { error = true; return false; }
      if (typeof entry.id === "string" && entry.id) {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
      }
      return true;
    });
    return { history, error };
  } catch { return { history: [], error: true }; }
}

export function formatDuration(seconds) {
  const value = Math.floor(seconds);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : value ? `${rest} s` : "0 min";
}

export function getStatistics({ history, error }, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const known = (entry) => typeof entry.activeSeconds === "number" &&
    Number.isFinite(entry.activeSeconds) && entry.activeSeconds >= 0;
  const week = history.filter((entry) => {
    const date = Date.parse(entry.date);
    return date >= monday.getTime() && date <= now.getTime();
  });
  const duration = (entries) => entries.length && !entries.some(known)
    ? "Durée inconnue"
    : formatDuration(entries.reduce((sum, entry) => sum + (known(entry) ? entry.activeSeconds : 0), 0));
  return {
    cards: [
      { label: "Séances enregistrées", value: error ? "Indisponible" : history.length },
      { label: "Temps effectué", value: error ? "Indisponible" : duration(history) },
      { label: "Cette semaine", value: error ? "Indisponible" : duration(week) },
    ],
    note: error ? "Historique indisponible ou partiellement invalide. Les données ont été conservées."
      : history.some((entry) => !known(entry))
        ? "Temps mesuré depuis la mise à jour ; les anciennes durées sont inconnues. Les cumuls peuvent être partiels."
        : "Temps d’exercice chronométré, hors récupérations et suspensions.",
  };
}
