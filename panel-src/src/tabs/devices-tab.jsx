import { useEffect, useMemo, useState } from "react";
import { Download, LayoutGrid, List } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";
import { DeviceTable } from "../components/device-table.jsx";
import { DeviceCards } from "../components/device-cards.jsx";
import { interfaceLabel, isWifiInterface } from "../lib/labels.js";
import { parseDate } from "../lib/format.js";

const DAY_MS = 24 * 3600 * 1000;
const VIEW_KEY = "oralink.devices.view";

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
}

const FILTERS = [
  { value: "all", label: "Tous" },
  { value: "active", label: "Actifs" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "wired", label: "Filaires" },
];

// Un appareil Wi-Fi a une bande renseignée (2.4GHz / 5GHz / 6GHz) ou une VAP.
const isWifi = (d) => Boolean(d.band) || isWifiInterface(d.interface);

const CSV_COLUMNS = [
  ["Nom", (d) => d.name],
  ["IP", (d) => d.ip],
  ["MAC", (d) => d.mac],
  ["Actif", (d) => (d.active ? "oui" : "non")],
  ["Type", (d) => d.type],
  ["Connexion", (d) => (isWifi(d) ? "Wi-Fi" : "Filaire")],
  ["Interface", (d) => interfaceLabel(d.interface, d.band)],
  ["Signal (dBm)", (d) => d.signal ?? ""],
  ["Fabricant", (d) => d.manufacturer],
  ["Première détection", (d) => d.first_seen],
  ["Dernière connexion", (d) => d.last_connection],
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Télécharge la liste (filtrée) en CSV — séparateur « ; » pour Excel en français. */
function exportCsv(devices) {
  const lines = [
    CSV_COLUMNS.map(([label]) => label).join(";"),
    ...devices.map((d) => CSV_COLUMNS.map(([, get]) => csvCell(get(d))).join(";")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `appareils-livebox-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ViewToggle({ view, onChange }) {
  const options = [
    { value: "cards", label: "Cartes", Icon: LayoutGrid },
    { value: "list", label: "Liste", Icon: List },
  ];
  return (
    <div className="flex overflow-hidden rounded-md border lb-border text-xs" role="group" aria-label="Affichage">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          aria-pressed={view === value}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${
            view === value ? "lb-sidebar-active font-medium" : "lb-text-muted hover:bg-[var(--secondary-background-color)]"
          }`}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

export function DevicesTab() {
  const { data, loading, error, refresh } = useWsData("livebox/devices", {}, 3_000);
  const { data: topology } = useWsData("livebox/topology", {}, 60_000);
  const { data: parentOverrides } = useWsData("livebox/topology/parents", {}, 60_000);
  const { data: events } = useWsData("livebox/events", {}, 60_000);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState(readView);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
  };

  // « Nouveau » : apparu dans les dernières 24 h (journal d'événements, ou
  // première détection par la box).
  const newMacs = useMemo(() => {
    const set = new Set();
    const recent = (v) => { const d = parseDate(v); return d && now - d.getTime() < DAY_MS; };
    for (const e of events ?? []) if (e.event === "new" && recent(e.time)) set.add(e.mac);
    for (const d of data ?? []) if (recent(d.first_seen)) set.add(d.mac);
    return set;
  }, [events, data, now]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((d) => {
      if (filter === "active" && !d.active) return false;
      if (filter === "wifi" && !isWifi(d)) return false;
      if (filter === "wired" && isWifi(d)) return false;
      if (!q) return true;
      return [d.name, d.ip, d.mac, d.manufacturer, d.type]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [data, search, filter]);

  const title = data
    ? `Appareils (${filtered.length}${filtered.length !== data.length ? ` / ${data.length}` : ""})`
    : "Appareils";

  return (
    <div className="h-full flex flex-col">
      <Card title={title} fill>
        <StateBox loading={loading} error={error} />
        {data && (
          <>
            <div className="mb-3 flex flex-shrink-0 flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (nom, IP, MAC, fabricant…)"
                className="lb-input min-w-40 flex-1 text-xs"
              />
              <div className="flex overflow-hidden rounded-md border lb-border text-xs">
                {FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`px-2.5 py-1.5 ${
                      filter === value
                        ? "lb-sidebar-active font-medium"
                        : "lb-text-muted hover:bg-[var(--secondary-background-color)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => exportCsv(filtered)}
                disabled={filtered.length === 0}
                className="lb-btn-outline inline-flex items-center gap-1 text-xs disabled:opacity-40"
                title="Exporter la liste affichée en CSV"
              >
                <Download className="size-3.5" /> CSV
              </button>
              <ViewToggle view={view} onChange={changeView} />
            </div>
            {view === "cards" ? (
              <DeviceCards
                devices={filtered}
                topology={topology}
                parentOverrides={parentOverrides}
                newMacs={newMacs}
                onChanged={refresh}
              />
            ) : (
              <DeviceTable devices={filtered} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
