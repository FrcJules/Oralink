import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function timeLabel(value) {
  if (!value) return "";
  const m = String(value).match(/(\d{2}):(\d{2}):\d{2}/);
  return m ? `${m[1]}:${m[2]}` : String(value);
}

export function GraphsTab() {
  const { data, loading, error } = useWsData("livebox/graphs");
  const points = (data ?? []).map((p) => ({ ...p, label: timeLabel(p.time) }));

  return (
    <Card title="Graphiques de trafic — débit agrégé (Mbit/s)">
      <StateBox loading={loading} error={error} />
      {data && (
        points.length < 2
          ? <p className="text-sm text-slate-500">
              Historique en cours de constitution (un point est ajouté à chaque rafraîchissement, ~1/min).
              Revenez dans quelques minutes.
            </p>
          : <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} unit=" Mb/s" width={70} />
                  <Tooltip formatter={(value) => `${value} Mbit/s`} />
                  <Legend />
                  <Line type="monotone" dataKey="rate_rx" name="Réception" stroke="#2563eb" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="rate_tx" name="Émission" stroke="#16a34a" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Somme des débits instantanés de tous les appareils connectés, échantillonnée à
        chaque cycle de rafraîchissement (~1 minute) et conservée en mémoire (~12h).
        L'historique est réinitialisé au redémarrage de Home Assistant.
      </p>
    </Card>
  );
}
