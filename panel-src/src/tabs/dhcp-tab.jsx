import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function LeaseTable({ leases, empty }) {
  if (!leases?.length) return <p className="text-sm lb-text-muted">{empty}</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase lb-text-muted">
        <tr>
          <th className="py-1.5 pr-3">Nom</th>
          <th className="py-1.5 pr-3">IP</th>
          <th className="py-1.5 pr-3">MAC</th>
        </tr>
      </thead>
      <tbody>
        {leases.map((l, i) => (
          <tr key={l.mac || i} className="border-t lb-border">
            <td className="py-1.5 pr-3 font-medium">{l.name || "—"}</td>
            <td className="py-1.5 pr-3 lb-text-muted">{l.ip || "—"}</td>
            <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{l.mac || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DhcpTab() {
  const { data, loading, error } = useWsData("livebox/dhcp");

  return (
    <div className="grid gap-4">
      <Card title="Baux actifs">
        <StateBox loading={loading} error={error} />
        {data && <LeaseTable leases={data.active} empty="Aucun bail actif." />}
      </Card>
      <Card title="Baux statiques (réservations)">
        {data && <LeaseTable leases={data.static} empty="Aucune réservation DHCP statique." />}
      </Card>
      <Card title="Wifi invité">
        {data && <LeaseTable leases={data.guest} empty="Aucun appareil sur le Wifi invité." />}
      </Card>
    </div>
  );
}
