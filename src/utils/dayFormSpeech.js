// Lecture ponctuelle du choix de forme, sans modifier les sons de la séance.
export function speakDayFormReply(text, onComplete, environment = window) {
  let utterance, settled = false, disposed = false;
  let startTimer, endTimer, transitionTimer;
  const clearWatchdogs = () => {
    environment.clearTimeout(startTimer);
    environment.clearTimeout(endTimer);
  };
  const detach = () => {
    if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
  };
  const stop = () => {
    try { if (utterance) environment.speechSynthesis?.cancel(); } catch { /* Audio indisponible. */ }
  };
  const finish = (failed = false) => {
    if (settled || disposed) return;
    settled = true;
    clearWatchdogs();
    detach();
    if (failed) stop();
    transitionTimer = environment.setTimeout(() => {
      if (!disposed) onComplete();
    }, 800);
  };
  // Aucun événement de début : sortie garantie après 3 s, puis la pause.
  startTimer = environment.setTimeout(() => finish(true), 3000);
  // Même si onstart/onend sont perdus, la page ne reste jamais bloquée.
  endTimer = environment.setTimeout(() => finish(true), 20000);
  try {
    if (!environment.speechSynthesis || !environment.SpeechSynthesisUtterance) {
      // Laisser le temps de lire le texte si la voix est indisponible.
    } else {
      utterance = new environment.SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.onstart = () => environment.clearTimeout(startTimer);
      utterance.onend = () => finish();
      utterance.onerror = () => finish(true);
      environment.speechSynthesis.speak(utterance);
    }
  } catch { finish(true); }
  return () => {
    disposed = true;
    clearWatchdogs();
    environment.clearTimeout(transitionTimer);
    detach();
    if (!settled) stop();
  };
}
