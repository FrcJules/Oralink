import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";
import { TopologyGraph } from "../components/topology-graph.jsx";

// Le rattachement de chaque appareil à son répéteur (qui est déjà "via" qui)
// est visible directement dans le graphe ci-dessous (nœuds à bordure
// pointillée bleue + traits de connexion), en cliquant sur un appareil pour
// voir/forcer son relais parent — pas besoin d'une seconde liste à plat en
// plus du graphe, qui ne faisait que dupliquer la même information de façon
// moins lisible.
export function TopologyTab() {
  const { data, loading, error } = useWsData("livebox/topology");
  const { data: devices } = useWsData("livebox/devices");

  return (
    <div className="space-y-4">
      <StateBox loading={loading || !devices} error={error} />
      {data && devices && (
        <TopologyGraph devices={devices} topology={data} />
      )}

      <Card title="Répéteurs Wifi">
        {data && (
          data.repeaters.length === 0
            ? <p className="text-sm lb-text-muted">Aucun répéteur détecté.</p>
            : <ul className="space-y-1 text-sm">
                {data.repeaters.map((r) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <span>📡</span> {r.name}
                  </li>
                ))}
              </ul>
        )}
      </Card>
    </div>
  );
}
