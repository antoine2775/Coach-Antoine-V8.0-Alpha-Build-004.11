import React, { useEffect, useRef, useState } from "react";
import CoachAvatar from "./CoachAvatar";

function stopIntroMusic(audio) {
  if (!audio || !audio.hasAttribute("src")) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export default function SplashScreen({ onDone }) {
  const [glasses, setGlasses] = useState("eyes");
  const [line, setLine] = useState(0);
  const introMusic = useRef(null);
  const silenceTimer = useRef(null);
  const playback = useRef({ started: false, finished: false, active: true });
  const [musicStarted, setMusicStarted] = useState(false);

  const finishMusic = () => {
    const current = playback.current;
    if (!current.active || !current.started || current.finished || silenceTimer.current !== null) return;
    current.finished = true;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    stopIntroMusic(introMusic.current);
    onDone();
  };

  const endMusic = () => {
    const current = playback.current;
    if (!current.active || !current.started || current.finished || silenceTimer.current !== null) return;
    stopIntroMusic(introMusic.current);
    silenceTimer.current = setTimeout(() => {
      silenceTimer.current = null;
      finishMusic();
    }, 1500);
  };

  const startMusic = () => {
    const current = playback.current;
    if (!current.active || current.started || current.finished) return;
    current.started = true;
    setMusicStarted(true);
    const audio = introMusic.current;
    audio.src = `${import.meta.env.BASE_URL}audio/intro.mp3`;
    try {
      Promise.resolve(audio.play()).catch(finishMusic);
    } catch { finishMusic(); }
  };

  useEffect(() => {
    const audio = introMusic.current;
    playback.current.active = true;
    return () => {
      playback.current.active = false;
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
      stopIntroMusic(audio);
    };
  }, []);

  useEffect(() => {
    const t = [
      setTimeout(() => setGlasses("hair"), 900),
      setTimeout(() => setLine(1), 1250),
      setTimeout(() => setLine(2), 1950),
    ];

    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <div className="splash">
      <audio ref={introMusic} onEnded={endMusic} onError={finishMusic} />
      <div className="splash__glow" />

      <CoachAvatar size={230} glasses={glasses} />

      <h1>Coach Antoine</h1>

      <p className="splash__tagline">
        Bouger quelques minutes, se sentir bien longtemps.
      </p>

      <div className="splash__message" aria-live="polite">
        {line >= 1 && <strong>Bienvenue !</strong>}
      </div>

      {musicStarted && (
        <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: ".8rem", fontWeight: 400, margin: "0 0 10px", maxWidth: "34ch", zIndex: 1 }}>
          La musique complète est disponible dans « Le Coach ».
        </p>
      )}

      {line >= 2 && (
        <button className="splash__button" onClick={musicStarted ? endMusic : startMusic}>
          {musicStarted ? "Passer la musique" : "C'est parti !"}
        </button>
      )}
    </div>
  );
}
