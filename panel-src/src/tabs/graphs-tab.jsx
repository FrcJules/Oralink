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

export function GraphsTab() {
  const { data, loading, error, refresh } = useWsData("livebox/graphs");
  const [containerRef, { width, height }] = useElementSize();

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const points = (data ?? []).map((p) => ({ ...p, label: timeLabel(p.time) }));

  // Déterminer si les débits WAN différentiels sont disponibles et non-nuls —
  // ils sont calculés depuis les compteurs cumulés BytesReceived/BytesSent et
  // sont fiables même quand HomeLan.getDevicesResults ne retourne rien.
  const hasWan = points.some((p) => (p.wan_rate_rx ?? 0) > 0 || (p.wan_rate_tx ?? 0) > 0);
  const hasDevice = points.some((p) => (p.rate_rx ?? 0) > 0 || (p.rate_tx ?? 0) > 0);

  return (
    <Card title="Graphiques de trafic — débit agrégé (Mbit/s)">
      <StateBox loading={loading} error={error} />
      {data && (
        points.length < 2
          ? <p className="text-sm lb-text-muted">
              Historique en cours de constitution (un point est ajouté à chaque rafraîchissement, ~1/min).
              Revenez dans quelques minutes.
            </p>
          : <div ref={containerRef} className="h-80 w-full">
              {width > 0 && height > 0 && (
                <LineChart width={width} height={height} data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
      <p className="mt-3 text-xs lb-text-muted">
        Débit WAN calculé depuis les compteurs cumulés de la box (BytesReceived/BytesSent),
        échantillonné à chaque cycle (~1 min) et conservé en mémoire (~12h, persisté au redémarrage).
      </p>
    </Card>
  );
}
