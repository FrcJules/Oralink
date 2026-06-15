import { useState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

// ── Config form ────────────────────────────────────────────────────────────────

function RepeaterForm({ repeater, onSaved }) {
  const runAction = useWsAction();
  const [ip, setIp] = useState(repeater.ip || "");
  const [username, setUsername] = useState(repeater.username || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await runAction(
        { type: "livebox/repeaters/set", key: repeater.key, ip, username, ...(password ? { password } : {}) },
        { success: `Paramètres de « ${repeater.name} » enregistrés.` },
      );
      setPassword("");
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-4 sm:items-end">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Adresse IP
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.x" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Identifiant
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Mot de passe
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={repeater.has_password ? "••••••••" : "Nouveau mot de passe"} className="lb-input" />
      </label>
      <button type="submit" disabled={saving} className="lb-btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
      {error && <p className="text-xs text-red-600 sm:col-span-4">Erreur : {String(error.message ?? error)}</p>}
    </form>
  );
}

// ── Row helper ─────────────────────────────────────────────────────────────────

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b lb-border py-1.5 text-sm last:border-0">
      <span className="lb-text-muted">{label}</span>
      <span className="font-medium lb-text">{value ?? "—"}</span>
    </div>
  );
}

// ── Live info panel — auto-fetches on mount ────────────────────────────────────

function RepeaterInfoPanel({ repeaterKey, repeaterName }) {
  const runAction = useWsAction();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [togglingWifi, setTogglingWifi] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  const interrogate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runAction({ type: "livebox/repeater/info", key: repeaterKey }, {});
      setInfo(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => { interrogate(); }, [repeaterKey]);

  const toggleWifi = async (enable) => {
    setTogglingWifi(true);
    try {
      await runAction(
        { type: "livebox/repeater/wifi/set", key: repeaterKey, enabled: enable },
        { success: enable ? "Wifi répéteur activé." : "Wifi répéteur désactivé." },
      );
      await interrogate();
    } catch { /* toast */ } finally { setTogglingWifi(false); }
  };

  const rebootRepeater = async () => {
    if (!confirm(`Redémarrer le répéteur « ${repeaterName} » ?`)) return;
    setRebooting(true);
    try {
      await runAction(
        { type: "livebox/repeater/reboot", key: repeaterKey },
        { success: "Redémarrage lancé." },
      );
    } catch { /* toast */ } finally { setRebooting(false); }
  };

  const di = info?.device_info ?? {};
  const wifi = info?.wifi ?? {};
  const mem = info?.memory ?? {};
  const stations = info?.stations ?? {};
  const stationList = Object.values(stations).flatMap((vap) =>
    Object.values(vap?.AssociatedDevice ?? vap?.Stations ?? {})
  );
  const wifiEnabled = wifi?.Enable ?? wifi?.Status;

  return (
    <div className="mt-4 border-t lb-border pt-4">
      {/* Actions */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={interrogate} disabled={loading}
          className="flex items-center gap-1.5 rounded border lb-border px-3 py-1.5 text-xs hover:bg-[var(--secondary-background-color)] disabled:opacity-40">
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
        {info && (
          <>
            <button onClick={() => toggleWifi(!wifiEnabled)} disabled={togglingWifi}
              className={`rounded border px-3 py-1.5 text-xs disabled:opacity-40 ${
                wifiEnabled
                  ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              }`}>
              {togglingWifi ? "…" : wifiEnabled ? "Désactiver Wifi" : "Activer Wifi"}
            </button>
            <button onClick={rebootRepeater} disabled={rebooting}
              className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
              {rebooting ? "…" : "Redémarrer"}
            </button>
          </>
        )}
      </div>

      {loading && !info && <p className="text-sm lb-text-muted">Connexion au répéteur…</p>}

      {error && (
        <p className="mb-2 text-xs text-red-600">
          Erreur : {String(error.message ?? error)}
        </p>
      )}

      {info && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(di).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">Appareil</p>
              {di.Manufacturer && <Row label="Fabricant" value={di.Manufacturer} />}
              {di.ModelName && <Row label="Modèle" value={di.ModelName} />}
              {di.ProductClass && !di.ModelName && <Row label="Modèle" value={di.ProductClass} />}
              {di.SoftwareVersion && <Row label="Firmware" value={di.SoftwareVersion} />}
              {di.HardwareVersion && <Row label="Matériel" value={di.HardwareVersion} />}
              {di.SerialNumber && <Row label="N° série" value={di.SerialNumber} />}
              {di.UpTime != null && <Row label="Uptime" value={`${Math.round(di.UpTime / 3600)} h`} />}
            </div>
          )}

          {Object.keys(wifi).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">Wifi</p>
              <Row label="Activé" value={wifiEnabled ? "Oui" : "Non"} />
              {wifi.SSID && <Row label="SSID" value={wifi.SSID} />}
              {wifi.Channel != null && <Row label="Canal" value={wifi.Channel} />}
              {wifi.Standard && <Row label="Standard" value={wifi.Standard} />}
              {wifi.SecurityMode && <Row label="Sécurité" value={wifi.SecurityMode} />}
            </div>
          )}

          {mem.total_mb != null && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">Mémoire</p>
              <Row label="Total" value={`${mem.total_mb} Mo`} />
              <Row label="Libre" value={mem.free_mb != null ? `${mem.free_mb} Mo` : null} />
              {mem.total_mb && mem.free_mb != null && (
                <div className="mt-1 h-1.5 rounded-full bg-[var(--secondary-background-color)]">
                  <div className="h-full rounded-full bg-amber-400"
                    style={{ width: `${Math.round((1 - mem.free_mb / mem.total_mb) * 100)}%` }} />
                </div>
              )}
            </div>
          )}

          {stationList.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">
                Appareils connectés ({stationList.length})
              </p>
              <div className="overflow-x-auto overflow-y-auto max-h-[30vh]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--card-background-color)]">
                    <tr className="lb-text-muted">
                      <th className="py-1 pr-3 text-left font-medium">MAC</th>
                      <th className="py-1 pr-3 text-left font-medium">IP</th>
                      <th className="py-1 pr-3 text-left font-medium">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationList.map((s, i) => (
                      <tr key={s.MACAddress ?? i} className="border-t lb-border">
                        <td className="py-1 pr-3 font-mono">{s.MACAddress ?? "—"}</td>
                        <td className="py-1 pr-3 lb-text-muted">{s.IPAddress ?? "—"}</td>
                        <td className="py-1 pr-3 lb-text-muted">
                          {s.SignalStrength != null ? `${s.SignalStrength} dBm` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Object.keys(di).length === 0 && Object.keys(wifi).length === 0 && !loading && (
            <p className="sm:col-span-2 text-sm lb-text-muted">
              Aucune donnée reçue — vérifiez l'IP et les identifiants.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export function RepeatersTab() {
  const { data, loading, error, refresh } = useWsData("livebox/repeaters");
  const runAction = useWsAction();
  const hasAutoScanned = useRef(false);

  // Auto-detect IPs when data loads and any repeater has no IP configured
  useEffect(() => {
    if (!data || hasAutoScanned.current) return;
    const needsScan = data.some((r) => !r.ip);
    if (!needsScan) return;
    hasAutoScanned.current = true;
    runAction({ type: "livebox/repeaters/scan_ips" }, {})
      .then((result) => { if (result?.found?.length > 0) refresh(); })
      .catch(() => {});
  }, [data]);

  return (
    <Card
      title="Répéteurs Wifi"
      actions={
        <button
          onClick={() => { hasAutoScanned.current = false; refresh(); }}
          className="flex items-center gap-1.5 rounded border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]"
        >
          <RefreshCw className="size-3" />
          Actualiser
        </button>
      }
    >
      <StateBox loading={loading} error={error} />

      {data && data.length === 0 && (
        <p className="text-sm lb-text-muted">Aucun répéteur détecté dans la topologie.</p>
      )}

      {data && data.length > 0 && (
        <div className="space-y-6">
          {data.map((repeater) => (
            <div key={repeater.key} className="rounded-xl border lb-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">📡</span>
                <span className="font-semibold lb-text">{repeater.name}</span>
                {repeater.ip && (
                  <span className="text-xs lb-text-muted font-mono">{repeater.ip}</span>
                )}
              </div>

              <RepeaterForm repeater={repeater} onSaved={refresh} />

              {repeater.has_password ? (
                <RepeaterInfoPanel repeaterKey={repeater.key} repeaterName={repeater.name} />
              ) : (
                <p className="mt-3 text-xs lb-text-muted">
                  Enregistrez le mot de passe pour activer la supervision directe du répéteur.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
