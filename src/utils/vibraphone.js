export const VIBRAPHONE = Object.freeze({
  frequency: 277, duration: 0.50, volume: 0.26, attack: 0.008,
  partialRatio: 4, partialVolume: 0.12, partialDecay: 0.5,
});

// Même synthèse pour l'écoute de développement et chaque seconde de récupération.
export function scheduleVibraphoneNote(context, start, onended) {
  for (const [ratio, strength, decay] of [[1, 1, 1], [VIBRAPHONE.partialRatio, VIBRAPHONE.partialVolume, VIBRAPHONE.partialDecay]]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const end = start + VIBRAPHONE.duration * decay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(VIBRAPHONE.frequency * ratio, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(VIBRAPHONE.volume * strength, start + VIBRAPHONE.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); if (ratio === 1) onended?.(); };
    oscillator.start(start);
    oscillator.stop(end);
  }
}

export function createVibraphonePlayer(audioWindow = globalThis.window) {
  let context = null;
  return {
    unlock() {
      try {
        if (!context || context.state === "closed") {
          const AudioContext = audioWindow.AudioContext || audioWindow.webkitAudioContext;
          context = new AudioContext();
        }
        if (context.state !== "running") Promise.resolve(context.resume()).catch(() => {});
      } catch { /* L'audio facultatif ne bloque jamais une séance. */ }
    },
    play() {
      // Aucun rattrapage sonore si le navigateur a suspendu l'audio.
      if (context?.state !== "running") return;
      try { scheduleVibraphoneNote(context, context.currentTime); } catch { /* audio facultatif */ }
    },
    close() {
      const previous = context;
      context = null;
      try { if (previous) Promise.resolve(previous.close()).catch(() => {}); } catch { /* déjà fermé */ }
    },
  };
}
