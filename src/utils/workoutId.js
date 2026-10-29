// Identifiant local de séance : randomUUID n'est pas exposé sur certaines
// origines HTTP utilisées pour les essais sur téléphone via le réseau local.
let sequence = 0;
export function createWorkoutId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === "function") return cryptoProvider.randomUUID();
  if (typeof cryptoProvider?.getRandomValues === "function") {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Dernier recours pour les environnements anciens : ce n'est pas un jeton
  // d'authentification, seulement une clé de dédoublonnage de l'historique local.
  return `session-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`;
}
