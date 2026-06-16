import { useState, useMemo } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";

const PAGE_SIZE = 50;

export function EventsTab() {
  const { data, loading, error } = useWsData("livebox/events", {}, 30_000);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "connected" | "disconnected"
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((e) => {
      if (filter !== "all" && e.event !== filter) return false;
      if (!q) return true;
      return (
        (e.name || "").toLowerCase().includes(q) ||
        (e.mac || "").toLowerCase().includes(q) ||
        (e.ip || "").includes(q)
      );
    });
  }, [data, search, filter]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return (
    <Card title="Journal d'événements" fill>
      <p className="mb-3 flex-shrink-0 text-xs lb-text-muted">
        Connexions et déconnexions détectées entre deux rafraîchissements (~1 min).
        Pour des notifications en temps réel, créez une automatisation HA sur les
        capteurs de présence des appareils suivis.
      </p>

      {/* Filters */}
      <div className="mb-3 flex-shrink-0 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Filtrer par nom, MAC, IP…"
          className="lb-input flex-1 min-w-40 text-xs"
        />
        <div className="flex rounded-md border lb-border overflow-hidden text-xs">
          {[
            { value: "all", label: "Tous" },
            { value: "connected", label: "Connexions" },
            { value: "disconnected", label: "Déconnexions" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setFilter(value); setPage(1); }}
              className={`px-2.5 py-1.5 ${
                filter === value
                  ? "bg-[var(--primary-color)] text-[var(--text-primary-color)]"
                  : "lb-text-muted hover:bg-[var(--secondary-background-color)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <span className="self-center text-xs lb-text-muted">
            {filtered.length} événement{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <StateBox loading={loading} error={error} />

      {data && filtered.length === 0 && (
        <p className="text-sm lb-text-muted">Aucun événement{search || filter !== "all" ? " correspondant" : " détecté pour le moment"}.</p>
      )}

      {visible.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-auto lb-scroll rounded border lb-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--card-background-color)] z-10 text-xs uppercase lb-text-muted">
              <tr>
                <th className="py-1.5 pl-3 pr-2 text-left w-4" />
                <th className="py-1.5 pr-3 text-left">Appareil</th>
                <th className="py-1.5 pr-3 text-left">IP</th>
                <th className="py-1.5 pr-3 text-left font-mono">MAC</th>
                <th className="py-1.5 pr-3 text-right">Heure</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e, i) => (
                <tr key={i} className="border-t lb-border hover:bg-[var(--secondary-background-color)]/50">
                  <td className="py-1.5 pl-3 pr-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      e.event === "connected" ? "bg-emerald-500" : "bg-[var(--disabled-text-color)]"
                    }`} />
                  </td>
                  <td className="py-1.5 pr-3 font-medium lb-text">
                    {e.name || "—"}
                    <span className={`ml-1.5 text-xs ${e.event === "connected" ? "text-emerald-600" : "lb-text-muted"}`}>
                      {e.event === "connected" ? "↑ connecté" : "↓ déconnecté"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 lb-text-muted">{e.ip || "—"}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{e.mac}</td>
                  <td className="py-1.5 pr-3 text-right text-xs lb-text-muted whitespace-nowrap">{e.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="border-t lb-border p-2 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="text-xs lb-text-muted hover:lb-text underline"
              >
                Afficher {Math.min(PAGE_SIZE, filtered.length - visible.length)} de plus
                ({filtered.length - visible.length} restants)
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
