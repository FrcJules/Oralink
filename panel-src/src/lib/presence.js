/** Niveaux d'alerte « appareil visé » (cf. components/presence.jsx). */

/** Au-delà, une règle vers un appareil hors ligne est signalée comme oubliée. */
export const STALE_DAYS = 30;

/** Niveau d'alerte : null (rien à signaler), "warn" ou "bad". */
export function presenceLevel(p) {
  if (!p) return null;
  if (p.state === "unknown") return "bad";
  if (p.state === "moved") return "warn";
  if (p.state === "offline") {
    if (p.offline_days == null) return "warn";
    if (p.offline_days >= STALE_DAYS) return "bad";
    return p.offline_days >= 1 ? "warn" : null;
  }
  return null;
}

/** Règle « oubliée » : appareil inconnu ou absent depuis STALE_DAYS jours. */
export const isStale = (p) => presenceLevel(p) === "bad";
