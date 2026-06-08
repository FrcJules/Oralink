import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function timeLabel(value) {
  if (!value) return "";
  const m = String(value).match(/(\d{2}):(\d{2}):\d{2}/);
  return m ? `${m[1]}:${m[2]}` : String(value);
}

function RateBar({ label, rate, color, max }) {
  const pct = max > 0 ? Math.min(100, (rate / max) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs lb-text-muted">{label}</span>
        <span className="tabular-nums text-sm font-semibold" style={{ color }}>
          {rate >= 1000
            ? `${(rate / 1000).toFixed(2)} Gbit/s`
            : rate >= 1
            ? `${rate.toFixed(2)} Mbit/s`
            : `${(rate * 1000).toFixed(0)} Kbit/s`}
        </span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-[var(--secondary-background-color)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function LiveBadge({ ifaces }) {
  if (!ifaces || ifaces.length === 0) return null;

  // Prefer ONT/WAN interface (veip0/Fibre) for the live badge
  const wan = ifaces.find((i) => i.type === "ont" || i.type === "wan") ?? ifaces[0];
  if (!wan || wan.rate_rx == null) return null;

  const rx = wan.rate_rx ?? 0;
  const tx = wan.rate_tx ?? 0;
  if (rx === 0 && tx === 0) return null;
  const maxAll = Math.max(rx, tx, 0.001);

  return (
    <div className="mb-4 flex items-stretch gap-4 rounded-xl border lb-border bg-[var(--secondary-background-color)] px-4 py-3">
      <RateBar label={`${wan.name} ↓`} rate={rx} color="#2563eb" max={maxAll} />
      <div className="w-px bg-[var(--divider-color)]" />
      <RateBar label={`${wan.name} ↑`} rate={tx} color="#16a34a" max={maxAll} />
      <div className="flex items-center pl-1 flex-shrink-0">
        <span className="text-[10px] lb-text-muted">live · 3 s</span>
      </div>
    </div>
  );
}

export function GraphsTab() {
  const { data, loading, error, refresh } = useWsData("livebox/graphs", {}, 60_000);
  const { data: liveIfaces } = useWsData("livebox/interfaces/live", {}, 3_000);

  const points = (data ?? []).map((p) => ({ ...p, label: timeLabel(p.time) }));
  const hasWan = points.some((p) => (p.wan_rate_rx ?? 0) > 0 || (p.wan_rate_tx ?? 0) > 0);
  const hasDevice = points.some((p) => (p.rate_rx ?? 0) > 0 || (p.rate_tx ?? 0) > 0);
  const hasChart = points.length >= 2;

  return (
    <Card
      title="Graphiques de trafic — débit agrégé (Mbit/s)"
      actions={
        <button onClick={refresh} className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]">
          ↻ Rafraîchir
        </button>
      }
    >
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <LiveBadge ifaces={liveIfaces} />

          {!hasChart ? (
            <div className="flex items-center gap-3 rounded-lg border lb-border px-4 py-3 text-sm lb-text-muted">
              <span className="text-base">⏳</span>
              <span>
                Courbe en cours de constitution — {points.length} / 2 points enregistrés.
                Un point est ajouté à chaque cycle coordinator (~1 min).
              </span>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--divider-color)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} unit=" Mb/s" width={68} />
                  <Tooltip
                    formatter={(value, name) => [`${value} Mbit/s`, name]}
                    contentStyle={{
                      background: "var(--card-background-color)",
                      border: "1px solid var(--divider-color)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {hasWan && (
                    <>
                      <Line type="monotone" dataKey="wan_rate_rx" name="WAN ↓" stroke="#2563eb" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="wan_rate_tx" name="WAN ↑" stroke="#16a34a" dot={false} strokeWidth={2} />
                    </>
                  )}
                  {hasDevice && (
                    <>
                      <Line type="monotone" dataKey="rate_rx" name="Appareils ↓" stroke="#7c3aed" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="rate_tx" name="Appareils ↑" stroke="#db2777" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs lb-text-muted">
        Débit WAN depuis les compteurs cumulés veip0, échantillonné ~1 min, conservé ~12h.
        Taux instantané depuis NeMo.Intf rafraîchi toutes les 3 s.
      </p>
    </Card>
  );
}
