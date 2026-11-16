import { useMemo, useState } from "react";
import { Ban, Globe, Pin, Zap, Pencil, Check } from "lucide-react";
import { useWsAction } from "../lib/use-ws-action.js";
import { useConfirm } from "../lib/confirm-context.jsx";
import { renderDeviceIcon, deviceTypeLabel } from "../lib/device-types.jsx";
import { interfaceLabel, isWifiInterface, signalQuality } from "../lib/labels.js";
import { formatRate, formatSignal } from "../lib/format.js";
import { Pill } from "./status.jsx";
import { DeviceDetailDrawer } from "./device-table.jsx";

/** Au-delà de ce débit cumulé (↓ + ↑, Mbit/s), un appareil est « très actif ». */
const HOT_RATE_MBIT = 50;

const isWifiDevice = (d) => Boolean(d.band) || isWifiInterface(d.interface);

/**
 * Groupe d'affichage d'un appareil : port LAN, bande Wi-Fi, répéteur, ou
 * « Hors ligne ». `order` trie les groupes (câble, Wi-Fi, répéteurs…).
 */
function groupOf(d, viaMap, repeaterNames) {
  if (!d.active) return { key: "offline", label: "Hors ligne", order: 9 };
  const via = viaMap.get(d.mac);
  if (via) return { key: `rep-${via}`, label: `Répéteur · ${repeaterNames.get(via) ?? via}`, order: 3 };
  const label = interfaceLabel(d.interface, d.band);
  if (isWifiDevice(d)) return { key: `wifi-${label}`, label: label ?? "Wi-Fi", order: 2 };
  if (/^eth/i.test(d.interface ?? "")) return { key: `eth-${label}`, label: `Câble · ${label}`, order: 1 };
  return { key: "other", label: label ? `Autre · ${label}` : "Autres", order: 8 };
}

function ActionButton({ icon: Icon, children, onClick, busy, title, tone }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      className={`lb-chip ${tone === "danger" ? "lb-chip-danger" : ""}`}
    >
      <Icon className="size-3.5" />
      {busy ? "…" : children}
    </button>
  );
}

function DeviceCard({ device: d, isNew, onOpen, onRename, onChanged }) {
  const runAction = useWsAction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  const wifi = isWifiDevice(d);
  const total = (d.rate_rx ?? 0) + (d.rate_tx ?? 0);
  const hot = d.active && total > HOT_RATE_MBIT;
  const signal = wifi ? formatSignal(d.signal) : null;
  const signalLevel = signalQuality(d.signal)?.level;

  const pill = !d.active ? <Pill level="neutral">hors ligne</Pill>
    : d.wan_blocked ? <Pill level="bad">Internet coupé</Pill>
    : isNew ? <Pill level="warn">nouveau</Pill>
    : hot ? <Pill level="warn">très actif</Pill>
    : <Pill level="ok">en ligne</Pill>;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); onChanged?.(); } catch { /* toast déjà affiché par useWsAction */ } finally { setBusy(null); }
  };

  const toggleInternet = async () => {
    const block = !d.wan_blocked;
    if (block && !(await confirm({
      title: "Couper Internet ?",
      message: `« ${d.name} » restera connecté au réseau local mais n'aura plus accès à Internet, jusqu'à ce que vous le rétablissiez.`,
      confirmLabel: "Couper Internet",
      danger: true,
    }))) return;
    await run("wan", () => runAction(
      { type: "livebox/device/wan_access/set", mac: d.mac, blocked: block },
      { success: block ? `Internet coupé pour « ${d.name} ».` : `Internet rétabli pour « ${d.name} ».` },
    ));
  };

  const reserveIp = async () => {
    if (!(await confirm({
      title: "Réserver cette adresse IP ?",
      message: `La box attribuera toujours ${d.ip} à « ${d.name} » (bail DHCP statique).`,
      confirmLabel: "Réserver",
    }))) return;
    await run("ip", () => runAction(
      { type: "livebox/dhcp_static/add", mac: d.mac, ip: d.ip, name: d.name },
      { success: `${d.ip} réservée pour « ${d.name} ».` },
    ));
  };

  const wake = () => run("wake", () => runAction(
    { type: "livebox/device/wake", mac: d.mac },
    { success: `Paquet Wake-on-LAN envoyé à « ${d.name} ».` },
  ));

  return (
    <div
      className="lb-device-card flex min-w-0 flex-col gap-2 p-3"
      style={hot ? { borderColor: "color-mix(in srgb, var(--lb-warn) 55%, var(--divider-color, #e2e8f0))" } : undefined}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg lb-text-muted"
          style={{ background: "var(--card-background-color, #fff)" }}
          title={deviceTypeLabel(d.type) ?? undefined}>
          {renderDeviceIcon(d.type, "size-[18px]")}
        </span>
        <div className="min-w-0">
          <button onClick={onOpen} title="Voir les détails"
            className="block w-full truncate text-left text-sm font-medium lb-text hover:underline">
            {d.name}
          </button>
          <span className="block truncate text-xs lb-mono lb-text-muted">{d.ip || d.mac}</span>
        </div>
        {pill}
      </div>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums lb-text-muted">
        {d.active ? (
          <>
            <span>↓ {formatRate(d.rate_rx)}</span>
            <span>↑ {formatRate(d.rate_tx)}</span>
          </>
        ) : <span>{interfaceLabel(d.interface, d.band) ?? "—"}</span>}
      </div>
      {signal && d.active && (
        <p className="text-xs lb-text-muted">
          Signal <span className={signalLevel === "ok" ? "lb-text" : ""}
            style={signalLevel && signalLevel !== "ok" ? { color: `var(--lb-${signalLevel === "bad" ? "bad" : "warn-text"})` } : undefined}>
            {signal}
          </span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <ActionButton
          icon={d.wan_blocked ? Globe : Ban}
          tone={d.wan_blocked ? undefined : "danger"}
          busy={busy === "wan"}
          onClick={toggleInternet}
          title={d.wan_blocked ? "Rétablir l'accès à Internet" : "Couper l'accès à Internet"}
        >
          {d.wan_blocked ? "Rétablir Internet" : "Couper Internet"}
        </ActionButton>
        {d.static_ip ? (
          <span className="inline-flex items-center gap-1 px-1 py-1 text-xs lb-text-muted" title="Bail DHCP statique">
            <Check className="size-3.5" /> IP fixe
          </span>
        ) : d.ip && d.active ? (
          <ActionButton icon={Pin} busy={busy === "ip"} onClick={reserveIp} title="Réserver cette IP (bail statique)">
            IP fixe
          </ActionButton>
        ) : null}
        {!wifi && (
          <ActionButton icon={Zap} busy={busy === "wake"} onClick={wake} title="Wake-on-LAN">Réveiller</ActionButton>
        )}
        <ActionButton icon={Pencil} onClick={onRename} title="Renommer l'appareil">Renommer</ActionButton>
      </div>
    </div>
  );
}

/**
 * Vue « cartes » de l'onglet Appareils, regroupée par port LAN / bande Wi-Fi /
 * répéteur. `topology` (livebox/topology) et `parentOverrides`
 * (livebox/topology/parents) placent les appareils derrière un répéteur,
 * comme la topologie et l'onglet Répéteurs.
 */
export function DeviceCards({ devices, topology, parentOverrides, newMacs, onChanged }) {
  const [drawer, setDrawer] = useState(null); // { device, rename }

  const groups = useMemo(() => {
    const viaMap = new Map((topology?.device_map ?? []).map((e) => [e.device, e.via]));
    for (const [mac, parent] of Object.entries(parentOverrides ?? {})) {
      if (parent) viaMap.set(mac, parent);
      else viaMap.delete(mac);
    }
    const repeaterNames = new Map((topology?.repeaters ?? []).map((r) => [r.key, r.name]));
    const byKey = new Map();
    for (const d of devices) {
      const g = groupOf(d, viaMap, repeaterNames);
      if (!byKey.has(g.key)) byKey.set(g.key, { ...g, devices: [] });
      byKey.get(g.key).devices.push(d);
    }
    const list = [...byKey.values()];
    for (const g of list) g.devices.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
    return list.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr", { numeric: true }));
  }, [devices, topology, parentOverrides]);

  return (
    <>
      {drawer && (
        <DeviceDetailDrawer
          device={drawer.device}
          startRenaming={drawer.rename}
          onClose={() => setDrawer(null)}
          onRenamed={() => { setDrawer(null); onChanged?.(); }}
        />
      )}
      <div className="flex-1 space-y-5 overflow-y-auto lb-scroll">
        {groups.length === 0 && <p className="text-sm lb-text-muted">Aucun appareil.</p>}
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider lb-text-muted">
              {g.label} <span className="tabular-nums">· {g.devices.length}</span>
            </h3>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }}>
              {g.devices.map((d) => (
                <DeviceCard
                  key={d.mac}
                  device={d}
                  isNew={newMacs.has(d.mac)}
                  onOpen={() => setDrawer({ device: d, rename: false })}
                  onRename={() => setDrawer({ device: d, rename: true })}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
