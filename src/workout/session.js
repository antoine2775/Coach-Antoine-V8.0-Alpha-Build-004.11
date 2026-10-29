import { workoutSteps } from "../data.js";
import { HISTORY_KEY, readHistory } from "../utils/workoutHistory.js";
import { WORKOUT_CONFIG } from "./config.js";
import { FEEDBACK_CATEGORIES, feedbackAnswers, isFeedbackComplete, validFeedbackChoice, recordFeedback, scheduleFeedback } from "./feedback.js";
import { readDiscoveredExercises, discoverExercise, getExerciseDiscoveryId } from "../utils/exerciseDiscovery.js";
import { createWorkoutId } from "../utils/workoutId.js";
import { LEVEL_KEYS } from "../utils/levelHistory.js";

export const DRAFT_KEY = "coachAntoineWorkoutDraftV1";
const FORMS = ["low", "normal", "high"];
const FEEDBACK_SCREENS = ["general", "category", "detail"];
const finite = (value) => Number.isFinite(value) && value >= 0;
const displayedSeconds = (value) => Math.ceil(Math.max(0, value - 1e-7));

// Contrôleur synchrone : tous les événements utilisent la même horloge et
// passent par les mêmes transitions. React n'est que l'affichage.
export function createWorkoutSession({ storage, now = () => performance.now(),
  wallNow = () => Date.now(), uuid = createWorkoutId,
  sound = () => {}, steps = workoutSteps, config = WORKOUT_CONFIG } = {}) {
  let state = empty();
  let anchor = null;
  let lastNext = -Infinity;
  let saveInProgress = false;
  let draftBlocked = false;
  let lastCheckpoint = "";
  let closed = false;
  const totalExerciseSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);

  function restDuration() {
    try {
      const value = Number(storage.getItem("coachAntoineRestDuration"));
      return !Number.isFinite(value) || value === 0 ? config.DEFAULT_REST
        : Math.min(config.MAX_REST, Math.max(config.MIN_REST, value));
    } catch { return config.DEFAULT_REST; }
  }
  function empty() {
    return { version: 1, id: null, dayForm: null, level: null, phase: "exercise", step: 0,
      remaining: steps[0].seconds, activeSeconds: 0, restDuration: restDuration(), running: false,
      started: false, interrupted: false, earlyCount: 0, reminder: false, finished: null,
      instructionsOpen: false, firstDiscovery: false, discoveryError: null,
      saveStatus: "pending", feedbackPlanned: false, feedbackScreen: "close", feedbackCategories: [], feedbackDetails: {},
      feedbackDeadline: null, acknowledgementDeadline: null, feedbackReply: null, feedbackError: null, draftError: null };
  }
  function validDraft(value) {
    const categories = value?.feedbackCategories ?? (value?.feedbackCategory ? [value.feedbackCategory] : []);
    const details = value?.feedbackDetails ?? {};
    return value?.version === 1 && typeof value.id === "string" && value.id.length > 0 &&
      FORMS.includes(value.dayForm) && [null, "reprise", "forme", "tonique"].includes(value.level) &&
      ["exercise", "rest", "finished"].includes(value.phase) && Number.isInteger(value.step) &&
      value.step >= 0 && value.step < steps.length && finite(value.remaining) &&
      finite(value.activeSeconds) && value.activeSeconds <= totalExerciseSeconds &&
      finite(value.restDuration) && value.restDuration >= config.MIN_REST && value.restDuration <= config.MAX_REST &&
      value.remaining <= (value.phase === "rest" ? value.restDuration : steps[value.step].seconds) &&
      typeof value.started === "boolean" && Number.isInteger(value.earlyCount) && value.earlyCount >= 0 &&
      (value.instructionsOpen === undefined || typeof value.instructionsOpen === "boolean") &&
      (value.firstDiscovery === undefined || typeof value.firstDiscovery === "boolean") &&
      typeof value.reminder === "boolean" && ["pending", "saved", "error"].includes(value.saveStatus) &&
      [...FEEDBACK_SCREENS, "acknowledgement", "close"].includes(value.feedbackScreen) &&
      (value.feedbackScreen !== "acknowledgement" || finite(value.acknowledgementDeadline)) &&
      Array.isArray(categories) && new Set(categories).size === categories.length &&
      categories.every((category) => FEEDBACK_CATEGORIES.includes(category)) &&
      details !== null && typeof details === "object" && !Array.isArray(details) &&
      Object.keys(details).every((category) => categories.includes(category) && validFeedbackChoice(category, details[category])) &&
      (value.feedbackDeadline === null || finite(value.feedbackDeadline)) &&
      (value.feedbackScreen !== "detail" || categories.length > 0) &&
      (FEEDBACK_SCREENS.includes(value.feedbackScreen) ? finite(value.feedbackDeadline) : value.feedbackDeadline === null) &&
      (value.phase !== "rest" || value.step < steps.length - 1) &&
      (value.phase !== "finished" ? value.finished === null : (value.step === steps.length - 1 &&
        value.finished?.id === value.id && value.finished.activeSeconds === value.activeSeconds &&
        value.finished.dayForm === value.dayForm && Number.isFinite(Date.parse(value.finished.date)) &&
        value.finished.label === "Séance Coach Antoine"));
  }
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw !== null) {
      const restored = JSON.parse(raw);
      if (!validDraft(restored)) throw Error("Invalid draft");
      state = { ...empty(), ...restored, running: false, interrupted: restored.phase !== "finished", draftError: null };
      state.feedbackCategories = restored.feedbackCategories ?? (restored.feedbackCategory ? [restored.feedbackCategory] : []);
      state.feedbackDetails = restored.feedbackDetails ?? {};
    }
  } catch {
    draftBlocked = true;
    state.draftError = "La sauvegarde temporaire est indisponible. Elle n’a pas été remplacée.";
  }

  function persist() {
    if (!state.id || draftBlocked || closed) return;
    try {
      // Le temps hors de l'application n'est jamais rattrapé à la restauration.
      storage.setItem(DRAFT_KEY, JSON.stringify({ ...state, running: false,
        interrupted: state.phase !== "finished", draftError: null }));
      state.draftError = null;
    } catch { state.draftError = "La sauvegarde temporaire a échoué. Gardez cette page ouverte pour conserver votre séance."; }
  }
  function checkpoint(force = false) {
    const key = `${state.phase}/${state.step}/${displayedSeconds(state.remaining)}/${state.feedbackScreen}`;
    if (force || key !== lastCheckpoint) { persist(); lastCheckpoint = key; }
  }
  function enterFeedback(screen) {
    state.feedbackScreen = screen;
    state.feedbackDeadline = FEEDBACK_SCREENS.includes(screen) ? wallNow() + config.END_FEEDBACK_TIMEOUT : null;
    state.acknowledgementDeadline = screen === "acknowledgement"
      ? wallNow() + config.FEEDBACK_ACKNOWLEDGEMENT_SECONDS * 1000 : null;
  }
  function planFeedback() {
    try {
      const entry = scheduleFeedback(storage, { id: state.id, level: state.level }, config);
      if (entry.response && !state.feedbackReply) {
        applyResponse(entry.response);
      } else if (state.feedbackDeadline === null && state.feedbackScreen === "close" && !state.feedbackPlanned) {
        state.feedbackPlanned = true;
        enterFeedback(entry.ask && !entry.response ? "general" : "close");
      }
      state.feedbackError = null;
    } catch { state.feedbackError = "Le suivi des avis n’a pas pu être enregistré. Réessayez sans modifier vos réglages."; }
  }
  function applyResponse(response) {
    if (feedbackAnswers(response).pauses) {
      storage.setItem("coachAntoineRestDuration", String(response.restDuration));
      state.restDuration = response.restDuration;
    }
    state.feedbackReply = response;
    state.feedbackPlanned = true;
    state.feedbackError = null;
    enterFeedback(response.adapted ? "close" : "acknowledgement");
  }
  function save() {
    if (!state.finished || saveInProgress) return;
    saveInProgress = true;
    try {
      const result = readHistory(storage);
      if (result.error) throw Error("Invalid history");
      if (!result.history.some((entry) => entry.id === state.id)) {
        storage.setItem(HISTORY_KEY, JSON.stringify([state.finished, ...result.history]));
      }
      state.saveStatus = "saved";
      planFeedback();
    } catch { state.saveStatus = "error"; }
    finally { saveInProgress = false; checkpoint(true); }
  }
  function finish() {
    if (state.finished) return;
    state.phase = "finished";
    state.running = false;
    anchor = null;
    state.finished = { id: state.id, date: new Date(wallNow()).toISOString(),
      activeSeconds: state.activeSeconds, label: "Séance Coach Antoine", dayForm: state.dayForm, level: state.level };
    // Outbox distincte de l'historique : permet un retry après réouverture.
    checkpoint(true);
    save();
    try { if (storage.getItem("coachAntoineSound") !== "off") sound("finish"); } catch { /* audio facultatif */ }
  }
  function transition(early = false) {
    if (state.phase === "exercise") {
      state.earlyCount = early ? state.earlyCount + 1 : 0;
      state.reminder = early && state.earlyCount === config.EARLY_SKIP_CONSECUTIVE_COUNT;
      if (state.step === steps.length - 1) { finish(); return; }
      state.phase = "rest";
      state.remaining = state.restDuration;
    } else if (state.phase === "rest") {
      state.step++;
      state.phase = "exercise";
      state.remaining = steps[state.step].seconds;
      state.reminder = false;
      presentNewExercise();
    }
  }
  function presentNewExercise() {
    // Les étapes sans identifiant n'existent que dans certains contrôles techniques.
    const id = getExerciseDiscoveryId(steps[state.step]);
    if (!id || state.phase !== "exercise" || state.finished) return;
    try {
      if (readDiscoveredExercises(storage).includes(id)) return;
      state.discoveryError = null;
    } catch {
      state.discoveryError = "La découverte de cet exercice n’a pas pu être lue. Réessayez avant de commencer.";
    }
    state.instructionsOpen = true;
    state.firstDiscovery = true;
    state.running = false;
    anchor = null;
  }
  function settle() {
    if (!state.running || anchor === null || state.finished) return false;
    const time = now();
    let elapsed = Math.max(0, (time - anchor) / 1000);
    anchor = time;
    let changed = false;
    while (elapsed > 0 && state.running && !state.finished) {
      const used = Math.min(elapsed, state.remaining);
      if (state.phase === "exercise") state.activeSeconds = Math.min(totalExerciseSeconds, state.activeSeconds + used);
      state.remaining = Math.max(0, state.remaining - used);
      elapsed -= used;
      if (state.remaining < 1e-7) {
        transition(); changed = true;
        lastNext = time; // Fin naturelle + Suivant au même instant : un seul passage.
      }
    }
    return changed;
  }
  function timeoutFeedback() {
    if (state.feedbackDeadline !== null && wallNow() >= state.feedbackDeadline ||
        state.feedbackScreen === "acknowledgement" && wallNow() >= state.acknowledgementDeadline) {
      enterFeedback("close");
      checkpoint(true);
      return true;
    }
    return false;
  }
  const api = {
    getState: () => ({ ...state, displayedRemaining: displayedSeconds(state.remaining),
      countdown: state.phase === "rest" && state.remaining > 0 && displayedSeconds(state.remaining) <= config.COUNTDOWN_SECONDS,
      progress: state.phase === "finished" ? 100 : 100 * (state.step + (state.phase === "rest" ? 1
        : 1 - state.remaining / steps[state.step].seconds)) / steps.length }),
    chooseDayForm(choice, level) {
      if (state.id || draftBlocked || !FORMS.includes(choice) || !LEVEL_KEYS.includes(level)) return;
      state.id = uuid(); state.dayForm = choice; state.level = level;
      presentNewExercise();
      try { storage.setItem("coachAntoineDayForm", choice); } catch { /* brouillon signale l'erreur */ }
      checkpoint(true);
    },
    toggle() {
      if (!state.id || state.finished || state.interrupted || state.instructionsOpen) return;
      if (state.running) { settle(); state.running = false; anchor = null; }
      else { state.running = true; state.started = true; anchor = now(); }
      checkpoint(true);
    },
    next() {
      if (!state.id || state.finished || state.interrupted || state.instructionsOpen) return;
      const changed = settle();
      if (changed || now() - lastNext < config.NEXT_GUARD_MS || state.finished) { checkpoint(); return; }
      lastNext = now();
      transition(state.phase === "exercise" && displayedSeconds(state.remaining) > config.EARLY_SKIP_REMAINING_SECONDS);
      checkpoint(true);
    },
    tick() { settle(); timeoutFeedback(); checkpoint(); },
    openInstructions() {
      if (!state.id || state.finished || state.interrupted || state.phase !== "exercise") return;
      settle();
      if (state.phase !== "exercise" || state.finished) { checkpoint(true); return; }
      state.running = false; anchor = null;
      state.instructionsOpen = true;
      checkpoint(true);
    },
    closeInstructions() {
      if (!state.instructionsOpen || state.interrupted || state.finished) return;
      try {
        const id = getExerciseDiscoveryId(steps[state.step]);
        if (id) discoverExercise(storage, id);
        state.discoveryError = null;
      } catch {
        state.discoveryError = "La découverte de cet exercice n’a pas pu être enregistrée. Réessayez avant de commencer.";
        checkpoint(true); return;
      }
      state.instructionsOpen = false; state.firstDiscovery = false;
      state.running = true; state.started = true; anchor = now();
      checkpoint(true);
    },
    interrupt() {
      if (!state.id || state.finished) { timeoutFeedback(); checkpoint(true); return; }
      settle();
      if (!state.finished) { state.running = false; state.interrupted = true; anchor = null; }
      checkpoint(true);
    },
    resume() {
      if (!state.interrupted || state.finished) return;
      state.interrupted = false;
      presentNewExercise();
      state.running = state.started && !state.instructionsOpen;
      anchor = state.running ? now() : null;
      checkpoint(true);
    },
    closeFinished() {
      // Conserver l'écran de fin pendant la transition de route, sans préparer
      // une nouvelle séance ni recréer le brouillon au nettoyage du hook.
      if (!state.finished || state.saveStatus !== "saved") return false;
      try { storage.removeItem(DRAFT_KEY); }
      catch { state.draftError = "Impossible de fermer la séance. Réessayez."; return false; }
      closed = true;
      return true;
    },
    abandon() {
      // Ne jamais perdre une séance terminée en attente d'enregistrement.
      if (state.finished && state.saveStatus !== "saved") return false;
      try { storage.removeItem(DRAFT_KEY); }
      catch { state.draftError = "Impossible d’effacer la sauvegarde temporaire. Réessayez."; return false; }
      state = empty(); draftBlocked = false; closed = false; anchor = null; lastNext = -Infinity; lastCheckpoint = "";
      return true;
    },
    save,
    activate() {
      if (state.finished && state.saveStatus !== "saved") save();
      else if (state.finished) { planFeedback(); checkpoint(true); }
      timeoutFeedback();
    },
    answer(value) {
      if (!state.finished || state.saveStatus !== "saved" || timeoutFeedback()) return;
      const screen = state.feedbackScreen;
      if (screen === "general" && value === "no") { enterFeedback("category"); checkpoint(true); return; }
      if (screen !== "general" || value !== "yes") return;
      commitFeedback({});
    },
    toggleFeedbackCategory(category) {
      if (state.feedbackScreen !== "category" || timeoutFeedback() || !FEEDBACK_CATEGORIES.includes(category)) return;
      const selected = new Set(state.feedbackCategories);
      if (selected.has(category)) { selected.delete(category); delete state.feedbackDetails[category]; }
      else selected.add(category);
      state.feedbackCategories = FEEDBACK_CATEGORIES.filter((item) => selected.has(item));
      enterFeedback("category"); checkpoint(true);
    },
    continueFeedback() {
      if (state.feedbackScreen !== "category" || timeoutFeedback() || state.feedbackCategories.length === 0) return;
      enterFeedback("detail"); checkpoint(true);
    },
    setFeedbackDetail(category, value) {
      if (state.feedbackScreen !== "detail" || timeoutFeedback() || !state.feedbackCategories.includes(category) ||
          !validFeedbackChoice(category, value)) return;
      state.feedbackDetails = { ...state.feedbackDetails, [category]: value };
      enterFeedback("detail"); checkpoint(true);
    },
    submitFeedback() {
      if (state.feedbackScreen !== "detail" || timeoutFeedback() || !isFeedbackComplete(state.feedbackCategories, state.feedbackDetails)) return;
      commitFeedback(Object.fromEntries(state.feedbackCategories.map((category) => [category, state.feedbackDetails[category]])));
    },
  };
  function commitFeedback(answers) {
      let duration = state.restDuration;
      if (answers.pauses) duration = answers.pauses === "short"
        ? Math.min(config.MAX_REST, duration + config.REST_STEP)
        : Math.max(config.MIN_REST, duration - config.REST_STEP);
      try {
        const response = recordFeedback(storage, state.id, { adapted: Object.keys(answers).length === 0, answers,
          date: new Date(wallNow()).toISOString(), ...(answers.pauses ? { restDuration: duration } : {}) });
        applyResponse(response);
      } catch { state.feedbackError = "La réponse n’a pas pu être enregistrée. Réessayez la validation."; }
      checkpoint(true);
  }
  return api;
}

// Cycle de vie partagé par le hook et les tests à horloge contrôlée.
export function attachWorkoutSession(session, { document, window, setInterval, clearInterval }, notify) {
  const refresh = () => { session.tick(); notify(); };
  const interrupt = () => { session.interrupt(); notify(); };
  const visibility = () => {
    if (document.visibilityState === "hidden") interrupt();
    else refresh();
  };
  session.activate();
  if (document.visibilityState === "hidden") interrupt();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", interrupt);
  window.addEventListener("pageshow", refresh);
  const timer = setInterval(refresh, WORKOUT_CONFIG.TICK_MS);
  notify();
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", interrupt);
    window.removeEventListener("pageshow", refresh);
    session.interrupt(); // Navigation hors de /seances.
  };
}
