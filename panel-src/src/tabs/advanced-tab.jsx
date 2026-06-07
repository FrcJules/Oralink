import { useWsData } from "../lib/use-ws-data.js";
import { useWsCommand } from "../lib/hass-context.jsx";
import { Card, StateBox } from "../components/card.jsx";

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value ?? "—"}</span>
    </div>
  );
}

export function AdvancedTab() {
  const { data, loading, error, refresh } = useWsData("livebox/advanced");
  const { data: rebootHistory } = useWsData("livebox/reboot_history");
  const callWs = useWsCommand();
  const { dns, ddns, dmz, upnp, ipv6 } = data ?? {};

  const handleUpnpToggle = async (id, enabled) => {
    await callWs({ type: "livebox/upnp_toggle", id, enabled });
    refresh();
  };
  const handleUpnpDelete = async (id) => {
    await callWs({ type: "livebox/upnp_delete", id });
    refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="DNS / IPv6">
        <StateBox loading={loading} error={error} />
        {dns && (
          <>
            <Row label="Serveurs DNS" value={dns.servers} />
            <Row label="Serveurs DNS IPv6" value={dns.ipv6_servers} />
          </>
        )}
        {ipv6 && (
          <>
            <Row label="IPv6 actif" value={ipv6.enabled ? "Oui" : "Non"} />
            <Row label="Adresse IPv6" value={ipv6.address} />
            <Row label="Préfixe IPv6" value={ipv6.prefix} />
          </>
        )}
      </Card>

      <Card title="DMZ">
        {dmz && (
          <>
            <Row label="Activée" value={dmz.enabled ? "Oui" : "Non"} />
            <Row label="IP cible" value={dmz.ip} />
          </>
        )}
      </Card>

      <Card title="DynDNS">
        {ddns && (
          ddns.hosts.length === 0
            ? <p className="text-sm text-slate-500">Aucun DynDNS configuré.</p>
            : <ul className="space-y-1 text-sm">
                {ddns.hosts.map((h) => (
                  <li key={h.hostname} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                    <span className="font-medium">{h.hostname}</span>
                    <span className="text-slate-500">{h.service} · {h.status}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <Card title="UPnP">
        {upnp && (
          <>
            <Row label="Activé" value={upnp.enabled ? "Oui" : "Non"} />
            {upnp.rules.length === 0
              ? <p className="mt-2 text-sm text-slate-500">Aucune règle UPnP.</p>
              : <ul className="mt-2 space-y-1 text-sm">
                  {upnp.rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
                      <span>{r.description ?? r.id}</span>
                      <span className="flex gap-2">
                        <button onClick={() => handleUpnpToggle(r.id, !r.enabled)} className="text-xs text-blue-600 hover:underline">
                          {r.enabled ? "Désactiver" : "Activer"}
                        </button>
                        <button onClick={() => handleUpnpDelete(r.id)} className="text-xs text-red-600 hover:underline">
                          Supprimer
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>}
          </>
        )}
      </Card>

      <Card title="Historique des redémarrages">
        {rebootHistory && (
          rebootHistory.length === 0
            ? <p className="text-sm text-slate-500">Aucun historique disponible.</p>
            : <ul className="space-y-1 text-sm">
                {rebootHistory.map((entry, i) => (
                  <li key={i} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                    <span>{entry.date ?? entry.Date ?? "—"}</span>
                    <span className="text-slate-500">{entry.cause ?? entry.Cause ?? entry.reason ?? "—"}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>
    </div>
  );
}
