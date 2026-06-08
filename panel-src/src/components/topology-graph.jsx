import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CircleHelp, Monitor, Laptop, Smartphone, Tablet, Tv, HardDrive, Printer,
  Gamepad2, Wifi, Network, Router, Radio, Plug, Camera, Server, House, Globe,
  Box as BoxIcon, RotateCcw,
} from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsCommand } from "../lib/hass-context.jsx";
import { useWsAction } from "../lib/use-ws-action.js";

// ── Icônes d'appareils (reprend la table de l'ancien panel React) ───────────

const DEVICE_ICON_OPTIONS_MAP = {
  generic: { key: "generic", label: "Générique", Icon: CircleHelp },
  monitor: { key: "monitor", label: "Ordinateur", Icon: Monitor },
  laptop: { key: "laptop", label: "Portable", Icon: Laptop },
  smartphone: { key: "smartphone", label: "Téléphone", Icon: Smartphone },
  tablet: { key: "tablet", label: "Tablette", Icon: Tablet },
  tv: { key: "tv", label: "TV / Décodeur", Icon: Tv },
  storage: { key: "storage", label: "Stockage / NAS", Icon: HardDrive },
  printer: { key: "printer", label: "Imprimante", Icon: Printer },
  gamepad: { key: "gamepad", label: "Console", Icon: Gamepad2 },
  accessPoint: { key: "accessPoint", label: "Borne WiFi", Icon: Wifi },
  switch: { key: "switch", label: "Switch réseau", Icon: Network },
  router: { key: "router", label: "Routeur", Icon: Router },
  repeater: { key: "repeater", label: "Répéteur", Icon: Radio },
  plug: { key: "plug", label: "Prise / CPL", Icon: Plug },
  camera: { key: "camera", label: "Caméra", Icon: Camera },
  server: { key: "server", label: "Serveur", Icon: Server },
  home: { key: "home", label: "Maison / Smart", Icon: House },
  globe: { key: "globe", label: "Internet", Icon: Globe },
  box: { key: "box", label: "Box / Décodeur", Icon: BoxIcon },
};

const DEVICE_TYPE_TO_ICON_KEY = {
  Computer: "monitor",
  "Desktop iOS": "monitor",
  "Desktop Windows": "monitor",
  "Desktop Linux": "monitor",
  Laptop: "laptop",
  "Laptop iOS": "laptop",
  "Laptop Windows": "laptop",
  "Laptop Linux": "laptop",
  "Mobile iOS": "smartphone",
  Mobile: "smartphone",
  "Mobile Android": "smartphone",
  "Tablet iOS": "tablet",
  Tablet: "tablet",
  "Tablet Android": "tablet",
  "Tablet Windows": "tablet",
  TV: "tv",
  TVKey: "tv",
  "Apple TV": "tv",
  NAS: "storage",
  Nas: "storage",
  Printer: "printer",
  "Game Console": "gamepad",
  Switch: "switch",
  Switch4: "switch",
  Switch8: "switch",
  "Access Point": "accessPoint",
  HomePlug: "plug",
  "Set-top Box TV UHD": "tv",
  "Set-top Box": "box",
  Server: "server",
  Router: "router",
  Repeater: "repeater",
};

function isSwitchDevice(type) {
  return !!type && /^Switch(\d+)?$/i.test(type);
}

function deviceIconKey(type) {
  if (!type) return "generic";
  if (Object.hasOwn(DEVICE_ICON_OPTIONS_MAP, type)) return type;
  return DEVICE_TYPE_TO_ICON_KEY[type] ?? "generic";
}

function renderDeviceIcon(source, className = "h-4 w-4") {
  const key = source && Object.hasOwn(DEVICE_ICON_OPTIONS_MAP, source) ? source : DEVICE_TYPE_TO_ICON_KEY[source];
  const { Icon } = DEVICE_ICON_OPTIONS_MAP[key ?? "generic"];
  return <Icon className={className} />;
}

// ── Libellés d'interfaces ────────────────────────────────────────────────────

const PORT_LABELS = {
  ETH0: "LAN 2.5G", ETH1: "LAN 1", ETH2: "LAN 2", ETH3: "LAN 3", ETH4: "LAN 4",
  eth0: "LAN 2.5G", eth1: "LAN 1", eth2: "LAN 2", eth3: "LAN 3", eth4: "LAN 4",
};
const WIFI_LABELS = {
  vap2g0priv0: "2.4 GHz", vap2g0priv1: "2.4 GHz",
  vap5g0priv0: "5 GHz", vap5g0priv1: "5 GHz",
  vap6g0priv0: "6 GHz",
  wlan0: "2.4 GHz", wl0: "5 GHz",
  wlguest2: "2.4 GHz (Invité)", wlguest5: "5 GHz (Invité)",
};

function isWifi(iface) {
  return !!(iface && (iface.startsWith("vap") || iface.startsWith("wl")));
}
function ifaceLabel(iface) {
  return WIFI_LABELS[iface] ?? PORT_LABELS[iface] ?? iface;
}
function ifaceIcon(iface) {
  if (!iface || iface === "__other__") return "generic";
  if (isWifi(iface)) return "accessPoint";
  if (iface.startsWith("eth") || iface.startsWith("ETH")) return "plug";
  return "generic";
}

// ── Disposition du graphe (grille, mêmes constantes que l'ancien panel) ─────

const INW = 152, INH = 54;
const LBW = 156, LBH = 64;
const IFW = 132, IFH = 50;
const DEW = 150, DEH = 54;
const HG = 12, IG = 18, VG = 54, VDG = 18;
const MAX_COLS = 5;
const ROW0 = 0;
const ROW1 = INH + VG;
const ROW2 = ROW1 + LBH + VG;
const ROW_SWITCH = ROW2 + IFH + VG;
const ROW3 = ROW_SWITCH + DEH + VDG;
const SWITCH_NODE_ID_PREFIX = "custom-switch:";
const INET_ID = "__internet__";
const BOX_ID = "__livebox__";

function buildGraph(devices, topo, storedPositions, parentOverrides, customSwitches) {
  const apiViaMap = new Map((topo.device_map ?? []).map((e) => [e.device, e.via]));
  const apiRepeatersSet = new Set((topo.repeaters ?? []).map((r) => r.key));

  const effectiveViaMap = new Map(apiViaMap);
  for (const [mac, parent] of Object.entries(parentOverrides)) {
    if (!parent) effectiveViaMap.delete(mac);
    else effectiveViaMap.set(mac, parent);
  }
  const customSwitchNodeIds = new Map(customSwitches.map((sw) => [sw.id, `${SWITCH_NODE_ID_PREFIX}${sw.id}`]));
  for (const sw of customSwitches) {
    const nodeId = customSwitchNodeIds.get(sw.id);
    for (const mac of sw.devices) effectiveViaMap.set(mac, nodeId);
  }

  const isDeviceMac = (s) => s.includes(":");
  const customRelayMacs = new Set([...effectiveViaMap.values()].filter((v) => isDeviceMac(v) && !apiRepeatersSet.has(v)));
  const allRelayMacs = new Set([...apiRepeatersSet, ...customRelayMacs]);
  const viaDevices = devices.filter((d) => effectiveViaMap.has(d.mac));

  const byIface = new Map();
  for (const d of devices) {
    const key = d.interface || "__other__";
    if (!byIface.has(key)) byIface.set(key, []);
    byIface.get(key).push(d);
  }
  const sortedIfaces = [...byIface.entries()].sort(([a], [b]) => {
    const aEth = a.startsWith("eth") || a.startsWith("ETH");
    const bEth = b.startsWith("eth") || b.startsWith("ETH");
    if (aEth !== bEth) return aEth ? -1 : 1;
    return a.localeCompare(b);
  });

  function makeSlot(id, devs) {
    const cols = Math.min(devs.length, MAX_COLS);
    const gridW = cols > 0 ? cols * (DEW + HG) - HG : 0;
    return { id, devs, cols, gridW, slotW: Math.max(IFW, gridW) };
  }
  const slots = sortedIfaces.map(([iface, devs]) => makeSlot(`iface_${iface}`, devs));

  const totalRow2W = slots.reduce((s, sl) => s + sl.slotW, 0) + Math.max(0, slots.length - 1) * IG;
  const switchCols = Math.min(customSwitches.length, MAX_COLS);
  const totalSwitchW = switchCols > 0 ? switchCols * (DEW + HG) - HG : 0;
  const totalW = Math.max(totalRow2W, totalSwitchW, LBW, INW);
  const cx = totalW / 2;

  const pos = {};
  pos[INET_ID] = { x: cx - INW / 2, y: ROW0 };
  pos[BOX_ID] = { x: cx - LBW / 2, y: ROW1 };

  let offsetX = (totalW - totalRow2W) / 2;
  for (const slot of slots) {
    pos[slot.id] = { x: offsetX + (slot.slotW - IFW) / 2, y: ROW2 };
    const gridOffsetX = offsetX + (slot.slotW - slot.gridW) / 2;
    slot.devs.forEach((d, i) => {
      const row = Math.floor(i / MAX_COLS);
      const col = i % MAX_COLS;
      pos[d.mac] = { x: gridOffsetX + col * (DEW + HG), y: ROW3 + row * (DEH + VDG) };
    });
    offsetX += slot.slotW + IG;
  }

  const switchOffsetX = (totalW - totalSwitchW) / 2;
  customSwitches.forEach((sw, index) => {
    const row = Math.floor(index / MAX_COLS);
    const col = index % MAX_COLS;
    const nodeId = customSwitchNodeIds.get(sw.id);
    pos[nodeId] = { x: switchOffsetX + col * (DEW + HG), y: ROW_SWITCH + row * (DEH + VDG) };
  });

  const byRelay = new Map();
  for (const d of viaDevices) {
    const relayMac = effectiveViaMap.get(d.mac);
    if (!byRelay.has(relayMac)) byRelay.set(relayMac, []);
    byRelay.get(relayMac).push(d);
  }
  for (const [id, p] of Object.entries(storedPositions)) {
    if (pos[id] !== undefined) pos[id] = p;
  }

  const nodes = [
    { id: INET_ID, type: "internetNode", position: pos[INET_ID], data: {}, draggable: true },
    { id: BOX_ID, type: "liveboxNode", position: pos[BOX_ID], data: {}, draggable: true },
  ];
  for (const sw of customSwitches) {
    const nodeId = customSwitchNodeIds.get(sw.id);
    nodes.push({
      id: nodeId,
      type: "relayDeviceNode",
      position: pos[nodeId] ?? { x: 0, y: ROW_SWITCH },
      data: {
        kind: "customSwitch", icon: "switch", name: sw.name,
        ip: sw.parent ? `parent : ${sw.parent}` : "parent : Livebox",
        mac: sw.id, active: true, childCount: sw.devices.length,
      },
      draggable: true,
    });
  }
  for (const slot of slots) {
    const iface = slot.id.replace("iface_", "");
    nodes.push({
      id: slot.id,
      type: "ifaceNode",
      position: pos[slot.id] ?? { x: 0, y: ROW2 },
      data: { label: ifaceLabel(iface), icon: ifaceIcon(iface), count: slot.devs.length },
      draggable: true,
    });
    for (const d of slot.devs) {
      if (!pos[d.mac]) continue;
      const isRelay = allRelayMacs.has(d.mac);
      nodes.push({
        id: d.mac,
        type: isRelay ? "relayDeviceNode" : "deviceNode",
        position: pos[d.mac],
        data: {
          icon: deviceIconKey(d.type), name: d.name || d.mac, ip: d.ip, mac: d.mac,
          signal: d.signal, active: d.active,
          childCount: isRelay ? (byRelay.get(d.mac)?.length ?? 0) : 0,
        },
        draggable: true,
      });
    }
  }

  const edges = [
    {
      id: "inet-box", source: INET_ID, target: BOX_ID, label: "WAN",
      labelStyle: { fontSize: 10, fontWeight: 700, fill: "#22c55e" },
      labelBgStyle: { fill: "var(--primary-background-color)", fillOpacity: 0.85 },
      style: { stroke: "#22c55e", strokeWidth: 2.5 }, animated: true,
    },
  ];
  for (const slot of slots) {
    const iface = slot.id.replace("iface_", "");
    const slotColor = isWifi(iface) ? "#a855f7" : "#f97316";
    edges.push({ id: `box-${slot.id}`, source: BOX_ID, target: slot.id, style: { stroke: slotColor, strokeWidth: 2 } });
    for (const d of slot.devs) {
      if (effectiveViaMap.has(d.mac)) continue;
      const isRelay = allRelayMacs.has(d.mac);
      edges.push({
        id: `${slot.id}-${d.mac}`, source: slot.id, target: d.mac,
        style: { stroke: isRelay ? "#3b82f6" : "#94a3b8", strokeWidth: isRelay ? 2 : 1 },
      });
    }
  }
  for (const sw of customSwitches) {
    const nodeId = customSwitchNodeIds.get(sw.id);
    const parentNode = sw.parent && pos[sw.parent] !== undefined ? sw.parent : BOX_ID;
    edges.push({ id: `${parentNode}-${nodeId}`, source: parentNode, target: nodeId, style: { stroke: "#14b8a6", strokeWidth: 2 } });
    for (const mac of sw.devices) {
      if (!pos[mac]) continue;
      edges.push({ id: `${nodeId}-${mac}`, source: nodeId, target: mac, sourceHandle: "src", style: { stroke: "#14b8a6", strokeWidth: 1.5 } });
    }
  }
  for (const [relayMac, children] of byRelay) {
    const isApi = apiRepeatersSet.has(relayMac);
    for (const child of children) {
      if (!pos[child.mac]) continue;
      edges.push({
        id: `relay-${relayMac}-${child.mac}`, source: relayMac, target: child.mac, sourceHandle: "src",
        style: { stroke: isApi ? "#F16E00" : "#3b82f6", strokeWidth: 1.5 }, animated: isApi,
      });
    }
  }

  return { nodes, edges };
}

// ── Nœuds personnalisés (mêmes styles que l'ancien panel React) ─────────────

function InternetNode() {
  return (
    <>
      <Handle type="source" position={Position.Bottom} style={{ background: "#22c55e", width: 10, height: 10 }} />
      <div
        className="flex items-center gap-3 rounded-2xl border-2 px-4"
        style={{ width: INW, height: INH, background: "linear-gradient(135deg,#052e16,#14532d)", borderColor: "#22c55e", color: "#fff" }}
      >
        <Globe className="h-6 w-6" />
        <div>
          <div className="text-xs font-bold uppercase tracking-wider">Internet</div>
          <div className="text-[10px] opacity-60">Connexion WAN</div>
        </div>
      </div>
    </>
  );
}

function LiveboxNode() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: "#22c55e", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "#F16E00", width: 10, height: 10 }} />
      <div
        className="flex items-center gap-3 rounded-xl border-2 px-4"
        style={{ width: LBW, height: LBH, background: "linear-gradient(135deg,#431407,#9a3412)", borderColor: "#F16E00", color: "#fff" }}
      >
        <House className="h-6 w-6" />
        <div>
          <div className="text-xs font-bold uppercase tracking-wider">Livebox</div>
          <div className="text-[10px] opacity-60">Routeur — LAN / WAN</div>
        </div>
      </div>
    </>
  );
}

function IfaceNode({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: "#F16E00" }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--divider-color)" }} />
      <div
        className="flex items-center gap-2 rounded-lg border-2 px-3"
        style={{ width: IFW, height: IFH, background: "var(--secondary-background-color)", borderColor: data.icon === "accessPoint" ? "#818cf8" : "#64748b", color: "var(--primary-text-color)" }}
      >
        {renderDeviceIcon(data.icon, "h-5 w-5")}
        <div className="min-w-0">
          <div className="text-[11px] font-bold truncate">{data.label}</div>
          <div className="text-[10px]" style={{ color: "var(--secondary-text-color)" }}>
            {data.count} appareil{data.count > 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </>
  );
}

function DeviceNode({ data }) {
  const inactive = data.active === false;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: "var(--divider-color)" }} />
      <div
        className="flex items-center gap-2 rounded-lg border px-3 cursor-pointer"
        style={{
          width: DEW, height: DEH,
          background: "var(--card-background-color)", borderColor: "var(--divider-color)", color: "var(--primary-text-color)",
          opacity: inactive ? 0.45 : 1, filter: inactive ? "grayscale(1)" : "none",
        }}
      >
        {renderDeviceIcon(data.icon, "h-5 w-5 shrink-0")}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold truncate">{data.name}</div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] truncate" style={{ color: "var(--secondary-text-color)" }}>{data.ip || "—"}</span>
            {!inactive && data.signal != null && (
              <span className="text-[9px] px-1 rounded bg-green-500/20 text-green-600 shrink-0">{data.signal} dBm</span>
            )}
            {inactive && <span className="text-[9px] px-1 rounded bg-slate-400/20 text-slate-400 shrink-0">hors ligne</span>}
          </div>
        </div>
      </div>
    </>
  );
}

function RelayDeviceNode({ data }) {
  const inactive = data.active === false;
  const childCount = data.childCount ?? 0;
  const isCustomSwitch = data.kind === "customSwitch";
  const accent = isCustomSwitch ? "#0f766e" : "#3b82f6";
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: accent }} />
      <Handle id="src" type="source" position={Position.Bottom} style={{ background: accent }} />
      <div
        className="flex items-center gap-2 rounded-lg border-2 px-3 cursor-pointer"
        style={{
          width: DEW, height: DEH,
          background: "var(--card-background-color)", borderColor: accent, borderStyle: "dashed", color: "var(--primary-text-color)",
          opacity: inactive ? 0.45 : 1, filter: inactive ? "grayscale(1)" : "none",
        }}
      >
        {renderDeviceIcon("switch", "h-5 w-5 shrink-0")}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold truncate">{data.name}</div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] truncate" style={{ color: "var(--secondary-text-color)" }}>{data.ip || "—"}</span>
            {childCount > 0 && (
              <span className={`text-[9px] px-1 rounded shrink-0 ${isCustomSwitch ? "bg-teal-500/20 text-teal-600" : "bg-blue-500/20 text-blue-600"}`}>
                {childCount} ap.
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const nodeTypes = {
  internetNode: InternetNode,
  liveboxNode: LiveboxNode,
  ifaceNode: IfaceNode,
  deviceNode: DeviceNode,
  relayDeviceNode: RelayDeviceNode,
};

function createSwitchId() {
  return `custom-switch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Panneau d'édition du parent d'un appareil ────────────────────────────────

function ParentEditPanel({ edit, devices, parentOverrides, onSave, onClose }) {
  const [selected, setSelected] = useState(edit.currentOverride);
  const autoLabel = useMemo(() => {
    const eff = parentOverrides[edit.mac];
    if (eff) {
      const via = devices.find((d) => d.mac === eff);
      return `Auto → via ${via?.name || via?.mac || eff}`;
    }
    return "Automatique (API Livebox)";
  }, [edit.mac, devices, parentOverrides]);

  return (
    <div className="rounded-lg border lb-border p-3">
      <p className="mb-1 text-sm font-medium lb-text">Connexion via — {edit.name}</p>
      <p className="mb-2 font-mono text-xs lb-text-muted">{edit.mac} · {edit.ip || "—"}</p>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Relais parent dans la topologie
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="lb-input">
          <option value="">{autoLabel}</option>
          {devices.filter((d) => d.mac !== edit.mac).map((d) => (
            <option key={d.mac} value={d.mac}>{d.name || d.mac} — {d.ip || "—"}</option>
          ))}
        </select>
      </label>
      {selected !== "" && (
        <p className="mt-2 text-xs text-blue-600">L'appareil sélectionné sera affiché comme relais (bordure pointillée bleue).</p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={() => { onSave(edit.mac, selected); onClose(); }} className="lb-btn-primary px-2.5 py-1 text-xs">
          Appliquer
        </button>
        <button onClick={onClose} className="lb-btn-outline px-2.5 py-1 text-xs">Annuler</button>
      </div>
    </div>
  );
}

// ── Panneau de gestion des switchs personnalisés ────────────────────────────

function SwitchEditorPanel({ devices, customSwitches, draft, setDraft, onSave, onDelete, onEdit, onClose }) {
  const toggleDevice = (mac) => {
    setDraft((prev) => ({
      ...prev,
      devices: prev.devices.includes(mac) ? prev.devices.filter((m) => m !== mac) : [...prev.devices, mac],
    }));
  };

  return (
    <div className="rounded-lg border lb-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium lb-text">Switchs personnalisés</p>
        <button onClick={onClose} className="text-xs lb-text-muted hover:underline">Fermer</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs lb-text-muted">
              Nom
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Salon, étage, bureau…"
                className="lb-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs lb-text-muted">
              Parent en amont
              <select
                value={draft.parent}
                onChange={(e) => setDraft((prev) => ({ ...prev, parent: e.target.value }))}
                className="lb-input"
              >
                <option value="">— Connexion directe (Livebox) —</option>
                {devices.filter((d) => d.active).map((d) => (
                  <option key={d.mac} value={d.mac}>{d.name || d.mac} — {d.ip || "—"}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-1 text-xs lb-text-muted">
            Appareils du switch
            <div className="max-h-64 space-y-0.5 overflow-auto rounded-md border lb-border p-1.5">
              {devices.length === 0
                ? <p className="px-2 py-2 text-sm lb-text-muted">Aucun appareil disponible.</p>
                : devices.map((d) => (
                    <label key={d.mac} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--secondary-background-color)]">
                      <input type="checkbox" checked={draft.devices.includes(d.mac)} onChange={() => toggleDevice(d.mac)} />
                      <span className="shrink-0">{renderDeviceIcon(deviceIconKey(d.type), "h-4 w-4")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium lb-text">{d.name || d.mac}</span>
                        <span className="block truncate text-[11px] lb-text-muted">{d.mac}</span>
                      </span>
                      {isSwitchDevice(d.type) && <span className="rounded-full bg-[var(--secondary-background-color)] px-2 py-0.5 text-[10px] lb-text-muted">switch</span>}
                    </label>
                  ))
              }
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onSave} disabled={!draft.name.trim() && draft.devices.length === 0} className="lb-btn-primary px-2.5 py-1 text-xs">
              {draft.id ? "Mettre à jour" : "Créer le switch"}
            </button>
            <button onClick={() => setDraft({ id: "", name: "", parent: "", devices: [] })} className="lb-btn-outline px-2.5 py-1 text-xs">Nouveau</button>
            {draft.id && <button onClick={() => onDelete(draft.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Supprimer</button>}
          </div>
        </div>
        <div className="rounded-lg border lb-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold lb-text">Enregistrés</p>
            <span className="text-xs lb-text-muted">{customSwitches.length}</span>
          </div>
          {customSwitches.length === 0
            ? <p className="text-sm lb-text-muted">Aucun switch personnalisé pour le moment.</p>
            : <div className="space-y-1.5">
                {customSwitches.map((sw) => (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() => onEdit(sw)}
                    className="w-full rounded-lg border lb-border px-2.5 py-1.5 text-left text-sm transition hover:bg-[var(--secondary-background-color)]"
                  >
                    <div className="truncate font-medium lb-text">{sw.name}</div>
                    <div className="truncate text-[11px] lb-text-muted">{sw.parent ? `Parent : ${sw.parent}` : "Parent : Livebox"}</div>
                    <div className="mt-0.5 text-[11px] lb-text-muted">{sw.devices.length} appareil{sw.devices.length > 1 ? "s" : ""}</div>
                  </button>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

/**
 * Graphe interactif de la topologie réseau, reconstruit à l'identique de
 * l'ancien panel React (`livebox-V1`) : disposition en grille (5 colonnes max
 * par interface), fond pointillé, mêmes icônes par type d'appareil, et la
 * fonctionnalité de "switchs personnalisés" + rattachement forcé d'un
 * appareil à un relais. Contrairement à l'ancienne version (purement
 * `localStorage`), tout est mémorisé côté serveur (positions, switchs,
 * rattachements) via `livebox/topology/*` — partagé entre tous les onglets et
 * utilisateurs, et survit à un changement de navigateur.
 */
export function TopologyGraph({ devices, topology }) {
  const callWs = useWsCommand();
  const runAction = useWsAction();

  const { data: positions, refresh: refreshPositions } = useWsData("livebox/topology/positions");
  const { data: customSwitches, refresh: refreshSwitches } = useWsData("livebox/topology/switches");
  const { data: parentOverrides, refresh: refreshParents } = useWsData("livebox/topology/parents");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [editState, setEditState] = useState(null);
  const [switchEditorOpen, setSwitchEditorOpen] = useState(false);
  const [switchDraft, setSwitchDraft] = useState({ id: "", name: "", parent: "", devices: [] });

  const ready = positions != null && customSwitches != null && parentOverrides != null;

  const graph = useMemo(() => (
    ready ? buildGraph(devices, topology, positions, parentOverrides, customSwitches) : null
  ), [ready, devices, topology, positions, parentOverrides, customSwitches]);

  useEffect(() => {
    if (!graph) return;
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const canvasH = useMemo(() => {
    if (!graph) return 480;
    const maxY = Math.max(0, ...graph.nodes.map((nd) => nd.position.y));
    return Math.min(Math.max(460, maxY + DEH + 64), 640);
  }, [graph]);

  const onNodeDrag = useCallback((_, node) => {
    callWs({ type: "livebox/topology/positions/set", node_id: node.id, x: node.position.x, y: node.position.y }).catch(() => {});
  }, [callWs]);

  const onNodeClick = useCallback((_, node) => {
    if (node.type !== "deviceNode" && node.type !== "relayDeviceNode") return;
    const d = node.data;
    if (d.kind === "customSwitch") {
      const sw = (customSwitches ?? []).find((item) => `${SWITCH_NODE_ID_PREFIX}${item.id}` === d.mac);
      if (sw) {
        setSwitchDraft({ id: sw.id, name: sw.name, parent: sw.parent ?? "", devices: [...sw.devices] });
        setSwitchEditorOpen(true);
      }
      return;
    }
    setEditState({ mac: d.mac, name: d.name, ip: d.ip || "", currentOverride: parentOverrides?.[d.mac] ?? "" });
  }, [customSwitches, parentOverrides]);

  const handleResetPositions = async () => {
    if (!window.confirm("Réinitialiser la disposition du graphe et oublier les positions enregistrées ?")) return;
    await runAction({ type: "livebox/topology/positions/reset" }, { success: "Disposition du graphe réinitialisée." });
    refreshPositions();
  };

  const handleSaveParent = async (mac, parent) => {
    await runAction({ type: "livebox/topology/parent/set", mac, parent: parent || null },
      { success: parent ? "Rattachement forcé enregistré." : "Rattachement automatique restauré." });
    refreshParents();
  };

  const handleSaveSwitch = async () => {
    const name = switchDraft.name.trim();
    const switchDevices = [...new Set(switchDraft.devices.filter(Boolean))];
    const switchId = switchDraft.id || createSwitchId();
    await runAction(
      { type: "livebox/topology/switches/set", switch_id: switchId, name: name || `Switch ${(customSwitches?.length ?? 0) + 1}`, parent: switchDraft.parent.trim() || null, devices: switchDevices },
      { success: "Switch personnalisé enregistré." },
    );
    setSwitchDraft({ id: "", name: "", parent: "", devices: [] });
    refreshSwitches();
  };

  const handleDeleteSwitch = async (switchId) => {
    if (!window.confirm("Supprimer ce switch personnalisé ?")) return;
    await runAction({ type: "livebox/topology/switches/remove", switch_id: switchId }, { success: "Switch supprimé." });
    setSwitchDraft({ id: "", name: "", parent: "", devices: [] });
    refreshSwitches();
  };

  const activeCount = devices.filter((d) => d.active).length;

  return (
    <div className="lb-card">
      <div className="lb-card-header">
        <span className="lb-card-title">Topologie réseau</span>
        <span className="text-[11px] lb-text-muted">{activeCount} actif{activeCount > 1 ? "s" : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleResetPositions} className="lb-btn-outline px-2.5 py-1 text-xs">
            <RotateCcw className="mr-1 inline h-3 w-3" /> Réinitialiser
          </button>
          <button
            onClick={() => { setSwitchDraft({ id: "", name: "", parent: "", devices: [] }); setSwitchEditorOpen((v) => !v); }}
            className="rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: "#14b8a6", color: "#0f766e", background: "#f0fdfa" }}
          >
            <Network className="mr-1 inline h-3 w-3" /> Ajouter un switch
          </button>
        </div>
      </div>
      <p className="px-4 py-2 text-[11px] lb-text-muted">
        Cliquez sur un appareil pour modifier son relais parent · cliquez sur un switch pour le modifier.
      </p>
      <div style={{ height: canvasH }} className="w-full overflow-hidden bg-[var(--secondary-background-color)]">
        {ready && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDrag}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
            minZoom={0.2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#94a3b8" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t lb-border px-4 py-2.5 text-[11px] lb-text-muted">
        <Legend color="#22c55e" label="Internet" />
        <Legend color="#f97316" label="Filaire" />
        <Legend color="#a855f7" label="WiFi" />
        <Legend color="#14b8a6" label="Switch" />
        <Legend color="#3b82f6" label="Répéteur" />
        <Legend color="#94a3b8" label="Appareil" />
      </div>

      {editState && (
        <div className="border-t lb-border p-3">
          <ParentEditPanel
            edit={editState}
            devices={devices}
            parentOverrides={parentOverrides ?? {}}
            onSave={handleSaveParent}
            onClose={() => setEditState(null)}
          />
        </div>
      )}
      {switchEditorOpen && (
        <div className="border-t lb-border p-3">
          <SwitchEditorPanel
            devices={devices}
            customSwitches={customSwitches ?? []}
            draft={switchDraft}
            setDraft={setSwitchDraft}
            onSave={handleSaveSwitch}
            onDelete={handleDeleteSwitch}
            onEdit={(sw) => setSwitchDraft({ id: sw.id, name: sw.name, parent: sw.parent ?? "", devices: [...sw.devices] })}
            onClose={() => setSwitchEditorOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ display: "inline-block", width: 18, height: 2, background: color, borderRadius: 2 }} />
      {label}
    </span>
  );
}
