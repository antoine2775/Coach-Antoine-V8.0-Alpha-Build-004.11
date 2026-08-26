import React, { useEffect, useRef, useState } from "react";

export default function CoachArmGesture({
  size = 345,
  autoTest = true,
  showButton = true,
}) {
  const [moving, setMoving] = useState(false);
  const busy = useRef(false);

  const play = () => {
    if (busy.current) return;
    busy.current = true;
    setMoving(true);

    window.setTimeout(() => {
      setMoving(false);
      busy.current = false;
    }, 1450);
  };

  useEffect(() => {
    if (!autoTest) return undefined;
    const id = window.setInterval(play, 7000);
    return () => window.clearInterval(id);
  }, [autoTest]);

  return (
    <div className="arm-gesture-demo" style={{ width: size }}>
      <div className={`arm-gesture-stage ${moving ? "arm-gesture-stage--moving" : ""}`}>
        <img
          className="arm-gesture-background"
          src="/coach/layers/clean-plate-v65.png"
          alt="Coach Antoine"
        />

        <img
          className="arm-gesture-glasses"
          src="/coach/layers/glasses-v65.png"
          alt=""
          aria-hidden="true"
        />

        <img
          className="arm-gesture-arm"
          src="/coach/layers/arm-hand-v65.png"
          alt=""
          aria-hidden="true"
        />
      </div>

      {showButton && (
        <button type="button" className="primary-button" onClick={play}>
          Tester le geste complet
        </button>
      )}
    </div>
  );
}
