import { VIBRAPHONE, scheduleVibraphoneNote } from "./vibraphone.js";

export const COUNTDOWN_PROTOTYPE = VIBRAPHONE;

export function playCountdownPrototype(audioWindow = window) {
  let context;
  let settled = false;
  let resolveFinished;
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  const finish = (success) => {
    if (settled) return;
    settled = true;
    if (context) {
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Déjà fermé. */ }
    }
    resolveFinished(success);
  };
  try {
    const AudioContext = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    context = new AudioContext();
    // Création et réveil déclenchés directement par l'appui, notamment sur iOS.
    const ready = context.state === "running" ? Promise.resolve() : context.resume();
    Promise.resolve(ready).then(() => {
      if (settled) return;
      const firstStart = context.currentTime + 0.03;
      for (let note = 0; note < 3; note++) {
        const start = firstStart + note;
        scheduleVibraphoneNote(context, start, note === 2 ? () => finish(true) : undefined);
      }
    }).catch(() => finish(false));
  } catch {
    finish(false);
  }
  return { finished, stop: () => finish(false) };
}
