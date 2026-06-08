import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function timeLabel(value) {
  if (!value) return "";
  const m = String(value).match(/(\d{2}):(\d{2}):\d{2}/);
  return m ? `${m[1]}:${m[2]}` : String(value);
}

function SparkLine({ value, color, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-[var(--secondary-background-color)]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function LiveRateBadge({ points }) {
  if (!points || points.length === 0) return null;
  const latest = points[points.length - 1];
  const wanRx = latest.wan_rate_rx ?? 0;
  const wanTx = latest.wan_rate_tx ?? 0;
  const devRx = latest.rate_rx ?? 0;
  const devTx = latest.rate_tx ?? 0;

  const showWan = wanRx > 0 || wanTx > 0;
  const showDev = devRx > 0 || devTx > 0;
  if (!showWan && !showDev) return null;

  const maxRx = showWan ? wanRx : devRx;
  const maxTx = showWan ? wanTx : devTx;
  const maxAll = Math.max(maxRx, maxTx, 0.01);

  const rx = showWan ? wanRx : devRx;
  const tx = showWan ? wanTx : devTx;
  const label = showWan ? "WAN" : "Appareils";

  return (
    <div className="mb-4 flex items-stretch gap-4 rounded-xl border lb-border bg-[var(--secondary-background-color)] px-4 py-3">
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs lb-text-muted">{label} ↓</span>
          <span className="tabular-nums text-sm font-semibold" style={{ color: "#2563eb" }}>
            {rx.toFixed(2)} <span className="text-xs font-normal lb-text-muted">Mbit/s</span>
          </span>
        </div>
        <SparkLine value={rx} color="#2563eb" max={maxAll} />
      </div>
      <div className="w-px bg-[var(--divider-color)]" />
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs lb-text-muted">{label} ↑</span>
          <span className="tabular-nums text-sm font-semibold" style={{ color: "#16a34a" }}>
            {tx.toFixed(2)} <span className="text-xs font-normal lb-text-muted">Mbit/s</span>
          </span>
        </div>
        <SparkLine value={tx} color="#16a34a" max={maxAll} />
      </div>
      <div className="flex items-center pl-1">
        <span className="text-[10px] lb-text-muted">instantané</span>
      </div>
    </div>
  );
}

export function GraphsTab() {
  const { data, loading, error, refresh } = useWsData("livebox/graphs", {}, 60_000);

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
          <LiveRateBadge points={points} />

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
                  {!hasWan && !hasDevice && (
                    <Line type="monotone" dataKey="rate_rx" name="Réception" stroke="#2563eb" dot={false} strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs lb-text-muted">
        Débit WAN depuis les compteurs cumulés de l'interface veip0, échantillonné ~1 min, conservé ~12h.
      </p>
    </Card>
  );
}
