import { useState } from "react";
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

function IptvCard() {
  const { data, loading, error } = useWsData("livebox/iptv", {}, 120_000);
  const iptv_status = data?.status;
  const config = data?.config ?? {};

  const hasData = iptv_status || (config && Object.keys(config).length > 0);

  return (
    <Card title="IPTV">
      <StateBox loading={loading} error={error} />
      {!loading && !error && !hasData && (
        <p className="text-sm lb-text-muted">Service IPTV non disponible sur ce modèle.</p>
      )}
      {Array.isArray(iptv_status) && iptv_status.map((item, i) => (
        <div key={i} className="mb-2 rounded border lb-border p-2">
          {Object.entries(item).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
        </div>
      ))}
      {typeof iptv_status === "object" && !Array.isArray(iptv_status) && iptv_status && (
        Object.entries(iptv_status).map(([k, v]) => (
          <Row key={k} label={k} value={String(v)} />
        ))
      )}
      {data?.multi_screens != null && (
        <Row label="Multi-écrans" value={data.multi_screens ? "Activé" : "Désactivé"} />
      )}
      {config.MulticastIPAddress && <Row label="IP multicast" value={config.MulticastIPAddress} />}
    </Card>
  );
}

function ConnectionStatusCard() {
  const { data, loading, error } = useWsData("livebox/connection/status", {}, 60_000);

  return (
    <Card title="Connexion — détails">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          {data.error_code && data.error_code !== "None" && (
            <Row label="Code erreur WAN" value={data.error_code} />
          )}
          {data.vlan_id != null && <Row label="VLAN ID" value={data.vlan_id} />}
          {data.mtu != null && <Row label="MTU" value={data.mtu} />}
          {data.nmc?.LinkType && <Row label="Type de lien" value={data.nmc.LinkType} />}
          {data.nmc?.MACAddress && <Row label="MAC WAN" value={data.nmc.MACAddress} />}
          {data.nmc?.Username && <Row label="PPPoE utilisateur" value={data.nmc.Username} />}
          {data.autodetect?.Mode && <Row label="Mode IPv6" value={data.autodetect.Mode} />}
          {data.cgnat?.Status != null && (
            <Row label="CG-NAT" value={data.cgnat.Status ? "Actif" : "Inactif"} />
          )}
          {data.cgnat?.Demand != null && (
            <Row label="CG-NAT (demande)" value={data.cgnat.Demand ? "Activé" : "Désactivé"} />
          )}
        </>
      )}
    </Card>
  );
}

export function OverviewTab() {
  const { data, loading, error } = useWsData("livebox/network", {}, 60_000);
  const { box, wan, fiber, services, memory } = data ?? {};

  const memUsedMb = (memory?.total_mb && memory?.free_mb)
    ? Math.round(memory.total_mb - memory.free_mb) : null;
  const memPct = (memory?.total_mb && memUsedMb != null)
    ? Math.round((memUsedMb / memory.total_mb) * 100) : null;

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
      {memory?.total_mb != null && (
        <Card title={`RAM${memPct != null ? ` — ${memPct}% utilisé` : ""}`}>
          <Row label="Total" value={`${memory.total_mb} Mo`} />
          <Row label="Utilisé" value={memUsedMb != null ? `${memUsedMb} Mo` : null} />
          <Row label="Libre" value={memory.free_mb != null ? `${memory.free_mb} Mo` : null} />
          {memory.cached_mb != null && <Row label="Cache" value={`${memory.cached_mb} Mo`} />}
          {memory.buffered_mb != null && <Row label="Tampons" value={`${memory.buffered_mb} Mo`} />}
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

      <IptvCard />
      <ConnectionStatusCard />
    </div>
  );
}
