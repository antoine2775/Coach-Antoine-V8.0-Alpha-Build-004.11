import { useCallback, useEffect, useRef, useState } from "react";
import { getCoachPhrase, getWelcomePhrase, setCoachSilence } from "../coach";

export default function useCoach({ initialMessage = "", autoHideMs = 6200, profile, preview = false, policy } = {}) {
  const [message, setMessage] = useState(initialMessage);
  const [visible, setVisible] = useState(Boolean(initialMessage));
  const timer = useRef(null);
  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); }, []);
  const hide = useCallback(() => { clear(); setVisible(false); }, [clear]);
  const show = useCallback((text, duration = autoHideMs) => {
    clear(); setMessage(text || ""); setVisible(Boolean(text));
    if (text && duration > 0) timer.current = setTimeout(() => setVisible(false), duration);
    return text;
  }, [autoHideMs, clear]);
  const say = useCallback((category, options = {}) => {
    const text = getCoachPhrase(category, { ...options, profile, preview, policy });
    // Une sélection silencieuse ne coupe pas une intervention déjà affichée.
    return text ? show(text, options.duration ?? autoHideMs) : "";
  }, [show, autoHideMs, profile, preview, policy]);
  const welcome = useCallback(() => {
    const text = getWelcomePhrase({ profile, preview, policy });
    return text ? show(text) : "";
  }, [show, profile, preview, policy]);
  const stayQuiet = useCallback((ms = 10000) => {
    if (!preview) setCoachSilence(ms);
    hide();
  }, [hide, preview]);
  useEffect(() => clear, [clear]);
  return { message, visible, show, say, welcome, hide, stayQuiet };
}
