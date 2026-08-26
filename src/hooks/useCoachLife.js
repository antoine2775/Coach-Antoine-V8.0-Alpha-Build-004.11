import { useEffect, useMemo, useRef, useState } from "react";

function between(min, max) {
  return Math.random() * (max - min) + min;
}

function pickGlassesTarget() {
  // Règle validée :
  // 0 fois possible, 1 fois le plus fréquent, 2 fois parfois, jamais plus.
  const r = Math.random();
  if (r < 0.12) return 0;
  if (r < 0.88) return 1;
  return 2;
}

export default function useCoachLife({ active = true } = {}) {
  const [glassesMoment, setGlassesMoment] = useState(false);
  const glassesTarget = useMemo(() => pickGlassesTarget(), []);
  const glassesDone = useRef(0);
  const timers = useRef([]);

  useEffect(() => {
    if (!active) return undefined;

    const later = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      timers.current.push(id);
      return id;
    };

    const scheduleGlassesMoment = () => {
      if (glassesDone.current >= glassesTarget) return;

      // Pour le test Build 004.1, on attend assez longtemps pour que
      // le geste paraisse occasionnel et non mécanique.
      later(() => {
        if (glassesDone.current >= glassesTarget) return;

        setGlassesMoment(true);

        later(() => {
          setGlassesMoment(false);
          glassesDone.current += 1;
          scheduleGlassesMoment();
        }, 1450);
      }, between(18000, 36000));
    };

    scheduleGlassesMoment();

    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [active, glassesTarget]);

  return {
    glassesMoment,
    glassesTarget,
    glassesDone: glassesDone.current,
  };
}
