import React, { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';

let arreterLecteurActif = null;

export default function OnboardingAudio({ sources, pauseMs = 0 }) {
  const arreter = useRef(null);
  // Contexte facultatif pour les tests isolés ; dans l'app, couvre aussi une
  // navigation de route qui laisse le garde d'onboarding monté.
  const location = useContext(UNSAFE_LocationContext)?.location;
  const precedente = useRef(location);
  useLayoutEffect(() => {
    if (precedente.current !== location) arreter.current?.();
    precedente.current = location;
  }, [location]);

  const attacher = useCallback(audio => {
    if (!audio || sources.length === 0) return;
    arreterLecteurActif?.();
    let actif = true, tentative = 0, pauseEnAttente = null;
    const fenetre = audio.ownerDocument.defaultView;
    const stop = () => {
      if (!actif) return;
      actif = false;
      tentative++;
      fenetre.clearTimeout(pauseEnAttente);
      pauseEnAttente = null;
      audio.onended = audio.onerror = null;
      fenetre.removeEventListener('popstate', stop);
      fenetre.removeEventListener('pagehide', stop);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (arreterLecteurActif === stop) arreterLecteurActif = null;
      if (arreter.current === stop) arreter.current = null;
    };
    const lire = index => {
      if (!actif) return;
      if (index === sources.length) { stop(); return; }
      const numero = ++tentative;
      const actuelle = () => actif && tentative === numero;
      if (index > 0) audio.pause();
      audio.src = sources[index];
      audio.onended = () => {
        if (!actuelle()) return;
        if (index === sources.length - 1) { stop(); return; }
        // Invalider aussitôt les événements/promesses de ce fichier terminé.
        tentative++;
        if (pauseMs > 0) {
          pauseEnAttente = fenetre.setTimeout(() => {
            pauseEnAttente = null;
            lire(index + 1);
          }, pauseMs);
        } else lire(index + 1);
      };
      audio.onerror = () => { if (actuelle()) stop(); };
      try {
        Promise.resolve(audio.play()).catch(() => { if (actuelle()) stop(); });
      } catch { if (actuelle()) stop(); }
    };
    arreter.current = arreterLecteurActif = stop;
    fenetre.addEventListener('popstate', stop);
    fenetre.addEventListener('pagehide', stop);
    lire(0);
    // React 19 nettoie la ref avant réactivation, changement de sources ou sortie.
    return stop;
  }, [sources, pauseMs]);

  return sources.length ? <audio ref={attacher} preload="none" /> : null;
}
