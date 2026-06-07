import { useWsData } from "../lib/use-ws-data.js";
import { useWsCommand } from "../lib/hass-context.jsx";
import { Card, StateBox } from "../components/card.jsx";

export function NatTab() {
  const { data, loading, error, refresh } = useWsData("livebox/nat");
  const callWs = useWsCommand();

  const handleDelete = async (id) => {
    await callWs({ type: "livebox/nat_delete", id });
    refresh();
  };

  return (
    <Card title="Règles NAT / redirection de ports">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          {data.length === 0 ? (
            <p className="text-sm lb-text-muted">Aucune règle NAT configurée.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase lb-text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Description</th>
                  <th className="py-1.5 pr-3">IP destination</th>
                  <th className="py-1.5 pr-3">Port externe</th>
                  <th className="py-1.5 pr-3">Port interne</th>
                  <th className="py-1.5 pr-3">Protocole</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {data.map((rule) => (
                  <tr key={rule.id} className="border-t lb-border">
                    <td className="py-1.5 pr-3 font-medium">{rule.description ?? rule.Description ?? "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.destination_ip ?? rule.DestinationIPAddress ?? "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.external_port ?? rule.ExternalPort ?? "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.internal_port ?? rule.InternalPort ?? "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.protocol ?? rule.Protocol ?? "—"}</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  );
}
