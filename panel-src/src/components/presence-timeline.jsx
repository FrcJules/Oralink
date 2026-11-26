/**
 * Frise de présence d'un appareil sur 7 jours (livebox/device/presence).
 * Une ligne par jour, de minuit à minuit (heure du navigateur) ; les
 * segments colorés sont les périodes où l'appareil était connecté.
 */
import { useWsData } from "../lib/use-ws-data.js";
import { parseDate } from "../lib/format.js";

const DAY = 24 * 3600 * 1000;
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function PresenceTimeline({ mac }) {
  const { data, loading } = useWsData("livebox/device/presence", { mac, days: 7 }, 60_000);
  if (loading && !data) return <p className="text-sm lb-text-muted">Chargement…</p>;
  if (!data) return null;

  const now = parseDate(data.now)?.getTime();
  if (!now) return null;
  const tracked = parseDate(data.tracked_since)?.getTime();
  const sessions = data.sessions.map((s) => ({
    start: parseDate(s.start)?.getTime(),
    end: s.end ? parseDate(s.end)?.getTime() : now,
  })).filter((s) => s.start && s.end);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => today.getTime() - (6 - i) * DAY);
  const totalMs = sessions.reduce((sum, s) => sum + Math.max(0, s.end - Math.max(s.start, days[0])), 0);

  return (
    <div className="space-y-1">
      {days.map((dayStart) => {
        const dayEnd = dayStart + DAY;
        const segments = sessions
          .filter((s) => s.end > dayStart && s.start < dayEnd)
          .map((s) => ({ from: Math.max(s.start, dayStart), to: Math.min(s.end, dayEnd, now) }));
        const notTracked = tracked && tracked > dayStart ? Math.min(tracked, dayEnd) : null;
        return (
          <div key={dayStart} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right text-xs lb-text-muted">{dayFmt.format(dayStart)}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-[var(--secondary-background-color)]">
              {notTracked && (
                <div className="absolute inset-y-0 left-0 opacity-40"
                  style={{ width: `${((notTracked - dayStart) / DAY) * 100}%`,
                    background: "repeating-linear-gradient(45deg, transparent 0 3px, var(--divider-color) 3px 5px)" }}
                  title="Pas encore de suivi" />
              )}
              {segments.map((seg, i) => (
                <div key={i} className="absolute inset-y-0 rounded-sm"
                  style={{ left: `${((seg.from - dayStart) / DAY) * 100}%`,
                    width: `${Math.max(0.4, ((seg.to - seg.from) / DAY) * 100)}%`, background: "var(--lb-ok)" }}
                  title={`${timeFmt.format(seg.from)} → ${timeFmt.format(seg.to)}`} />
              ))}
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs lb-text-muted">
        {sessions.length
          ? `${sessions.length} connexion${sessions.length > 1 ? "s" : ""} · ${Math.round(totalMs / 3600000)} h en ligne sur 7 jours`
          : "Aucune connexion enregistrée sur 7 jours."}
        {tracked && tracked > days[0] ? " Suivi démarré récemment (zone hachurée)." : ""}
      </p>
    </div>
  );
}
