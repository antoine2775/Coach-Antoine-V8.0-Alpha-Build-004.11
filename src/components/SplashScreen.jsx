import React, { useEffect, useState } from "react";
import CoachAvatar from "./CoachAvatar";
import { playRiff } from "../utils/sound";

export default function SplashScreen({ onDone, soundEnabled }) {
  const [glasses, setGlasses] = useState("eyes");
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (soundEnabled) playRiff("start");

    const t = [
      setTimeout(() => setGlasses("hair"), 900),
      setTimeout(() => setLine(1), 1250),
      setTimeout(() => setLine(2), 1950),
    ];

    return () => t.forEach(clearTimeout);
  }, [soundEnabled]);

  return (
    <div className="splash">
      <div className="splash__glow" />

      <CoachAvatar size={230} glasses={glasses} />

      <h1>Coach Antoine</h1>

      <p className="splash__tagline">
        Bouger quelques minutes, se sentir bien longtemps.
      </p>

      <div className="splash__message" aria-live="polite">
        {line >= 1 && <strong>Bonjour Antoine !</strong>}
        {line >= 2 && <span>Prêt ?</span>}
      </div>

      {line >= 2 && (
        <button className="splash__button" onClick={onDone}>
          C'est parti !
        </button>
      )}
    </div>
  );
}
