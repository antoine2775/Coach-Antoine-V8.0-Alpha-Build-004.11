export const DISCOVERY_KEY = "coachAntoineExerciseDiscoveryV1";

// Une variante technique peut expliciter sa propre identité. Aucun identifiant de
// séance, niveau, durée ou nombre de répétitions n'entre dans cette clé.
export function getExerciseDiscoveryId(exercise) {
  const id = exercise.discoveryId ?? exercise.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function readDiscoveredExercises(storage) {
  const raw = storage.getItem(DISCOVERY_KEY);
  if (raw === null) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && id.length > 0)) {
    throw Error("Invalid exercise discovery");
  }
  return [...new Set(value)];
}

export function discoverExercise(storage, id) {
  const known = readDiscoveredExercises(storage);
  if (!known.includes(id)) storage.setItem(DISCOVERY_KEY, JSON.stringify([...known, id]));
}
