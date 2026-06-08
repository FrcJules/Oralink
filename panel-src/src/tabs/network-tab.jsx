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

function ServiceBadge({ label, active }) {
  if (active == null) return null;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
      active
        ? "bg-emerald-100 text-emerald-800"
        : "bg-[var(--secondary-background-color)] lb-text-muted"
    }`}>
      <span className={`size-2 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
      {label}
    </div>
  );
}

function MemBar({ label, usedMb, totalMb, color }) {
  const pct = totalMb > 0 ? Math.min(100, ((totalMb - usedMb) / totalMb) * 100) : 0;
  return (
    <div className="py-1">
      <div className="flex justify-between text-sm">
        <span className="lb-text-muted">{label}</span>
        <span className="font-medium lb-text">{usedMb != null ? `${usedMb} Mo` : "—"}</span>
      </div>
      {totalMb > 0 && (
        <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--secondary-background-color)]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

export function NetworkTab() {
  const { data, loading, error } = useWsData("livebox/network", {}, 60_000);
  const { box, wan, fiber, interfaces, memory, services } = data ?? {};

  const memUsedMb = (memory?.total_mb && memory?.free_mb)
    ? Math.round(memory.total_mb - memory.free_mb)
    : null;
  const memPct = (memory?.total_mb && memUsedMb != null)
    ? Math.round((memUsedMb / memory.total_mb) * 100)
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StateBox loading={loading} error={error} />

      {/* Services */}
      {services && (services.internet != null || services.iptv != null || services.telephony != null) && (
        <div className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <ServiceBadge label="Internet" active={services.internet} />
            <ServiceBadge label="IPTV" active={services.iptv} />
            <ServiceBadge label="Téléphonie" active={services.telephony} />
          </div>
        </div>
      )}

      {/* Box hardware info */}
      <Card title="Box">
        {box && (
          <>
            <Row label="Fabricant" value={box.manufacturer} />
            <Row label="Modèle" value={box.model} />
            <Row label="Nom modèle" value={box.model_name} />
            <Row label="Version matérielle" value={box.hardware_version} />
            <Row label="Firmware" value={box.firmware} />
            <Row label="Firmware Orange" value={box.firmware_orange} />
            <Row label="Version rescue" value={box.rescue_version} />
            <Row label="Numéro de série" value={box.serial} />
            <Row label="MAC de base" value={box.base_mac} />
            <Row label="Pays" value={box.country} />
            <Row label="IP externe" value={box.external_ip} />
            <Row label="Statut" value={box.device_status} />
            <Row label="Première utilisation" value={box.first_use} />
            <Row label="Uptime" value={box.uptime_days != null ? `${box.uptime_days} j` : null} />
            <Row label="Redémarrages" value={box.reboots} />
            <Row label="Appareils filaires" value={box.wired_devices} />
            <Row label="Appareils sans-fil" value={box.wireless_devices} />
          </>
        )}
      </Card>

      {/* RAM */}
      {memory && memory.total_mb != null && (
        <Card title={`RAM${memPct != null ? ` — ${memPct}% utilisé` : ""}`}>
          <Row label="Total" value={memory.total_mb != null ? `${memory.total_mb} Mo` : null} />
          <MemBar
            label="Utilisé"
            usedMb={memUsedMb}
            totalMb={memory.total_mb}
            color="#f59e0b"
          />
          <MemBar
            label="Libre"
            usedMb={memory.free_mb}
            totalMb={memory.total_mb}
            color="#10b981"
          />
          {memory.cached_mb != null && (
            <Row label="Cache" value={`${memory.cached_mb} Mo`} />
          )}
          {memory.buffered_mb != null && (
            <Row label="Tampons" value={`${memory.buffered_mb} Mo`} />
          )}
        </Card>
      )}

      {/* WAN */}
      <Card title="WAN">
        {wan && (
          <>
            <Row label="État" value={wan.state} />
            <Row label="Type de lien" value={wan.link_type} />
            <Row label="IP" value={wan.ip} />
            <Row label="IPv6" value={wan.ipv6} />
            <Row label="Passerelle" value={wan.gateway} />
            <Row label="DNS" value={wan.dns} />
            <Row label="Total reçu (Go)" value={wan.total_rx_gb} />
            <Row label="Total envoyé (Go)" value={wan.total_tx_gb} />
          </>
        )}
      </Card>

      {/* Fiber */}
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

      {/* Interfaces */}
      <Card title="Interfaces">
        {interfaces && (
          interfaces.length === 0
            ? <p className="text-sm lb-text-muted">Aucune interface remontée.</p>
            : <>
                {interfaces.map((iface) => (
                  <Row key={iface.name} label={iface.name} value={`↓ ${iface.rate_rx} Mb/s / ↑ ${iface.rate_tx} Mb/s`} />
                ))}
                {interfaces.every((i) => i.rate_rx === 0 && i.rate_tx === 0) && (
                  <p className="mt-2 text-xs lb-text-muted">
                    Débits par interface à 0 — limitation firmware (HomeLan.getResults non disponible sur ce modèle).
                    Le débit réel est visible dans l'onglet Graphiques.
                  </p>
                )}
              </>
        )}
      </Card>
    </div>
  );
}
