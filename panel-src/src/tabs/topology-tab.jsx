import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

/**
 * Vue topologie simplifiée (liste répéteurs + rattachements). La version
 * compilée historique (`www/tabs/topology.js`, orpheline — imports manquants)
 * dessinait un graphe interactif Cytoscape ; à réintroduire ici en composant
 * React si on veut retrouver le rendu visuel (cf. plan : roadmap §5).
 */
export function TopologyTab() {
  const { data, loading, error } = useWsData("livebox/topology");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Répéteurs Wifi">
        <StateBox loading={loading} error={error} />
        {data && (
          data.repeaters.length === 0
            ? <p className="text-sm text-slate-500">Aucun répéteur détecté.</p>
            : <ul className="space-y-1 text-sm">
                {data.repeaters.map((r) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <span>📡</span> {r.name}
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <Card title="Rattachements">
        {data && (
          data.device_map.length === 0
            ? <p className="text-sm text-slate-500">Tous les appareils sont rattachés directement à la Livebox.</p>
            : <ul className="space-y-1 text-sm">
                {data.device_map.map((m) => (
                  <li key={m.device} className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
                    <span className="font-medium">{m.device}</span>
                    <span className="text-slate-500">via {m.via}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>
    </div>
  );
}
