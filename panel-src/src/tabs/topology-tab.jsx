import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";
import { TopologyGraph } from "../components/topology-graph.jsx";

export function TopologyTab() {
  const { data, loading, error } = useWsData("livebox/topology");
  const { data: devices } = useWsData("livebox/devices");
  const { data: network } = useWsData("livebox/network");

  return (
    <div className="space-y-4">
      <StateBox loading={loading || !devices || !network} error={error} />
      {data && devices && network && (
        <TopologyGraph devices={devices} network={network} topology={data} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
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

        <Card title="Rattachements">
          {data && (
            data.device_map.length === 0
              ? <p className="text-sm lb-text-muted">Tous les appareils sont rattachés directement à la Livebox.</p>
              : <ul className="space-y-1 text-sm">
                  {data.device_map.map((m) => (
                    <li key={m.device} className="flex items-center justify-between border-b lb-border py-1 last:border-0">
                      <span className="font-medium">{m.device}</span>
                      <span className="lb-text-muted">via {m.via}</span>
                    </li>
                  ))}
                </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
