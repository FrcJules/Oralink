import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Zap, X, Lock, Unlock, Pencil, Check } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

function ipSortKey(ip) {
  const parts = String(ip ?? "").split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return -1;
  return parts.reduce((acc, part) => acc * 256 + part, 0);
}

const COLUMNS = [
  { key: "name", label: "Nom", sortKey: (d) => (d.name ?? "").toLowerCase() },
  { key: "ip", label: "IP", sortKey: (d) => ipSortKey(d.ip) },
  { key: "type", label: "Type", sortKey: (d) => (d.type ?? "").toLowerCase() },
  { key: "interface", label: "Interface", sortKey: (d) => (d.interface || d.band || "").toLowerCase() },
  { key: "signal", label: "Signal", sortKey: (d) => d.signal ?? -Infinity },
  { key: "rate_rx", label: "Débit ↓", sortKey: (d) => d.rate_rx ?? -Infinity },
  { key: "rate_tx", label: "Débit ↑", sortKey: (d) => d.rate_tx ?? -Infinity },
  { key: "actions", label: "", sortKey: null },
];

function SortIcon({ active, direction }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-30" />;
  return direction === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />;
}

function Rate({ value, className, style }) {
  if (value == null) return <span className="lb-text-muted">—</span>;
  return (
    <span className={`tabular-nums ${className ?? ""}`} style={style}>
      {value} <span className="lb-text-muted">Mb/s</span>
    </span>
  );
}

function WolButton({ mac }) {
  const runAction = useWsAction();
  const [waking, setWaking] = useState(false);

  const handleWake = async () => {
    setWaking(true);
    try {
      await runAction(
        { type: "livebox/device/wake", mac },
        { success: "Paquet Wake-on-LAN envoyé." },
      );
    } finally {
      setWaking(false);
    }
  };

  return (
    <button
      onClick={handleWake}
      disabled={waking}
      title="Wake-on-LAN"
      className="rounded border lb-border p-0.5 hover:bg-[var(--secondary-background-color)] disabled:opacity-40"
    >
      <Zap className="size-3.5 lb-text-muted" />
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b lb-border py-1 text-sm last:border-0">
      <span className="lb-text-muted">{label}</span>
      <span className="font-medium lb-text">{value ?? "—"}</span>
    </div>
  );
}

function DeviceDetailDrawer({ device, onClose, onRenamed }) {
  const runAction = useWsAction();
  const [info, setInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(device.name);
  const [savingName, setSavingName] = useState(false);

  // Fetch detailed device info on mount
  useState(() => {
    (async () => {
      setInfoLoading(true);
      try {
        const result = await runAction({ type: "livebox/device/info", mac: device.mac }, {});
        setInfo(result ?? {});
      } catch { setInfo({}); } finally { setInfoLoading(false); }
    })();
    (async () => {
      setScheduleLoading(true);
      try {
        const result = await runAction({ type: "livebox/device/wan_access", mac: device.mac }, {});
        setSchedule(result ?? {});
      } catch { setSchedule({}); } finally { setScheduleLoading(false); }
    })();
  }, []);

  const isBlocked = schedule?.scheduleInfo?.override === "Disable" && schedule?.scheduleInfo?.value === "Disable";

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === device.name) { setRenaming(false); return; }
    setSavingName(true);
    try {
      await runAction(
        { type: "livebox/dns/set", mac: device.mac, hostname: trimmed },
        { success: `Appareil renommé en « ${trimmed} ».` },
      );
      setRenaming(false);
      onRenamed?.();
    } finally { setSavingName(false); }
  };

  const handleBlock = async (block) => {
    setBlocking(true);
    try {
      await runAction(
        { type: "livebox/device/wan_access/set", mac: device.mac, blocked: block },
        { success: block ? "Accès WAN bloqué." : "Accès WAN autorisé." }
      );
      const result = await runAction({ type: "livebox/device/wan_access", mac: device.mac }, {});
      setSchedule(result ?? {});
    } finally { setBlocking(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-md overflow-y-auto bg-[var(--card-background-color)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b lb-border bg-[var(--card-background-color)] p-4">
          <div className="flex-1 min-w-0 mr-2">
            {renaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(device.name); } }}
                  autoFocus
                  className="lb-input flex-1 text-sm py-0.5"
                />
                <button onClick={handleRename} disabled={savingName} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
                  <Check className="size-4" />
                </button>
                <button onClick={() => { setRenaming(false); setNewName(device.name); }} className="rounded-md p-1 hover:bg-[var(--secondary-background-color)]">
                  <X className="size-4 lb-text-muted" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-semibold lb-text truncate">{device.name}</p>
                <button onClick={() => setRenaming(true)} className="rounded p-0.5 hover:bg-[var(--secondary-background-color)] flex-shrink-0" title="Renommer">
                  <Pencil className="size-3.5 lb-text-muted" />
                </button>
              </div>
            )}
            <p className="text-xs lb-text-muted">{device.mac}</p>
          </div>
          {!renaming && (
            <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--secondary-background-color)] flex-shrink-0">
              <X className="size-5 lb-text-muted" />
            </button>
          )}
        </div>

        <div className="space-y-4 p-4">
          {/* Basic info from devices list */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Résumé</p>
            <Row label="Actif" value={device.active ? "Oui" : "Non"} />
            <Row label="IP" value={device.ip} />
            <Row label="Interface" value={device.interface || device.band} />
            <Row label="Type" value={device.type} />
            <Row label="Constructeur" value={device.manufacturer} />
            <Row label="Première vue" value={device.first_seen} />
            <Row label="Dernière connexion" value={device.last_connection} />
          </div>

          {/* WAN access control */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Accès Internet</p>
            {scheduleLoading && <p className="text-sm lb-text-muted">Chargement…</p>}
            {schedule != null && !scheduleLoading && (
              <>
                <Row label="Statut" value={
                  isBlocked ? "Bloqué" :
                  schedule.scheduleInfo ? "Accès planifié" : "Accès libre"
                } />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => handleBlock(true)} disabled={blocking || isBlocked}
                    className="flex items-center gap-1.5 rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
                    <Lock className="size-3" /> Bloquer
                  </button>
                  <button onClick={() => handleBlock(false)} disabled={blocking || !schedule.scheduleInfo}
                    className="flex items-center gap-1.5 rounded border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                    <Unlock className="size-3" /> Débloquer
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Full device info */}
          {infoLoading && <p className="text-sm lb-text-muted">Chargement des détails…</p>}
          {info && Object.keys(info).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Détails Livebox</p>
              {info.Internet != null && <Row label="Service Internet" value={info.Internet ? "Oui" : "Non"} />}
              {info.IPTV != null && <Row label="Service IPTV" value={info.IPTV ? "Oui" : "Non"} />}
              {info.Telephony != null && <Row label="Service Téléphonie" value={info.Telephony ? "Oui" : "Non"} />}
              {info.FirewallLevel && <Row label="Niveau pare-feu" value={info.FirewallLevel} />}
              {info.BootLoaderVersion && <Row label="Version BootLoader" value={info.BootLoaderVersion} />}
              {info.VendorClassID && <Row label="Classe fournisseur" value={info.VendorClassID} />}
              {info.SSID && <Row label="SSID" value={info.SSID} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DevicesTab() {
  const { data, loading, error } = useWsData("livebox/devices", {}, 3_000);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const [selectedDevice, setSelectedDevice] = useState(null);

  const handleSort = (key) => {
    setSort((s) => (s.key === key
      ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" }));
  };

  const sorted = useMemo(() => {
    if (!data) return null;
    const column = COLUMNS.find((c) => c.key === sort.key);
    const list = [...data].sort((a, b) => {
      const ka = column.sortKey(a);
      const kb = column.sortKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
    if (sort.direction === "desc") list.reverse();
    return list;
  }, [data, sort]);

  return (
    <>
      {selectedDevice && (
        <DeviceDetailDrawer
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onRenamed={() => setSelectedDevice(null)}
        />
      )}
      <Card title={`Appareils${data ? ` (${data.length})` : ""}`}>
        <StateBox loading={loading} error={error} />
        {sorted && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase lb-text-muted">
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="py-1.5 pr-3">
                      {col.sortKey ? (
                        <button
                          onClick={() => handleSort(col.key)}
                          className="inline-flex items-center gap-1 uppercase hover:lb-text"
                        >
                          {col.label}
                          <SortIcon active={sort.key === col.key} direction={sort.direction} />
                        </button>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.mac} className="border-t lb-border hover:bg-[var(--secondary-background-color)]/50">
                    <td className="py-1.5 pr-3 font-medium">
                      <span className={`mr-1.5 inline-block size-2 rounded-full ${d.active ? "bg-emerald-500" : "bg-[var(--disabled-text-color)]"}`} />
                      <button
                        onClick={() => setSelectedDevice(d)}
                        className="lb-link hover:underline text-left"
                        title="Voir les détails"
                      >
                        {d.name}
                      </button>
                    </td>
                    <td className="py-1.5 pr-3 lb-text-muted">{d.ip || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{d.type || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{d.interface || d.band || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{d.signal ?? "—"}</td>
                    <td className="py-1.5 pr-3"><Rate value={d.rate_rx} className="text-sky-600" /></td>
                    <td className="py-1.5 pr-3"><Rate value={d.rate_tx} style={{ color: "var(--lb-brand)" }} /></td>
                    <td className="py-1.5"><WolButton mac={d.mac} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
