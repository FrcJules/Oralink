import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

function RenameRow({ lease, onSaved, onCancel }) {
  const runAction = useWsAction();
  const [name, setName] = useState(lease.name || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/dns/set", mac: lease.mac, hostname: name.trim() },
        { success: `Appareil renommé en « ${name.trim()} ».` },
      );
      onSaved();
    } catch {
      // déjà notifié par le toast d'erreur de useWsAction
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-t lb-border bg-[var(--secondary-background-color)]">
      <td colSpan={4} className="py-1.5 pr-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de l'appareil"
            autoFocus
            className="lb-input flex-1"
          />
          <button type="submit" disabled={saving || !name.trim()} className="lb-btn-primary px-2.5 py-1 text-xs">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={onCancel} className="lb-btn-outline px-2.5 py-1 text-xs">
            Annuler
          </button>
        </form>
      </td>
    </tr>
  );
}

function LeaseTable({ leases, empty, onRefresh }) {
  const [editing, setEditing] = useState(null);

  if (!leases?.length) return <p className="text-sm lb-text-muted">{empty}</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase lb-text-muted">
        <tr>
          <th className="py-1.5 pr-3">Nom</th>
          <th className="py-1.5 pr-3">IP</th>
          <th className="py-1.5 pr-3">MAC</th>
          <th className="py-1.5 pr-3" />
        </tr>
      </thead>
      <tbody>
        {leases.map((l, i) => (
          editing === (l.mac || i)
            ? <RenameRow
                key={l.mac || i}
                lease={l}
                onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); onRefresh(); }}
              />
            : <tr key={l.mac || i} className="border-t lb-border">
                <td className="py-1.5 pr-3 font-medium">{l.name || "—"}</td>
                <td className="py-1.5 pr-3 lb-text-muted">{l.ip || "—"}</td>
                <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{l.mac || "—"}</td>
                <td className="py-1.5 pr-3 text-right">
                  {l.mac && (
                    <button onClick={() => setEditing(l.mac || i)} className="text-xs lb-text-muted hover:underline">
                      ✏️ Renommer
                    </button>
                  )}
                </td>
              </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DhcpTab() {
  const { data, loading, error, refresh } = useWsData("livebox/dhcp");

  return (
    <div className="grid gap-4">
      <Card title="Baux actifs">
        <StateBox loading={loading} error={error} />
        <p className="mb-2 text-xs lb-text-muted">
          Le nom est celui que la Livebox connaît pour chaque appareil
          (« nom personnalisé » côté box) — le renommer ici le change partout
          dans Oralink (Appareils, Topologie…) et pour tout le monde.
        </p>
        {data && <LeaseTable leases={data.active} empty="Aucun bail actif." onRefresh={refresh} />}
      </Card>
      <Card title="Baux statiques (réservations)">
        {data && <LeaseTable leases={data.static} empty="Aucune réservation DHCP statique." onRefresh={refresh} />}
      </Card>
      <Card title="Wifi invité">
        {data && <LeaseTable leases={data.guest} empty="Aucun appareil sur le Wifi invité." onRefresh={refresh} />}
      </Card>
    </div>
  );
}
