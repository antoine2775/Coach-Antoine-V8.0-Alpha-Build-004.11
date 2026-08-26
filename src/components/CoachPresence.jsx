import React, { useEffect, useState } from "react";
import CoachAvatar from "./CoachAvatar";

export default function CoachPresence({ size = 220, demo = false }) {
  const [phase, setPhase] = useState(demo ? "start" : "active");

  useEffect(() => {
    if (!demo) return;
    const timers = [
      setTimeout(() => setPhase("active"), 2200),
      setTimeout(() => setPhase("finish"), 6200),
      setTimeout(() => setPhase("start"), 9000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [demo]);

  return (
    <div className="coach-v65-presence">
      <CoachAvatar phase={phase} size={size} />
      <div className="coach-v65-badge">
        Avatar officiel V6.5 — {phase === "active" ? "pendant l'exercice" : phase}
      </div>
    </div>
  );
}
