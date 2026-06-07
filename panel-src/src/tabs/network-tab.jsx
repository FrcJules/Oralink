import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b lb-border py-1 text-sm last:border-0">
      <span className="lb-text-muted">{label}</span>
      <span className="font-medium lb-text">{value ?? "—"}</span>
    </div>
  );
}

export function NetworkTab() {
  const { data, loading, error } = useWsData("livebox/network");
  const { box, wan, fiber, interfaces } = data ?? {};

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Box">
        <StateBox loading={loading} error={error} />
        {box && (
          <>
            <Row label="Modèle" value={box.model} />
            <Row label="Firmware" value={box.firmware} />
            <Row label="Uptime (jours)" value={box.uptime_days} />
            <Row label="Redémarrages" value={box.reboots} />
            <Row label="Appareils filaires" value={box.wired_devices} />
            <Row label="Appareils sans-fil" value={box.wireless_devices} />
          </>
        )}
      </Card>

      <Card title="WAN">
        {wan && (
          <>
            <Row label="État" value={wan.state} />
            <Row label="Type de lien" value={wan.link_type} />
            <Row label="IP" value={wan.ip} />
            <Row label="IPv6" value={wan.ipv6} />
            <Row label="Passerelle" value={wan.gateway} />
            <Row label="Total reçu (Go)" value={wan.total_rx_gb} />
            <Row label="Total envoyé (Go)" value={wan.total_tx_gb} />
          </>
        )}
      </Card>

      <Card title="Fibre / ONT">
        {fiber && (
          <>
            <Row label="Puissance Rx (dBm)" value={fiber.power_rx} />
            <Row label="Puissance Tx (dBm)" value={fiber.power_tx} />
            <Row label="Température (°C)" value={fiber.temperature} />
            <Row label="État ONU" value={fiber.onu_state} />
            <Row label="Débit max ↓ (Mb/s)" value={fiber.downstream_max} />
            <Row label="Débit max ↑ (Mb/s)" value={fiber.upstream_max} />
          </>
        )}
      </Card>

      <Card title="Interfaces">
        {interfaces?.map((iface) => (
          <Row key={iface.name} label={iface.name} value={`↓ ${iface.rate_rx} / ↑ ${iface.rate_tx}`} />
        ))}
      </Card>
    </div>
  );
}
