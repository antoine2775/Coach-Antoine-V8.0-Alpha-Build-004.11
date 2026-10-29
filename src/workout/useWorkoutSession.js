import { useEffect, useState } from "react";
import { playRiff } from "../utils/sound.js";
import { attachWorkoutSession, createWorkoutSession } from "./session.js";

// Accès différé : une erreur de stockage est gérée par le contrôleur.
const browserStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export function useWorkoutSession() {
  const [session] = useState(() => createWorkoutSession({ storage: browserStorage, sound: playRiff }));
  const [, refresh] = useState(0);
  useEffect(() => attachWorkoutSession(session, {
    document, window,
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  }, () => refresh((value) => value + 1)), [session]);

  const act = (action, ...args) => {
    const result = session[action](...args);
    refresh((value) => value + 1);
    return result;
  };
  return { state: session.getState(), act };
}
