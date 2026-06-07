/**
 * Topology tab — interactive network diagram via Cytoscape.js.
 *
 * Features:
 *   • Drag & drop any node; positions auto-saved to ConfigStore
 *   • Double-click a device node → edit dialog (rename + icon)
 *   • Double-click a custom switch → delete confirmation
 *   • Cytoscape loaded lazily from local bundle
 *   • CSS dotted background (react-flow style) via transparent canvas trick
 */
import { di, isWifi, esc, truncIPv6 } from "../helpers.js";
import { PORT_LABELS, WIFI_LABELS, ETH_SPEED } from "../constants.js";

const CYTOSCAPE_SRC = "/livebox_panel/cytoscape.min.js";

// ── Cytoscape loader ─────────────────────────────────────────────────────────

async function ensureCytoscape() {
  if (window.cytoscape) return;
  await new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${CYTOSCAPE_SRC}"]`)) {
      const poll = setInterval(() => { if (window.cytoscape) { clearInterval(poll); resolve(); } }, 50);
      return;
    }
    const s = Object.assign(document.createElement("script"), {
      src: CYTOSCAPE_SRC, onload: resolve, onerror: reject,
    });
    document.head.appendChild(s);
  });
}

// ── Static HTML (container + toolbar) ────────────────────────────────────────

export function renderTopology() {
  return `
    <div class="lb-card">
      <div class="lb-card-header">
        <span class="lb-card-title">Topologie réseau</span>
        <div class="ml-auto flex items-center gap-2 flex-wrap">
          <span style="font-size:0.6875rem;color:#6b7280">Double-clic sur un appareil pour le renommer</span>
          <button id="topo-fit"      class="${_tbtn()}">⊞ Ajuster</button>
          <button id="topo-reset"   class="${_tbtn()}">↺ Réinitialiser positions</button>
          <button id="topo-add-sw"  class="${_tbtn("green")}">🔀 Ajouter un switch</button>
          <button id="topo-export"  class="${_tbtn("ob")}">⤓ Exporter PNG</button>
        </div>
      </div>
      <div id="topo-cy"></div>
      <div style="padding:0.55rem 1.1rem;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:0.6875rem;color:#6b7280;display:flex;gap:1rem;flex-wrap:wrap">
        <span>🌐 Internet</span>
        <span>📡 Livebox / Répéteur</span>
        <span>🔌 Port filaire</span>
        <span>📶 WiFi</span>
        <span>🔀 Switch</span>
        <span>· Glisser pour repositionner · Double-clic pour modifier</span>
      </div>
    </div>`;
}

// ── Toolbar button helper ─────────────────────────────────────────────────────

function _tbtn(v = "default") {
  if (v === "ob")    return "lb-btn lb-btn-xs lb-btn-primary";
  if (v === "green") return "lb-btn lb-btn-xs lb-btn-default" +
                            ' style="border-color:#10b981;color:#059669"';
  return "lb-btn lb-btn-xs lb-btn-default";
}

// ── Main init (called after HTML is injected) ─────────────────────────────────

export async function initTopology(rootEl, ctx, dlg, store) {
  const { data } = ctx;
  const container = rootEl.querySelector("#topo-cy");
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center h-full text-gray-400 text-sm gap-3">
      <div class="w-8 h-8 border-4 border-gray-200 border-t-ob rounded-full spin"></div>
      Chargement de Cytoscape…
    </div>`;

  try { await ensureCytoscape(); }
  catch { container.innerHTML = `<div class="text-red-500 p-4">Impossible de charger Cytoscape.js (réseau requis)</div>`; return; }

  container.innerHTML = "";

  // Build graph elements
  const elements = buildElements(data, store);
  const savedPos = store.getTopoPositions();

  // Apply saved positions
  elements.forEach((el) => {
    if (el.data?.id && savedPos[el.data.id]) {
      el.position = savedPos[el.data.id];
    }
  });

  const cy = window.cytoscape({
    container,
    elements,
    layout: _layout(savedPos),
    style: _cytoscapeStyle(),
    wheelSensitivity: 0.2,
    minZoom: 0.2,
    maxZoom: 3,
  });

  // Make canvases transparent so CSS dots background shows through
  container.querySelectorAll("canvas").forEach((c) => {
    c.style.background = "transparent";
  });

  // ── Save positions after drag ─────────────────────────────────────────────
  cy.on("dragfreeon", "node", () => {
    const positions = {};
    cy.nodes().forEach((n) => { positions[n.id()] = { ...n.position() }; });
    store.saveTopoPositions(positions);
  });

  // ── Double-click: edit device ─────────────────────────────────────────────
  cy.on("dblclick", "node[type='device']", async (evt) => {
    const node = evt.target;
    const mac = node.data("mac");
    const result = await dlg.editDevice({
      name: node.data("displayName"),
      icon: node.data("icon"),
      mac,
    });
    if (!result) return;

    store.setDeviceName(mac, result.name);
    store.setDeviceIcon(mac, result.icon);

    const newIcon = result.icon || di(node.data("deviceType"));
    const newName = result.name || node.data("rawName");
    node.data("icon", newIcon);
    node.data("displayName", newName);
    node.data("label", `${newIcon}\n${truncLabel(newName)}`);
  });

  // ── Double-click: delete custom switch ────────────────────────────────────
  cy.on("dblclick", "node[type='switch']", async (evt) => {
    const node = evt.target;
    const swId = node.data("switchId");
    const name = node.data("rawName");
    if (!swId) return;
    const ok = await dlg.confirm(
      "Supprimer le switch",
      `Voulez-vous supprimer "${name}" de la topologie ?`
    );
    if (!ok) return;
    store.deleteCustomSwitch(swId);
    cy.remove(node);
    cy.remove(cy.edges(`[source='${node.id()}']`));
    cy.remove(cy.edges(`[target='${node.id()}']`));
  });

  // ── Toolbar buttons ───────────────────────────────────────────────────────
  rootEl.querySelector("#topo-fit")?.addEventListener("click", () =>
    cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 400 })
  );

  rootEl.querySelector("#topo-reset")?.addEventListener("click", async () => {
    if (!await dlg.confirm("Réinitialiser les positions", "Remettre tous les nœuds à leur position automatique ?")) return;
    store.clearTopoPositions();
    cy.layout({ ..._layoutFull(), animate: true, animationDuration: 500 }).run();
  });

  rootEl.querySelector("#topo-export")?.addEventListener("click", () => {
    const png = cy.png({ scale: 2, full: true, bg: "#f8fafc" });
    const a = Object.assign(document.createElement("a"), {
      href: png, download: "livebox-topology.png",
    });
    a.click();
    dlg.toast("Topologie exportée en PNG", "success");
  });

  // ── Add switch button ─────────────────────────────────────────────────────
  rootEl.querySelector("#topo-add-sw")?.addEventListener("click", async () => {
    // Build parent options — all nodes except Internet and Livebox
    const parentOptions = [];
    cy.nodes().forEach((n) => {
      const t = n.data("type");
      const id = n.id();
      if (id === "internet" || id === "livebox") return;
      if (t === "device") return; // devices can't be parents
      parentOptions.push({ id, label: _nodeLabel(n) });
    });
    if (parentOptions.length === 0) {
      dlg.toast("Aucun nœud parent disponible", "error");
      return;
    }
    const result = await dlg.switchForm(parentOptions);
    if (!result) return;

    const swId = store.addCustomSwitch(result);
    const swNodeId = `sw-${swId}`;

    cy.add([
      {
        data: {
          id: swNodeId,
          type: "switch",
          switchId: swId,
          rawName: result.name,
          ports: result.ports,
          label: `🔀\n${truncLabel(result.name)}`,
          sublabel: `${result.ports} ports`,
        },
      },
      {
        data: {
          id: `e-${result.parentId}-${swNodeId}`,
          source: result.parentId,
          target: swNodeId,
          edgeType: "switch",
        },
      },
    ]);

    // Position near parent
    const parent = cy.getElementById(result.parentId);
    if (parent.length) {
      const pp = parent.position();
      cy.getElementById(swNodeId).position({ x: pp.x + 100, y: pp.y + 80 });
    }
    cy.fit(cy.elements(), 40);
  });
}

// ── Node label helper ─────────────────────────────────────────────────────────

function _nodeLabel(n) {
  const t = n.data("type");
  const raw = n.data("rawName") || n.data("label") || n.id();
  const name = raw.replace(/\n.*/, "").replace(/^[^\w]*/, "").trim();
  const prefix = { port: "🔌 Port", wifi: "📶 WiFi", repeater: "📡", switch: "🔀 Switch" }[t] || "";
  return prefix ? `${prefix} ${name}` : name;
}

// ── Element builder ───────────────────────────────────────────────────────────

function buildElements(data, store) {
  const devices = data.devices ?? [];
  const network = data.network ?? {};
  const topo = data.topology ?? {};
  const box = network.box ?? {};
  const wan = network.wan ?? {};

  const elements = [];

  // Internet node
  elements.push({
    data: {
      id: "internet", label: "🌐\nInternet", type: "internet",
      sublabel: wan.ip ? truncIPv6(wan.ip) : "",
    },
  });

  // Livebox node
  elements.push({
    data: {
      id: "livebox", label: `📡\n${box.model || "Livebox"}`, type: "livebox",
      sublabel: box.firmware || "",
    },
  });
  elements.push({ data: { id: "e-inet-lb", source: "internet", target: "livebox", edgeType: "wan" } });

  // Group active devices by interface
  const byIface = {};
  for (const d of devices) {
    if (!d.active) continue;
    (byIface[d.interface || "?"] = byIface[d.interface || "?"] || []).push(d);
  }

  // Wired port nodes
  const seenLabels = new Set();
  for (const key of ["ETH0", "ETH1", "ETH2", "ETH3", "ETH4", "eth0", "eth1", "eth2", "eth3", "eth4", "eth5"]) {
    const label = PORT_LABELS[key];
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    const devs = byIface[key] || [];
    const speed = ETH_SPEED[key.toUpperCase()] || 1000;
    const portId = `port-${label}`;

    elements.push({
      data: {
        id: portId, label: `🔌\n${label}`, type: "port",
        rawName: label, speed, sublabel: speed >= 1000 ? `${speed / 1000}G` : `${speed}M`,
      },
    });
    elements.push({ data: { id: `e-lb-${portId}`, source: "livebox", target: portId, edgeType: "eth" } });

    for (const d of devs) {
      addDeviceNode(elements, d, portId, store);
    }
  }

  // WiFi band nodes
  const wifiBands = {};
  for (const [iface, devs] of Object.entries(byIface)) {
    if (isWifi(iface)) {
      const band = WIFI_LABELS[iface] || iface;
      (wifiBands[band] = wifiBands[band] || []).push(...devs);
    }
  }
  for (const [band, devs] of Object.entries(wifiBands)) {
    const bandId = `wifi-${band.replace(/\s/g, "-")}`;
    elements.push({ data: { id: bandId, label: `📶\n${band}`, type: "wifi", rawName: band } });
    elements.push({ data: { id: `e-lb-${bandId}`, source: "livebox", target: bandId, edgeType: "wifi" } });
    for (const d of devs) {
      addDeviceNode(elements, d, bandId, store);
    }
  }

  // Repeaters
  for (const rep of (topo.repeaters || [])) {
    const repId = `rep-${rep.key}`;
    elements.push({ data: { id: repId, label: `📡\n${rep.name}`, type: "repeater", rawName: rep.name } });
    elements.push({ data: { id: `e-lb-${repId}`, source: "livebox", target: repId, edgeType: "repeater" } });
  }

  // Custom switches from ConfigStore
  const customSwitches = store.getCustomSwitches();
  for (const [id, sw] of Object.entries(customSwitches)) {
    const swNodeId = `sw-${id}`;
    elements.push({
      data: {
        id: swNodeId, type: "switch",
        switchId: id,
        rawName: sw.name,
        ports: sw.ports || 8,
        label: `🔀\n${truncLabel(sw.name)}`,
        sublabel: `${sw.ports || 8} ports`,
      },
    });
    const parentId = sw.parentId || "livebox";
    elements.push({
      data: {
        id: `e-${parentId}-${swNodeId}`, source: parentId, target: swNodeId, edgeType: "switch",
      },
    });
  }

  return elements;
}

function addDeviceNode(elements, d, parentId, store) {
  const nodeId = `dev-${d.mac}`;
  const rawName = d.name || d.mac;
  const displayName = store.getDeviceName(d.mac) || rawName;
  const icon = store.getDeviceIcon(d.mac) || di(d.type);

  elements.push({
    data: {
      id: nodeId, type: "device",
      mac: d.mac, rawName, displayName, icon,
      deviceType: d.type || "",
      ip: d.ip || "",
      label: `${icon}\n${truncLabel(displayName)}`,
      sublabel: truncIPv6(d.ip || ""),
    },
  });
  elements.push({ data: { id: `e-${parentId}-${nodeId}`, source: parentId, target: nodeId, edgeType: "device" } });
}

const truncLabel = (s) => s.length > 14 ? s.slice(0, 13) + "…" : s;

// ── Layout ─────────────────────────────────────────────────────────────────────

function _layout(savedPos) {
  return Object.keys(savedPos).length > 0
    ? { name: "preset", positions: (n) => savedPos[n.id()] || undefined, fit: true, padding: 40 }
    : _layoutFull();
}

function _layoutFull() {
  return {
    name: "breadthfirst",
    directed: true,
    padding: 50,
    spacingFactor: 1.3,
    fit: true,
    avoidOverlap: true,
    roots: "#internet",
  };
}

// ── Cytoscape styles ──────────────────────────────────────────────────────────

function _cytoscapeStyle() {
  return [
    // ── Nodes base ───────────────────────────────────────────────────────────
    {
      selector: "node",
      style: {
        "label": "data(label)",
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
    {
      selector: "node[type='internet']",
      style: {
        "width": 60, "height": 60,
        "shape": "ellipse",
        "background-color": "#dbeafe",
        "border-width": 2.5, "border-color": "#3b82f6",
        "font-size": "14px",
      },
    },
    {
      selector: "node[type='livebox']",
      style: {
        "width": 72, "height": 72,
        "shape": "round-rectangle",
        "background-color": "#FFF3E8",
        "border-width": 3, "border-color": "#F16E00",
        "font-size": "14px",
        "font-weight": "bold",
      },
    },
    {
      selector: "node[type='port']",
      style: {
        "width": 54, "height": 54,
        "shape": "round-rectangle",
        "background-color": "#1e293b",
        "border-width": 2, "border-color": "#475569",
        "font-size": "11px",
        "color": "#f1f5f9",
      },
    },
    {
      selector: "node[type='port'][speed >= 2500]",
      style: {
        "background-color": "#eff6ff",
        "border-color": "#3b82f6",
        "color": "#1e3a8a",
      },
    },
    {
      selector: "node[type='wifi']",
      style: {
        "width": 54, "height": 54,
        "shape": "round-rectangle",
        "background-color": "#faf5ff",
        "border-width": 2, "border-color": "#a855f7",
        "font-size": "11px",
        "color": "#6b21a8",
      },
    },
    {
      selector: "node[type='repeater']",
      style: {
        "width": 60, "height": 60,
        "shape": "round-rectangle",
        "background-color": "#FFF3E8",
        "border-width": 2.5, "border-color": "#F16E00",
        "font-size": "11px",
      },
    },
    {
      selector: "node[type='switch']",
      style: {
        "width": 54, "height": 54,
        "shape": "round-rectangle",
        "background-color": "#f0fdf4",
        "border-width": 2, "border-color": "#22c55e",
        "font-size": "11px",
        "color": "#15803d",
      },
    },
    {
      selector: "node[type='device']",
      style: {
        "width": 50, "height": 50,
        "shape": "round-rectangle",
        "background-color": "#ffffff",
        "border-width": 1.5, "border-color": "#d1d5db",
        "font-size": "10px",
        "text-max-width": "80px",
      },
    },
    {
      selector: "node[type='device']:selected",
      style: {
        "border-width": 2.5, "border-color": "#F16E00",
        "background-color": "#FFF3E8",
      },
    },
    {
      selector: "node:active",
      style: { "overlay-opacity": 0.08 },
    },

    // ── Edges base ───────────────────────────────────────────────────────────
    {
      selector: "edge",
      style: {
        "width": 1.5,
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
        "target-arrow-shape": "none",
        "curve-style": "bezier",
        "opacity": 0.8,
      },
    },
    // Internet → Livebox: blue bold
    {
      selector: "edge[edgeType='wan']",
      style: {
        "line-color": "#3b82f6",
        "width": 3,
        "opacity": 1,
        "line-style": "solid",
      },
    },
    // Livebox → wired port: dark slate
    {
      selector: "edge[edgeType='eth']",
      style: {
        "line-color": "#475569",
        "width": 2.5,
        "opacity": 0.9,
      },
    },
    // Livebox → WiFi band: purple
    {
      selector: "edge[edgeType='wifi']",
      style: {
        "line-color": "#a855f7",
        "width": 2.5,
        "opacity": 0.9,
        "line-style": "dashed",
        "line-dash-pattern": [6, 3],
      },
    },
    // Livebox → Repeater: orange
    {
      selector: "edge[edgeType='repeater']",
      style: {
        "line-color": "#f97316",
        "width": 2.5,
        "opacity": 0.9,
        "line-style": "dashed",
        "line-dash-pattern": [6, 3],
      },
    },
    // → switch: green
    {
      selector: "edge[edgeType='switch']",
      style: {
        "line-color": "#22c55e",
        "width": 2,
        "opacity": 0.85,
      },
    },
    // → device: light gray
    {
      selector: "edge[edgeType='device']",
      style: {
        "line-color": "#9ca3af",
        "width": 1.2,
        "opacity": 0.7,
      },
    },
  ];
}
