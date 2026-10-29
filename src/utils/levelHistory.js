export const LEVEL_KEYS = Object.freeze(["reprise", "forme", "tonique"]);

export function validLevelHistory(history) {
  return Array.isArray(history) && history.every((entry) => entry &&
    LEVEL_KEYS.includes(entry.level) && (entry.startedAt === null ||
      typeof entry.startedAt === "string" && Number.isFinite(Date.parse(entry.startedAt))));
}

// Lecture sans migration : la date d'un ancien niveau n'est jamais inventée.
export function getLevelHistory(profile) {
  if (profile?.levelHistory?.length) return profile.levelHistory.map((entry) => ({ ...entry }));
  return profile?.onboardingCompleted && LEVEL_KEYS.includes(profile.selectedLevel)
    ? [{ level: profile.selectedLevel, startedAt: null }] : [];
}

export function recordLevelChange(profile, previous, now) {
  if (!profile.onboardingCompleted) return profile;
  if (previous?.onboardingCompleted && previous.selectedLevel === profile.selectedLevel && !previous.levelHistory) return profile;
  const history = getLevelHistory(previous || profile);
  if (!previous?.onboardingCompleted && !profile.levelHistory?.length) history.length = 0;
  if (history.at(-1)?.level !== profile.selectedLevel) history.push({ level: profile.selectedLevel, startedAt: now });
  return { ...profile, levelHistory: history };
}
