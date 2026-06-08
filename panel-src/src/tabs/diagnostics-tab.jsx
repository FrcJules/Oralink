import { useState } from "react";
import { Zap, Shield, Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
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

const FIREWALL_LEVELS = [
  { id: "Low", label: "Bas", description: "Règles minimales, ports ouverts." },
  { id: "Medium", label: "Moyen", description: "Protection standard recommandée." },
  { id: "High", label: "Élevé", description: "Blocage strict des connexions entrantes." },
  { id: "Custom", label: "Personnalisé", description: "Règles définies manuellement." },
];

function FirewallSection() {
  const { data, loading, error, refresh } = useWsData("livebox/firewall/levels");
  const runAction = useWsAction();
  const [setting, setSetting] = useState(null);

  const current = data?.current ?? "";

  const handleSet = async (level) => {
    setSetting(level);
    try {
      await runAction(
        { type: "livebox/firewall/level/set", level },
        { success: `Niveau de pare-feu mis à jour : ${level}.` },
      );
      refresh();
    } finally {
      setSetting(null);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Shield className="size-4" /> Pare-feu
        </span>
      }
    >
      <StateBox loading={loading} error={error} />
      {current && <p className="mb-3 text-sm lb-text-muted">Niveau actuel : <strong className="lb-text">{current}</strong></p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {FIREWALL_LEVELS.map((lvl) => (
          <button
            key={lvl.id}
            onClick={() => handleSet(lvl.id)}
            disabled={setting !== null || current === lvl.id}
            className={`rounded-lg border p-3 text-left transition ${
              current === lvl.id
                ? "border-[var(--lb-brand)] bg-[var(--lb-brand)]/10"
                : "lb-border hover:bg-[var(--secondary-background-color)]"
            }`}
          >
            <p className="font-medium lb-text">{lvl.label}</p>
            <p className="text-xs lb-text-muted">{lvl.description}</p>
            {setting === lvl.id && <p className="mt-1 text-xs lb-text-muted">Application…</p>}
          </button>
        ))}
      </div>
    </Card>
  );
}

function flattenObject(obj, prefix = "") {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).flatMap(([k, v]) => {
    const label = prefix ? `${prefix} › ${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return flattenObject(v, label);
    }
    return [{ label, value: v == null ? "—" : String(v) }];
  });
}

function SpeedTestSection() {
  const runAction = useWsAction();
  const [rows, setRows] = useState(null);
  const [fetching, setFetching] = useState(false);

  const fetchResults = async () => {
    setFetching(true);
    try {
      const data = await runAction(
        { type: "livebox/speedtest/results" },
        { error: "Impossible de récupérer les résultats." },
      );
      // Remove sysbus noise keys (status: null means no error status, not a result)
      const cleaned = Object.fromEntries(
        Object.entries(data ?? {}).filter(([k, v]) => k !== "status" || v != null)
      );
      const flat = flattenObject(cleaned);
      setRows(flat.length > 0 ? flat : []);
    } catch {
      // déjà notifié
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Zap className="size-4" /> SpeedTest
        </span>
      }
    >
      <p className="mb-3 text-sm lb-text-muted">
        Récupère les derniers résultats de test de débit mémorisés par la Livebox
        (tests déclenchés depuis l'interface Orange, pas en temps réel depuis Oralink).
      </p>
      <button
        onClick={fetchResults}
        disabled={fetching}
        className="lb-btn-primary mb-3"
      >
        {fetching ? "Récupération…" : "Afficher les résultats"}
      </button>

      {rows !== null && (
        rows.length === 0 ? (
          <p className="text-sm lb-text-muted">Aucun résultat disponible. Lancez d'abord un test depuis l'interface Livebox.</p>
        ) : (
          <div className="rounded-lg border lb-border p-3">
            {rows.map(({ label, value }) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        )
      )}
    </Card>
  );
}

function WanReconnectSection() {
  const runAction = useWsAction();
  const [reconnecting, setReconnecting] = useState(false);
  const [done, setDone] = useState(false);

  const handleReconnect = async () => {
    if (!window.confirm("Forcer une reconnexion WAN ? La connexion Internet sera coupée brièvement.")) return;
    setReconnecting(true);
    setDone(false);
    try {
      await runAction(
        { type: "livebox/network/wan/reconnect" },
        { success: "Reconnexion WAN initiée." },
      );
      setDone(true);
    } catch {
      // déjà notifié
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <RefreshCw className="size-4" /> Reconnexion WAN
        </span>
      }
    >
      <p className="mb-3 text-sm lb-text-muted">
        Force une reconnexion PPPoE. La connexion Internet sera coupée quelques secondes.
      </p>
      <button
        onClick={handleReconnect}
        disabled={reconnecting}
        className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700 hover:bg-orange-100"
      >
        {reconnecting ? "Reconnexion en cours…" : "⚡ Forcer la reconnexion"}
      </button>
      {done && <p className="mt-2 text-sm text-emerald-600">Reconnexion initiée. La box se reconnectera dans quelques instants.</p>}
    </Card>
  );
}

function RemoteAccessSection() {
  const { data, loading, error, refresh } = useWsData("livebox/remote_access");
  const runAction = useWsAction();
  const [toggling, setToggling] = useState(false);

  const enabled = data?.enabled ?? false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      await runAction(
        { type: "livebox/remote_access/set", enabled: !enabled },
        { success: !enabled ? "Accès distant activé." : "Accès distant désactivé." },
      );
      refresh();
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card title="Accès distant Orange">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <Row label="Activé" value={enabled ? "Oui" : "Non"} />
          <Row label="Statut" value={data.status ? "Actif" : "Inactif"} />
          <div className="mt-3">
            <button
              onClick={handleToggle}
              disabled={toggling || loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                enabled
                  ? "border border-red-200 text-red-600 hover:bg-red-50"
                  : "lb-btn-primary"
              }`}
            >
              {toggling ? "Modification…" : enabled ? "Désactiver" : "Activer"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

export function DiagnosticsTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SpeedTestSection />
      <WanReconnectSection />
      <RemoteAccessSection />
      <FirewallSection />
    </div>
  );
}
