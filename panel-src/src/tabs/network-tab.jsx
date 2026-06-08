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

function fmtBytes(b) {
  if (b == null || b === 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)} ${units[i]}`;
}

function fmtRate(mbit) {
  if (mbit == null) return "—";
  if (mbit < 0.01) return "< 0.01 Mbit/s";
  if (mbit >= 1000) return `${(mbit / 1000).toFixed(2)} Gbit/s`;
  if (mbit >= 1) return `${mbit.toFixed(2)} Mbit/s`;
  return `${(mbit * 1000).toFixed(0)} Kbit/s`;
}

const TYPE_COLOR = {
  ont: "#2563eb",   // WAN bleu
  wan: "#2563eb",
  lan: "#16a34a",   // LAN vert
  eth: "#7c3aed",   // Ethernet violet
  wif: "#f59e0b",   // Wifi orange
  wig: "#94a3b8",   // Guest gris
};

function IfaceRow({ iface }) {
  const hasRate = iface.rate_rx != null;
  const color = TYPE_COLOR[iface.type] ?? "#94a3b8";
  const maxRate = hasRate ? Math.max(iface.rate_rx, iface.rate_tx, 0.001) : 0;

  return (
    <div className="border-b lb-border py-2 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium lb-text">{iface.name}</span>
          <span className="text-xs lb-text-muted">({iface.key})</span>
        </div>
        <div className="text-right tabular-nums text-xs lb-text-muted">
          {fmtBytes(iface.rx_bytes)} / {fmtBytes(iface.tx_bytes)}
        </div>
      </div>
      {hasRate && (
        <div className="mt-1.5 flex gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs">
              <span className="lb-text-muted">↓</span>
              <span className="font-medium lb-text">{fmtRate(iface.rate_rx)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--secondary-background-color)]">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, (iface.rate_rx / maxRate) * 100)}%`,
                backgroundColor: color,
              }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs">
              <span className="lb-text-muted">↑</span>
              <span className="font-medium lb-text">{fmtRate(iface.rate_tx)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--secondary-background-color)]">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, (iface.rate_tx / maxRate) * 100)}%`,
                backgroundColor: color,
                opacity: 0.7,
              }} />
            </div>
          </div>
        </div>
      )}
      {!hasRate && (
        <div className="mt-0.5 text-xs lb-text-muted italic">
          En attente d'un second relevé…
        </div>
      )}
    </div>
  );
}

export function NetworkTab() {
  const { data, loading, error } = useWsData("livebox/network", {}, 60_000);
  const { data: liveIfaces, loading: liveLoading } = useWsData("livebox/interfaces/live", {}, 3_000);
  const { box, wan, fiber, services } = data ?? {};

  const memUsedMb = (data?.memory?.total_mb && data?.memory?.free_mb)
    ? Math.round(data.memory.total_mb - data.memory.free_mb) : null;
  const memPct = (data?.memory?.total_mb && memUsedMb != null)
    ? Math.round((memUsedMb / data.memory.total_mb) * 100) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StateBox loading={loading} error={error} />

      {/* Service badges */}
      {services && (services.internet != null || services.iptv != null || services.telephony != null) && (
        <div className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            <ServiceBadge label="Internet" active={services.internet} />
            <ServiceBadge label="IPTV" active={services.iptv} />
            <ServiceBadge label="Téléphonie" active={services.telephony} />
          </div>
        </div>
      )}

      {/* Live interface stats */}
      <Card title={
        <span className="flex items-center gap-2">
          Interfaces
          <span className="text-[10px] font-normal lb-text-muted rounded px-1.5 py-0.5 border lb-border">
            live · 3 s
          </span>
        </span>
      }>
        {liveLoading && !liveIfaces && <p className="text-sm lb-text-muted">Chargement…</p>}
        {liveIfaces && liveIfaces.length === 0 && (
          <p className="text-sm lb-text-muted">Aucune interface remontée.</p>
        )}
        {liveIfaces && liveIfaces.map((iface) => (
          <IfaceRow key={iface.key} iface={iface} />
        ))}
      </Card>

      {/* Box hardware */}
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
            <Row label="N° série" value={box.serial} />
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
      {data?.memory?.total_mb != null && (
        <Card title={`RAM${memPct != null ? ` — ${memPct}% utilisé` : ""}`}>
          <Row label="Total" value={`${data.memory.total_mb} Mo`} />
          <Row label="Utilisé" value={memUsedMb != null ? `${memUsedMb} Mo` : null} />
          <Row label="Libre" value={data.memory.free_mb != null ? `${data.memory.free_mb} Mo` : null} />
          {data.memory.cached_mb != null && <Row label="Cache" value={`${data.memory.cached_mb} Mo`} />}
          {data.memory.buffered_mb != null && <Row label="Tampons" value={`${data.memory.buffered_mb} Mo`} />}
          {memPct != null && (
            <div className="mt-2 h-2 rounded-full bg-[var(--secondary-background-color)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${memPct}%`, backgroundColor: memPct > 80 ? "#ef4444" : "#f59e0b" }}
              />
            </div>
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
    </div>
  );
}
