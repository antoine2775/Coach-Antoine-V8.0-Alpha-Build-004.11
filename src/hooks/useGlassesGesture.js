import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function chooseSessionTarget() {
  // Règle Coach Antoine :
  // 0 fois parfois, 1 fois le plus souvent, 2 fois occasionnellement, jamais plus.
  const roll = Math.random();
  if (roll < 0.12) return 0;
  if (roll < 0.88) return 1;
  return 2;
}

export default function useGlassesGesture({
  enabled = true,
  testMode = false,
} = {}) {
  const [active, setActive] = useState(false);
  const target = useMemo(() => (testMode ? 99 : chooseSessionTarget()), [testMode]);
  const count = useRef(0);
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    if (!enabled || active) return false;
    if (!testMode && count.current >= target) return false;

    setActive(true);

    const id = window.setTimeout(() => {
      setActive(false);
      count.current += 1;
    }, 1050);

    timers.current.push(id);
    return true;
  }, [active, enabled, target, testMode]);

  useEffect(() => {
    if (!enabled) return undefined;

    if (testMode) {
      // Sur la page /presence seulement : le geste revient régulièrement
      // pour qu'Antoine puisse le juger sans attendre.
      const schedule = () => {
        const id = window.setTimeout(() => {
          play();
          schedule();
        }, 7000);
        timers.current.push(id);
      };
      schedule();
      return clearTimers;
    }

    if (target === 0) return clearTimers;

    const scheduleRealSessionGesture = () => {
      if (count.current >= target) return;

      const id = window.setTimeout(() => {
        const didPlay = play();
        if (didPlay) {
          const next = window.setTimeout(() => {
            scheduleRealSessionGesture();
          }, randomBetween(28000, 60000));
          timers.current.push(next);
        }
      }, randomBetween(30000, 70000));

      timers.current.push(id);
    };

    scheduleRealSessionGesture();
    return clearTimers;
  }, [clearTimers, enabled, play, target, testMode]);

  return {
    active,
    play,
    planned: testMode ? null : target,
    done: count.current,
  };
}
