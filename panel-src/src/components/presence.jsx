/**
 * « Appareil visé » d'une règle (NAT, UPnP, PTF, IPv6, DMZ, bail statique).
 *
 * La Livebox ne compte pas l'utilisation des règles : on ne peut pas dire
 * qu'un port n'a « pas été appelé ». On dit en revanche si l'appareil de
 * destination existe encore — `presence` vient du backend (presence_utils.py) :
 * { state: online | moved | offline | unknown, name, mac, last_seen,
 *   offline_days, current_ip }.
 */
import { Dot, Pill } from "./status.jsx";
import { formatDays, parseDate } from "../lib/format.js";
import { STALE_DAYS, isStale, presenceLevel } from "../lib/presence.js";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function tooltip(p) {
  const seen = parseDate(p.last_seen);
  const parts = [];
  if (p.mac) parts.push(p.mac);
  if (seen && p.state !== "online") parts.push(`Dernière présence connue le ${dateFmt.format(seen)}`);
  return parts.join(" · ") || undefined;
}

/** Ligne compacte sous l'IP/MAC de destination. */
export function PresenceBadge({ presence: p, className = "" }) {
  if (!p) return null;
  const title = tooltip(p);
  if (p.state === "online") {
    return (
      <span className={`inline-flex items-center gap-1 text-xs lb-text-muted ${className}`} title={title}>
        <Dot level="ok" /> {p.name || "En ligne"}
      </span>
    );
  }
  const level = presenceLevel(p) ?? "neutral";
  let label;
  if (p.state === "unknown") label = "Aucun appareil connu";
  else if (p.state === "moved") label = `${p.name} a changé d'adresse${p.current_ip ? ` (${p.current_ip})` : ""}`;
  else label = `${p.name ? `${p.name} · ` : ""}hors ligne${p.offline_days != null ? ` depuis ${formatDays(p.offline_days)}` : ""}`;
  return <span className={className}><Pill level={level} title={title}>{label}</Pill></span>;
}

/**
 * Bandeau en tête de liste quand des règles visent un appareil disparu.
 * `noun` : [singulier, pluriel] — ex. ["règle", "règles"].
 */
export function StaleNotice({ items, noun = ["règle", "règles"] }) {
  const stale = (items ?? []).filter((it) => isStale(it?.presence));
  if (!stale.length) return null;
  const n = stale.length;
  return (
    <div className="lb-banner lb-banner-warn mb-3" role="status">
      <span className="lb-banner-icon" style={{ background: "var(--lb-warn)" }}>
        <span className="text-sm font-bold">!</span>
      </span>
      <div className="min-w-0">
        <p className="font-semibold leading-snug lb-text">
          {n} {n > 1 ? noun[1] : noun[0]} {n > 1 ? "visent" : "vise"} un appareil disparu
        </p>
        <p className="text-sm lb-text-muted">
          Appareil inconnu ou hors ligne depuis plus de {STALE_DAYS} jours — probablement à supprimer.
          La Livebox ne compte pas l'utilisation des ports : seule la présence de l'appareil est vérifiée.
        </p>
      </div>
    </div>
  );
}
