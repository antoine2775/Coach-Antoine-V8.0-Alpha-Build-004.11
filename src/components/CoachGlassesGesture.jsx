import React from "react";
import useGlassesGesture from "../hooks/useGlassesGesture";

const ACTIVE_IMAGE = "/coach/coach-active.png";

export default function CoachGlassesGesture({
  size = 320,
  testMode = false,
  showControls = false,
}) {
  const gesture = useGlassesGesture({ enabled: true, testMode });

  return (
    <div className="glasses-gesture-demo" style={{ width: size }}>
      <div
        className={`glasses-gesture-stage ${gesture.active ? "glasses-gesture-stage--active" : ""}`}
        style={{ width: size }}
      >
        <img
          className="glasses-gesture-base"
          src={ACTIVE_IMAGE}
          alt="Coach Antoine pendant l'exercice"
        />

        {/* Même PNG V6.5, mais la zone animée est fondue progressivement
            dans l'image de base : aucune bordure rectangulaire dure. */}
        <div className="glasses-gesture-soft-layer" aria-hidden="true">
          <img src={ACTIVE_IMAGE} alt="" />
        </div>
      </div>

      {showControls && (
        <div className="glasses-gesture-controls">
          <button type="button" className="primary-button" onClick={gesture.play}>
            Tester le geste maintenant
          </button>
        </div>
      )}
    </div>
  );
}
