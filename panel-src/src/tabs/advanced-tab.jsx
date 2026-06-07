import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b lb-border py-1 text-sm last:border-0">
      <span className="lb-text-muted">{label}</span>
      <span className="font-medium lb-text">{value ?? "—"}</span>
    </div>
  );
}

export function AdvancedTab() {
  const { data, loading, error, refresh } = useWsData("livebox/advanced");
  const { data: rebootHistory } = useWsData("livebox/reboot_history");
  const runAction = useWsAction();
  const { dns, ddns, dmz, upnp, ipv6 } = data ?? {};

  const handleUpnpToggle = async (enabled) => {
    await runAction(
      { type: "livebox/upnp/toggle", enabled },
      { success: enabled ? "UPnP activé." : "UPnP désactivé." },
    );
    refresh();
  };
  const handleUpnpDelete = async (ruleId) => {
    await runAction(
      { type: "livebox/upnp/delete", rule_id: ruleId },
      { success: "Règle UPnP supprimée." },
    );
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
            ? <p className="text-sm lb-text-muted">Aucun DynDNS configuré.</p>
            : <ul className="space-y-1 text-sm">
                {ddns.hosts.map((h) => (
                  <li key={h.hostname} className="flex justify-between border-b lb-border py-1 last:border-0">
                    <span className="font-medium">{h.hostname}</span>
                    <span className="lb-text-muted">{h.service} · {h.status}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <Card title="UPnP">
        {upnp && (
          <>
            <div className="flex items-center justify-between border-b lb-border py-1 text-sm">
              <span className="lb-text-muted">Activé</span>
              <span className="flex items-center gap-2">
                <span className="font-medium lb-text">{upnp.enabled ? "Oui" : "Non"}</span>
                <button onClick={() => handleUpnpToggle(!upnp.enabled)} className="lb-link text-xs hover:underline">
                  {upnp.enabled ? "Désactiver" : "Activer"}
                </button>
              </span>
            </div>
            {upnp.rules.length === 0
              ? <p className="mt-2 text-sm lb-text-muted">Aucune règle UPnP.</p>
              : <ul className="mt-2 space-y-1 text-sm">
                  {upnp.rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between border-b lb-border py-1 last:border-0">
                      <span>{r.name ?? r.id}</span>
                      <button onClick={() => handleUpnpDelete(r.id)} className="text-xs text-red-600 hover:underline">
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>}
          </>
        )}
      </Card>

      <Card title="Historique des redémarrages">
        {rebootHistory && (
          rebootHistory.length === 0
            ? <p className="text-sm lb-text-muted">Aucun historique disponible.</p>
            : <ul className="space-y-1 text-sm">
                {rebootHistory.map((entry, i) => (
                  <li key={i} className="flex justify-between border-b lb-border py-1 last:border-0">
                    <span>{entry.boot_date ?? "—"}</span>
                    <span className="lb-text-muted">{entry.boot_reason ?? "—"}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>
    </div>
  );
}
