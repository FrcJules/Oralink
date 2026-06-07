import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const WIRED_PREFIXES = ["eth", "ETH"];

function isWired(iface) {
  return WIRED_PREFIXES.some((p) => iface?.startsWith(p));
}

function truncLabel(s) {
  return s && s.length > 14 ? `${s.slice(0, 13)}…` : (s || "");
}

function truncIp(ip) {
  return ip && ip.length > 20 ? `${ip.slice(0, 19)}…` : (ip || "");
}

function buildElements(devices, network, topology) {
  const box = network?.box ?? {};
  const wan = network?.wan ?? {};
  const elements = [];

  elements.push({
    data: { id: "internet", label: "🌐\nInternet", type: "internet", sublabel: truncIp(wan.ip) },
  });
  elements.push({
    data: { id: "livebox", label: `📡\n${box.model || "Livebox"}`, type: "livebox", sublabel: box.firmware || "" },
  });
  elements.push({ data: { id: "e-inet-lb", source: "internet", target: "livebox", edgeType: "wan" } });

  const active = devices.filter((d) => d.active);

  const wiredGroups = {};
  const wifiGroups = {};
  for (const d of active) {
    if (isWired(d.interface)) {
      const key = d.interface || "?";
      (wiredGroups[key] ??= []).push(d);
    } else {
      const key = d.band || d.interface || "Wifi";
      (wifiGroups[key] ??= []).push(d);
    }
  }

  for (const [iface, devs] of Object.entries(wiredGroups)) {
    const portId = `port-${iface}`;
    elements.push({
      data: { id: portId, label: `🔌\n${iface.toUpperCase()}`, type: "port", sublabel: `${devs.length} appareil${devs.length > 1 ? "s" : ""}` },
    });
    elements.push({ data: { id: `e-lb-${portId}`, source: "livebox", target: portId, edgeType: "eth" } });
    for (const d of devs) addDeviceNode(elements, d, portId);
  }

  for (const [band, devs] of Object.entries(wifiGroups)) {
    const bandId = `wifi-${band.replace(/\s+/g, "-")}`;
    elements.push({
      data: { id: bandId, label: `📶\n${band}`, type: "wifi", sublabel: `${devs.length} appareil${devs.length > 1 ? "s" : ""}` },
    });
    elements.push({ data: { id: `e-lb-${bandId}`, source: "livebox", target: bandId, edgeType: "wifi" } });
    for (const d of devs) addDeviceNode(elements, d, bandId);
  }

  for (const rep of (topology?.repeaters ?? [])) {
    const repId = `rep-${rep.key}`;
    elements.push({ data: { id: repId, label: `📡\n${truncLabel(rep.name)}`, type: "repeater" } });
    elements.push({ data: { id: `e-lb-${repId}`, source: "livebox", target: repId, edgeType: "repeater" } });
  }

  return elements;
}

function addDeviceNode(elements, d, parentId) {
  const nodeId = `dev-${d.mac}`;
  const name = d.name || d.mac;
  elements.push({
    data: {
      id: nodeId, type: "device",
      label: `💻\n${truncLabel(name)}`,
      sublabel: truncIp(d.ip),
    },
  });
  elements.push({ data: { id: `e-${parentId}-${nodeId}`, source: parentId, target: nodeId, edgeType: "device" } });
}

function cytoscapeStyle() {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-wrap": "wrap",
        "text-max-width": "90px",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "font-size": "10px",
        "color": "#374151",
        "font-family": "system-ui, sans-serif",
      },
    },
    { selector: "node[type='internet']", style: { width: 56, height: 56, shape: "ellipse", "background-color": "#dbeafe", "border-width": 2.5, "border-color": "#3b82f6", "font-size": "13px" } },
    { selector: "node[type='livebox']", style: { width: 68, height: 68, shape: "round-rectangle", "background-color": "#fff3e8", "border-width": 3, "border-color": "#ff7900", "font-size": "13px", "font-weight": "bold" } },
    { selector: "node[type='port']", style: { width: 50, height: 50, shape: "round-rectangle", "background-color": "#1e293b", "border-width": 2, "border-color": "#475569", "font-size": "10px", color: "#f1f5f9" } },
    { selector: "node[type='wifi']", style: { width: 50, height: 50, shape: "round-rectangle", "background-color": "#faf5ff", "border-width": 2, "border-color": "#a855f7", "font-size": "10px", color: "#6b21a8" } },
    { selector: "node[type='repeater']", style: { width: 56, height: 56, shape: "round-rectangle", "background-color": "#fff3e8", "border-width": 2.5, "border-color": "#ff7900", "font-size": "10px" } },
    { selector: "node[type='device']", style: { width: 44, height: 44, shape: "round-rectangle", "background-color": "#ffffff", "border-width": 1.5, "border-color": "#d1d5db", "font-size": "9px" } },
    { selector: "edge", style: { width: 1.5, "line-color": "#cbd5e1", "target-arrow-shape": "none", "curve-style": "bezier", opacity: 0.8 } },
    { selector: "edge[edgeType='wan']", style: { "line-color": "#3b82f6", width: 3, opacity: 1 } },
    { selector: "edge[edgeType='eth']", style: { "line-color": "#475569", width: 2.5, opacity: 0.9 } },
    { selector: "edge[edgeType='wifi']", style: { "line-color": "#a855f7", width: 2.5, opacity: 0.9, "line-style": "dashed", "line-dash-pattern": [6, 3] } },
    { selector: "edge[edgeType='repeater']", style: { "line-color": "#ff7900", width: 2.5, opacity: 0.9, "line-style": "dashed", "line-dash-pattern": [6, 3] } },
    { selector: "edge[edgeType='device']", style: { "line-color": "#9ca3af", width: 1.2, opacity: 0.7 } },
  ];
}

/**
 * Graphe interactif de la topologie réseau (Cytoscape) — pan/zoom/glisser des
 * nœuds, ajustement automatique, export PNG. Reconstruit à chaque changement
 * de données (pas de persistance des positions, contrairement à l'ancienne
 * version qui s'appuyait sur un store dédié côté frontend).
 */
export function TopologyGraph({ devices, network, topology }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(devices, network, topology),
      style: cytoscapeStyle(),
      layout: { name: "breadthfirst", directed: true, padding: 40, spacingFactor: 1.25, fit: true, avoidOverlap: true, roots: "#internet" },
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [devices, network, topology]);

  const handleFit = () => {
    cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 40 }, duration: 350 });
  };

  const handleExport = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const png = cy.png({ scale: 2, full: true, bg: "#f8fafc" });
    const a = Object.assign(document.createElement("a"), { href: png, download: "oralink-topologie.png" });
    a.click();
  };

  return (
    <div className="lb-card">
      <div className="lb-card-header">
        <span className="lb-card-title">Topologie réseau</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleFit} className="lb-btn-outline px-2.5 py-1 text-xs">⊞ Ajuster</button>
          <button onClick={handleExport} className="lb-btn-outline px-2.5 py-1 text-xs">⤓ Exporter PNG</button>
        </div>
      </div>
      <div ref={containerRef} className="h-[480px] w-full rounded-b-xl bg-[var(--secondary-background-color)]" />
      <div className="flex flex-wrap gap-4 border-t lb-border px-4 py-2 text-xs lb-text-muted">
        <span>🌐 Internet</span>
        <span>📡 Livebox / Répéteur</span>
        <span>🔌 Port filaire</span>
        <span>📶 Wifi</span>
        <span>💻 Appareil</span>
        <span>· Glisser pour repositionner · Molette pour zoomer</span>
      </div>
    </div>
  );
}
