import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

export function DevicesTab() {
  const { data, loading, error, refresh } = useWsData("livebox/devices");

  return (
    <Card
      title={`Appareils${data ? ` (${data.length})` : ""}`}
      actions={
        <button onClick={refresh} className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]">
          ↻ Rafraîchir
        </button>
      }
    >
      <StateBox loading={loading} error={error} />
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase lb-text-muted">
              <tr>
                <th className="py-1.5 pr-3">Nom</th>
                <th className="py-1.5 pr-3">IP</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3">Interface</th>
                <th className="py-1.5 pr-3">Signal</th>
                <th className="py-1.5 pr-3">↓ / ↑</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.mac} className="border-t lb-border">
                  <td className="py-1.5 pr-3 font-medium">
                    <span className={`mr-1.5 inline-block size-2 rounded-full ${d.active ? "bg-emerald-500" : "bg-[var(--disabled-text-color)]"}`} />
                    {d.name}
                  </td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.ip || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.type || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.interface || d.band || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.signal ?? "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">
                    {d.rate_rx ?? "—"} / {d.rate_tx ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
