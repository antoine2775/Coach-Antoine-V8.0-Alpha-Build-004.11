import React, { useEffect, useRef, useState } from "react";
import { resetDevelopmentData } from "../utils/developmentReset.js";
import { playCountdownPrototype } from "../utils/countdownPrototype.js";

// TEMPORAIRE : composant autonome, intégré uniquement en mode développement.
export default function DevelopmentTestZone() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const resetting = useRef(false);
  const playback = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  useEffect(() => () => {
    const current = playback.current;
    playback.current = null;
    current?.stop();
  }, []);
  const testSound = () => {
    if (playback.current) return;
    setAudioError(false);
    setPlaying(true);
    const current = playCountdownPrototype();
    playback.current = current;
    current.finished.then((success) => {
      if (playback.current !== current) return;
      playback.current = null;
      setPlaying(false);
      setAudioError(!success);
    });
  };
  const cancel = () => { if (!resetting.current) { setConfirming(false); setError(false); } };
  const reset = () => {
    if (!confirming || resetting.current) return;
    resetting.current = true;
    const result = resetDevelopmentData({ confirmed: true });
    if (result.status !== "reset") {
      resetting.current = false;
      setError(true);
      return;
    }
    setPending(true);
    // Une nouvelle page réinitialise provider, son, Coach, contrôleur de séance
    // et tous les autres états en mémoire, puis réaffiche le splash initial.
    window.location.replace(import.meta.env.BASE_URL);
  };
  return <section className="development-test-zone" aria-labelledby="development-test-title">
    <h3 id="development-test-title">ZONE DE TEST</h3>
    <button type="button" className="secondary-button full" disabled={playing || pending} onClick={testSound}>Tester vibraphone</button>
    {audioError && <p role="alert">Le son n’a pas pu être joué. Réessayez.</p>}
    {!confirming ? <button type="button" className="secondary-button full" onClick={() => setConfirming(true)}>Remettre Coach Antoine à zéro</button> :
      <div role="alertdialog" aria-labelledby="development-reset-title" aria-describedby="development-reset-description"
        onKeyDown={(event) => { if (event.key === "Escape") cancel(); }}>
        <h4 id="development-reset-title">Remettre Coach Antoine à zéro ?</h4>
        <p id="development-reset-description">Toutes les données locales de Coach Antoine seront supprimées. L’application redémarrera comme pour un nouvel utilisateur.</p>
        {error && <p role="alert">La remise à zéro n’a pas pu être effectuée. Réessayez.</p>}
        <div className="workout-actions">
          <button type="button" className="secondary-button" autoFocus disabled={pending} onClick={cancel}>Annuler</button>
          <button type="button" className="secondary-button" disabled={pending} onClick={reset}>Remettre à zéro</button>
        </div>
      </div>}
  </section>;
}
