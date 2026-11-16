import { useEffect, useState } from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox, Row } from "../components/card.jsx";
import { Pill, Dot, Collapsible, Sparkline } from "../components/status.jsx";
import { stateLabel, firewallLabel, fiberLevel, isWifiInterface, isEmptyValue } from "../lib/labels.js";
import { formatRate, formatDbm, formatDays, frNumber, parseDate } from "../lib/format.js";

const DAY_MS = 24 * 3600 * 1000;

/** Heure courante, rafraîchie chaque minute (fenêtre « dernières 24 h »). */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const isWifiDevice = (d) => Boolean(d.band) || isWifiInterface(d.interface);

// ── Bandeau d'état ───────────────────────────────────────────────────────────

const hasWanError = (code) => !isEmptyValue(code) && !/none/i.test(String(code));

function computeStatus({ network, error }) {
  if (error) {
    return { level: "bad", title: "Impossible de joindre la Livebox", detail: String(error.message ?? error) };
  }
  const { wan = {}, fiber = {} } = network;
  const state = String(wan.state ?? "").toLowerCase();
  if (!state) return { level: "warn", title: "État de la connexion inconnu" };
  if (state !== "up") {
    return {
      level: "bad",
      title: "Internet est coupé",
      detail: [stateLabel(wan.state), hasWanError(wan.error_code) ? `code ${wan.error_code}` : null]
        .filter(Boolean).join(" · "),
    };
  }
  const fl = fiberLevel(fiber.power_rx);
  if (fl?.level === "bad") return { level: "bad", title: "Signal fibre critique : coupures probables" };
  if (fl?.level === "warn") return { level: "warn", title: "Internet fonctionne, mais le signal fibre est faible" };
  if (hasWanError(wan.error_code)) return { level: "warn", title: `Internet fonctionne (erreur signalée : ${wan.error_code})` };
  return { level: "ok", title: "Internet fonctionne normalement" };
}

const BANNER_ICON = { ok: Check, warn: AlertTriangle, bad: X };

function StatusBanner({ network, error }) {
  const status = computeStatus({ network: network ?? {}, error });
  const { wan = {}, fiber = {}, box = {} } = network ?? {};
  const fl = fiberLevel(fiber.power_rx);
  const link = stateLabel(wan.link_type);
  const subtitle = status.detail ?? [
    link || fiber.downstream_max
      ? [link ?? "Connexion", fiber.downstream_max ? formatRate(fiber.downstream_max) : null].filter(Boolean).join(" ")
      : null,
    fl ? `signal ${fl.label} (${formatDbm(fiber.power_rx)})` : null,
    box.uptime_days ? `box allumée depuis ${formatDays(box.uptime_days)}` : null,
  ].filter(Boolean).join(" · ");
  const Icon = BANNER_ICON[status.level];
  return (
    <div className={`lb-banner lb-banner-${status.level}`} role="status">
      <span className="lb-banner-icon" style={{ background: `var(--lb-${status.level})` }}>
        <Icon className="size-6" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-snug lb-text">{status.title}</p>
        {subtitle && <p className="text-sm lb-text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Cartes de chiffres ───────────────────────────────────────────────────────

function StatCard({ title, children }) {
  return (
    <div className="lb-card flex min-w-0 flex-col gap-2 p-4">
      <p className="text-sm font-medium lb-text-muted">{title}</p>
      {children}
    </div>
  );
}

function MiniRow({ label, value }) {
  if (isEmptyValue(value)) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="lb-text-muted">{label}</span>
      <span className="tabular-nums lb-text">{value}</span>
    </div>
  );
}

function LiveRateCard() {
  const { data } = useWsData("livebox/graphs", {}, 60_000);
  const points = (data ?? []).slice(-60);
  // Débit WAN (compteurs de la box) si disponible ; sinon somme des appareils.
  const hasWan = points.some((p) => (p.wan_rate_rx ?? 0) > 0 || (p.wan_rate_tx ?? 0) > 0);
  const rx = points.map((p) => (hasWan ? p.wan_rate_rx : p.rate_rx) ?? 0);
  const tx = points.map((p) => (hasWan ? p.wan_rate_tx : p.rate_tx) ?? 0);
  const last = points.length ? { rx: rx.at(-1), tx: tx.at(-1) } : null;
  return (
    <StatCard title="Débit Internet en ce moment">
      {!data && <p className="text-sm lb-text-muted">Chargement…</p>}
      {data && !last && <p className="text-sm lb-text-muted">Pas encore de mesure.</p>}
      {last && (
        <>
          <p className="text-2xl font-bold leading-tight tabular-nums lb-text">
            {formatRate(last.rx)} <span className="text-sm font-normal lb-text-muted">↓</span>
          </p>
          <p className="text-sm tabular-nums lb-text-muted">↑ {formatRate(last.tx)}</p>
          <Sparkline
            label="Débit sur la dernière heure"
            series={[
              { values: rx, color: "var(--lb-data)", area: true },
              { values: tx, color: "var(--secondary-text-color, #64748b)", dashed: true },
            ]}
          />
          <p className="text-xs lb-text-muted">
            Dernière heure{hasWan ? "" : " · trafic cumulé des appareils"}
          </p>
        </>
      )}
    </StatCard>
  );
}

const fmtShortDate = (date) => date?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function SpeedtestCard() {
  const { data, error } = useWsData("livebox/speedtest/results", {}, 600_000);
  const ds = data?.downstream;
  const us = data?.upstream;
  const date = parseDate(ds?.start ?? us?.start);
  return (
    <StatCard title="Dernier speedtest">
      {!data && !error && <p className="text-sm lb-text-muted">Chargement…</p>}
      {(error || data?.no_data) && <p className="text-sm lb-text-muted">Aucun test mémorisé par la box.</p>}
      {(ds || us) && (
        <>
          <p className="text-2xl font-bold leading-tight tabular-nums lb-text">
            {formatRate(ds?.rate_mbit)} <span className="text-sm font-normal lb-text-muted">↓</span>
          </p>
          <p className="text-sm tabular-nums lb-text-muted">↑ {formatRate(us?.rate_mbit)}</p>
          <MiniRow label="Latence" value={ds?.latency_ms != null ? `${ds.latency_ms} ms` : null} />
          <MiniRow label="Mesuré le" value={fmtShortDate(date)} />
        </>
      )}
    </StatCard>
  );
}

function DevicesCountCard({ devices }) {
  const active = (devices ?? []).filter((d) => d.active);
  const wifi = active.filter(isWifiDevice).length;
  return (
    <StatCard title="Appareils connectés">
      {!devices && <p className="text-sm lb-text-muted">Chargement…</p>}
      {devices && (
        <>
          <p className="text-2xl font-bold leading-tight tabular-nums lb-text">{active.length}</p>
          <MiniRow label="Wi-Fi" value={wifi} />
          <MiniRow label="Câble (Ethernet)" value={active.length - wifi} />
          <MiniRow label="Connus mais hors ligne" value={devices.length - active.length} />
        </>
      )}
    </StatCard>
  );
}

// ── À regarder ───────────────────────────────────────────────────────────────

function fmtWhen(date, now) {
  if (!date) return null;
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now).toDateString() === date.toDateString();
  if (today) return time;
  const yesterday = new Date(now - DAY_MS).toDateString() === date.toDateString();
  return yesterday ? `hier ${time}` : `${fmtShortDate(date)} ${time}`;
}

function WatchCard({ network }) {
  const now = useNow();
  const { data: events } = useWsData("livebox/events", {}, 60_000);
  const { data: phone } = useWsData("livebox/phone", {}, 300_000);

  const recent = (date) => date && now - date.getTime() < DAY_MS;
  const newDevices = (events ?? [])
    .filter((e) => e.event === "new")
    .map((e) => ({ ...e, date: parseDate(e.time) }))
    .filter((e) => recent(e.date));
  const missed = (phone?.missed ?? [])
    .map((c) => ({ ...c, date: parseDate(c.date) }))
    .filter((c) => recent(c.date))
    .sort((a, b) => b.date - a.date);

  const items = [];
  for (const e of newDevices.slice(0, 4)) {
    items.push({
      key: `new-${e.mac}-${e.time}`, level: "warn",
      text: <>Nouvel appareil sur le réseau : <b className="font-medium">{e.name}</b></>,
      pill: fmtWhen(e.date, now),
    });
  }
  if (newDevices.length > 4) {
    items.push({ key: "new-more", level: "warn", text: `… et ${newDevices.length - 4} autre(s) nouvel(s) appareil(s)` });
  }
  if (missed.length) {
    items.push({
      key: "missed", level: "warn",
      text: missed.length === 1
        ? <>Appel manqué{missed[0].phone_number ? <> : <span className="lb-mono">{missed[0].phone_number}</span></> : null}</>
        : `${missed.length} appels manqués`,
      pill: fmtWhen(missed[0].date, now),
    });
  }
  if (network?.guest_wifi === true) {
    items.push({ key: "guest", level: "warn", text: "Wi-Fi invité actif", pill: "à vérifier" });
  } else if (network?.guest_wifi === false) {
    items.push({ key: "guest", level: "ok", text: "Wi-Fi invité désactivé", pill: "normal" });
  }
  const fw = network?.firewall_level;
  if (fw) {
    const low = String(fw).toLowerCase() === "low";
    items.push({
      key: "fw", level: low ? "warn" : "ok",
      text: low ? "Pare-feu bas : protection minimale" : firewallLabel(fw),
      pill: low ? "à vérifier" : "normal",
    });
  }

  return (
    <Card title="À regarder">
      {items.length === 0 && <p className="text-sm lb-text-muted">Rien à signaler.</p>}
      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
            <Dot level={it.level} />
            <span className="lb-text">{it.text}</span>
            {it.pill ? <Pill level={it.level}>{it.pill}</Pill> : <span />}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs lb-text-muted">Nouveaux appareils et appels manqués des dernières 24 h.</p>
    </Card>
  );
}

// ── Qui consomme le plus en ce moment ────────────────────────────────────────

function TopConsumersCard({ devices }) {
  const top = (devices ?? [])
    .filter((d) => d.active)
    .map((d) => ({ ...d, total: (d.rate_rx ?? 0) + (d.rate_tx ?? 0) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const max = top[0]?.total ?? 0;
  return (
    <Card title="Qui consomme le plus en ce moment">
      {devices && top.length === 0 && <p className="text-sm lb-text-muted">Aucun trafic notable.</p>}
      <ul className="space-y-2">
        {top.map((d) => (
          <li key={d.mac} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium lb-text">{d.name}</span>
              <span className="whitespace-nowrap text-xs tabular-nums lb-text-muted">
                ↓ {formatRate(d.rate_rx)} · ↑ {formatRate(d.rate_tx)}
              </span>
            </div>
            <div className="mt-1 h-1 w-full rounded-full lb-surface-2">
              <div className="h-full rounded-full"
                style={{ background: "var(--lb-data)", width: `${max ? Math.max(3, (d.total / max) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs lb-text-muted">Débit moyen par appareil sur les 30 dernières secondes, rafraîchi toutes les 10 s.</p>
    </Card>
  );
}

// ── Détails techniques (repliés) ─────────────────────────────────────────────

function ServicesRows({ services }) {
  if (!services) return null;
  const v = (b) => (b == null ? null : b ? "Actif" : "Inactif");
  return (
    <>
      <Row label="Internet" value={v(services.internet)} />
      <Row label="Télévision (IPTV)" value={v(services.iptv)} />
      <Row label="Téléphonie" value={v(services.telephony)} />
    </>
  );
}

function IptvDetails() {
  const { data, loading, error } = useWsData("livebox/iptv", {}, 120_000);
  const status = data?.status;
  const config = data?.config ?? {};
  const hasData = status || Object.keys(config).length > 0;
  return (
    <>
      <StateBox loading={loading} error={error} />
      {!loading && !error && !hasData && (
        <p className="text-sm lb-text-muted">Service IPTV non disponible sur ce modèle.</p>
      )}
      {Array.isArray(status) && status.map((item, i) => (
        <div key={i} className="mb-2 rounded border lb-border p-2">
          {Object.entries(item).map(([k, val]) => <Row key={k} label={k} value={stateLabel(val)} />)}
        </div>
      ))}
      {status && typeof status === "object" && !Array.isArray(status) && (
        Object.entries(status).map(([k, val]) => <Row key={k} label={k} value={stateLabel(val)} />)
      )}
      {typeof status === "string" && <Row label="Statut" value={stateLabel(status)} />}
      {data?.multi_screens != null && (
        <Row label="Multi-écrans" value={data.multi_screens ? "Activé" : "Désactivé"} />
      )}
      <Row label="IP multicast" value={config.MulticastIPAddress} />
      {Array.isArray(config.channels) && config.channels.map((c, i) => (
        <Row
          key={`${c.ChannelType}-${c.ChannelNumber}-${i}`}
          label={`Canal ${c.ChannelType ?? ""} ${c.ChannelNumber ?? ""}`.trim()}
          value={`${c.ChannelFlags || "—"}${c.ChannelStatus === false ? " (inactif)" : ""}`}
        />
      ))}
    </>
  );
}

function ConnectionDetails() {
  const { data, loading, error } = useWsData("livebox/connection/status", {}, 60_000);
  return (
    <>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          {hasWanError(data.error_code) && <Row label="Code erreur WAN" value={data.error_code} />}
          <Row label="VLAN" value={data.vlan_id} />
          <Row label="MTU" value={data.mtu} />
          <Row label="Type de lien" value={stateLabel(data.nmc?.LinkType)} />
          <Row label="MAC WAN" value={data.nmc?.MACAddress} />
          <Row label="Identifiant PPPoE" value={data.nmc?.Username} />
          <Row label="Mode IPv6" value={data.autodetect?.Mode} />
          {data.cgnat?.Status != null && <Row label="CG-NAT" value={data.cgnat.Status ? "Actif" : "Inactif"} />}
          {data.cgnat?.Demand != null && (
            <Row label="CG-NAT (demande)" value={data.cgnat.Demand ? "Activé" : "Désactivé"} />
          )}
        </>
      )}
    </>
  );
}

function TechnicalDetails({ network }) {
  const { box, wan, fiber, services, memory } = network ?? {};
  const memUsedMb = (memory?.total_mb && memory?.free_mb) ? Math.round(memory.total_mb - memory.free_mb) : null;
  const memPct = (memory?.total_mb && memUsedMb != null) ? Math.round((memUsedMb / memory.total_mb) * 100) : null;
  const gb = (v) => (v == null ? null : `${frNumber(v, 2)} Go`);
  const mb = (v) => (v == null ? null : `${v} Mo`);
  const fl = fiberLevel(fiber?.power_rx);

  return (
    <section className="space-y-3 md:col-span-2" aria-label="Détails techniques">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide lb-text-muted">Détails techniques</h2>
      <div className="grid items-start gap-3 md:grid-cols-2">
        <Collapsible title="Box">
          {box && (
            <>
              <Row label="Modèle" value={[box.manufacturer, box.model_name || box.model].filter(Boolean).join(" ")} />
              <Row label="Version matérielle" value={box.hardware_version} />
              <Row label="Firmware" value={box.firmware} />
              <Row label="Firmware Orange" value={box.firmware_orange} />
              <Row label="Version de secours" value={box.rescue_version} />
              <Row label="N° de série" value={box.serial} />
              <Row label="MAC de base" value={box.base_mac} />
              <Row label="Pays" value={box.country} />
              <Row label="IP publique" value={box.external_ip} />
              <Row label="État" value={stateLabel(box.device_status)} />
              <Row label="Première utilisation" value={parseDate(box.first_use)?.toLocaleDateString("fr-FR")} />
              <Row label="Allumée depuis" value={box.uptime_days ? formatDays(box.uptime_days) : null} />
              <Row label="Redémarrages" value={box.reboots} />
              <ServicesRows services={services} />
            </>
          )}
        </Collapsible>

        <Collapsible title={`Mémoire${memPct != null ? ` — ${memPct} % utilisée` : ""}`}>
          {memory?.total_mb == null && <p className="text-sm lb-text-muted">Non disponible.</p>}
          {memory?.total_mb != null && (
            <>
              <Row label="Total" value={mb(memory.total_mb)} />
              <Row label="Utilisée" value={mb(memUsedMb)} />
              <Row label="Libre" value={mb(memory.free_mb)} />
              <Row label="Cache" value={mb(memory.cached_mb)} />
              <Row label="Tampons" value={mb(memory.buffered_mb)} />
              {memPct != null && (
                <div className="mt-2 h-2 rounded-full lb-surface-2">
                  <div className="h-full rounded-full"
                    style={{ width: `${memPct}%`, background: memPct > 85 ? "var(--lb-bad)" : memPct > 70 ? "var(--lb-warn)" : "var(--lb-data)" }} />
                </div>
              )}
            </>
          )}
        </Collapsible>

        <Collapsible title="Connexion Internet (WAN)">
          {wan && (
            <>
              <Row label="État" value={stateLabel(wan.state)} />
              <Row label="Type de lien" value={stateLabel(wan.link_type)} />
              <Row label="IPv4 publique" value={wan.ip} />
              <Row label="IPv6" value={wan.ipv6} />
              <Row label="Passerelle" value={wan.gateway} />
              <Row label="DNS" value={wan.dns} />
              <Row label="Total reçu" value={gb(wan.total_rx_gb)} />
              <Row label="Total envoyé" value={gb(wan.total_tx_gb)} />
            </>
          )}
        </Collapsible>

        <Collapsible title={`Fibre${fl ? ` — signal ${fl.label}` : ""}`}>
          {fiber && (
            <>
              <Row label="Puissance reçue" value={formatDbm(fiber.power_rx, 2)} />
              <Row label="Puissance émise" value={formatDbm(fiber.power_tx, 2)} />
              <Row label="Température" value={fiber.temperature != null ? `${fiber.temperature} °C` : null} />
              <Row label="État ONU" value={stateLabel(fiber.onu_state)} />
              <Row label="Débit max ↓" value={fiber.downstream_max ? formatRate(fiber.downstream_max) : null} />
              <Row label="Débit max ↑" value={fiber.upstream_max ? formatRate(fiber.upstream_max) : null} />
            </>
          )}
        </Collapsible>

        <Collapsible title="Télévision (IPTV)"><IptvDetails /></Collapsible>
        <Collapsible title="Connexion — détails"><ConnectionDetails /></Collapsible>
      </div>
    </section>
  );
}

export function OverviewTab() {
  const { data: network, loading, error } = useWsData("livebox/network", {}, 60_000);
  const { data: devices } = useWsData("livebox/devices", {}, 10_000);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        {loading && !network ? <StateBox loading /> : <StatusBanner network={network} error={error} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:col-span-2">
        <LiveRateCard />
        <SpeedtestCard />
        <DevicesCountCard devices={devices} />
      </div>

      <WatchCard network={network} />
      <TopConsumersCard devices={devices} />

      <TechnicalDetails network={network} />
    </div>
  );
}
