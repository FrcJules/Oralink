import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

export function EventsTab() {
  const { data, loading, error } = useWsData("livebox/events");

  return (
    <Card title="Journal d'événements — connexions et déconnexions">
      <StateBox loading={loading} error={error} />
      <p className="mb-3 text-xs text-slate-500">
        Détecté en comparant l'état des appareils entre deux rafraîchissements
        (~1 minute). Pour être notifié en temps réel (ex. par email), créez une
        automatisation Home Assistant qui se déclenche sur les capteurs de
        présence des appareils suivis par cette intégration.
      </p>
      {data && (
        data.length === 0
          ? <p className="text-sm text-slate-500">Aucun événement détecté pour le moment.</p>
          : <ul className="space-y-1 text-sm">
              {data.map((e, i) => (
                <li key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
                  <span className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${e.event === "connected" ? "bg-emerald-500" : "bg-slate-400"}`} />
                    <span className="font-medium text-slate-900">{e.name}</span>
                    <span className="text-xs text-slate-500">({e.mac})</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {e.event === "connected" ? "Connecté" : "Déconnecté"} · {e.time}
                  </span>
                </li>
              ))}
            </ul>
      )}
    </Card>
  );
}
