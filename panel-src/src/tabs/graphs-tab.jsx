import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function timeLabel(value) {
  if (!value) return "";
  const m = String(value).match(/(\d{2}):(\d{2}):\d{2}/);
  return m ? `${m[1]}:${m[2]}` : String(value);
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function LiveRateBar({ points }) {
  if (!points || points.length === 0) return null;
  const latest = points[points.length - 1];
  const wanRx = latest.wan_rate_rx ?? latest.rate_rx ?? 0;
  const wanTx = latest.wan_rate_tx ?? latest.rate_tx ?? 0;
  const devRx = latest.rate_rx ?? 0;
  const devTx = latest.rate_tx ?? 0;

  const Stat = ({ label, value, color }) => (
    <div className="flex flex-col items-center rounded-lg border lb-border px-4 py-2 min-w-[100px]">
      <span className="text-xs lb-text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums" style={{ color }}>
        {value.toFixed(2)}
      </span>
      <span className="text-xs lb-text-muted">Mbit/s</span>
    </div>
  );

  const showWan = wanRx > 0 || wanTx > 0;
  const showDev = devRx > 0 || devTx > 0;

  if (!showWan && !showDev) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {showWan && (
        <>
          <Stat label="WAN ↓" value={wanRx} color="#2563eb" />
          <Stat label="WAN ↑" value={wanTx} color="#16a34a" />
        </>
      )}
      {showDev && !showWan && (
        <>
          <Stat label="Appareils ↓" value={devRx} color="#7c3aed" />
          <Stat label="Appareils ↑" value={devTx} color="#db2777" />
        </>
      )}
    </div>
  );
}

export function GraphsTab() {
  const { data, loading, error, refresh } = useWsData("livebox/graphs", {}, 60_000);
  const [containerRef, { width, height }] = useElementSize();

  const points = (data ?? []).map((p) => ({ ...p, label: timeLabel(p.time) }));

  const hasWan = points.some((p) => (p.wan_rate_rx ?? 0) > 0 || (p.wan_rate_tx ?? 0) > 0);
  const hasDevice = points.some((p) => (p.rate_rx ?? 0) > 0 || (p.rate_tx ?? 0) > 0);

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
          <LiveRateBar points={points} />

          {points.length < 2 ? (
            <p className="text-sm lb-text-muted">
              Historique en cours de constitution — un point est ajouté à chaque rafraîchissement coordinator (~1 min).
              {points.length === 1
                ? " Premier point enregistré, encore 1 cycle avant d'afficher la courbe."
                : " Revenez dans quelques minutes."}
            </p>
          ) : (
            <div ref={containerRef} className="h-72 w-full">
              {width > 0 && height > 0 && (
                <LineChart width={width} height={height} data={points} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} unit=" Mb/s" width={70} />
                  <Tooltip formatter={(value) => `${value} Mbit/s`} />
                  <Legend />
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
              )}
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs lb-text-muted">
        Débit WAN depuis les compteurs cumulés (BytesReceived/BytesSent) de l'interface veip0,
        échantillonné toutes les ~1 min, conservé ~12h (persisté entre redémarrages).
        Si WAN = 0, la box nécessite un redémarrage complet de HA pour charger la mise à jour.
      </p>
    </Card>
  );
}
