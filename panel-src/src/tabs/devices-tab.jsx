import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
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

export function DevicesTab() {
  const { data, loading, error, refresh } = useWsData("livebox/devices");
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

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
    <Card
      title={`Appareils${data ? ` (${data.length})` : ""}`}
      actions={
        <button onClick={refresh} className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]">
          ↻ Rafraîchir
        </button>
      }
    >
      <StateBox loading={loading} error={error} />
      {sorted && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase lb-text-muted">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="py-1.5 pr-3">
                    <button
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 uppercase hover:lb-text"
                    >
                      {col.label}
                      <SortIcon active={sort.key === col.key} direction={sort.direction} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.mac} className="border-t lb-border">
                  <td className="py-1.5 pr-3 font-medium">
                    <span className={`mr-1.5 inline-block size-2 rounded-full ${d.active ? "bg-emerald-500" : "bg-[var(--disabled-text-color)]"}`} />
                    {d.name}
                  </td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.ip || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.type || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.interface || d.band || "—"}</td>
                  <td className="py-1.5 pr-3 lb-text-muted">{d.signal ?? "—"}</td>
                  <td className="py-1.5 pr-3"><Rate value={d.rate_rx} className="text-sky-600" /></td>
                  <td className="py-1.5 pr-3"><Rate value={d.rate_tx} style={{ color: "var(--lb-brand)" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
