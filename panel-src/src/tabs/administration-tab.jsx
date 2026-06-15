/**
 * Onglet Administration — combine :
 *   • Système (LEDs, écran, sauvegarde/restauration, NTP, USB, énergie)
 *   • Avancé (DNS, DMZ, UPnP, DynDNS, IPv6, historique redémarrages, table de routage)
 *   • Diagnostics (SpeedTest, Pare-feu, Accès distant, Reconnexion WAN)
 *   • Répéteurs (paramètres de connexion + infos détaillées)
 */
import { useState } from "react";
import { Clock, HardDrive, Zap, Shield, RefreshCw, Router, Radio } from "lucide-react";
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

// ── Section selector ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "system", label: "Système" },
  { id: "advanced", label: "Avancé" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "repeaters", label: "Répéteurs" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SYSTÈME
// ─────────────────────────────────────────────────────────────────────────────

function LedSlider({ label, led, value, onSaved }) {
  const runAction = useWsAction();
  const [level, setLevel] = useState(value ?? 50);
  const [saving, setSaving] = useState(false);

  const handleCommit = async () => {
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/system/led/set", led, brightness: level },
        { success: `${label} réglée à ${level}%.` },
      );
      onSaved();
    } finally { setSaving(false); }
  };

  if (value == null) return <p className="text-sm lb-text-muted">{label} : non disponible sur ce modèle.</p>;

  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <span className="w-32 lb-text-muted">{label}</span>
      <input type="range" min={0} max={100} value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        onMouseUp={handleCommit} onTouchEnd={handleCommit}
        className="flex-1" disabled={saving} />
      <span className="w-10 text-right font-medium lb-text">{level}%</span>
    </div>
  );
}

function ToggleButton({ label, value, onToggle }) {
  if (value == null) return <p className="text-sm lb-text-muted">{label} : non disponible sur ce modèle.</p>;
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="lb-text-muted">{label}</span>
      <button
        onClick={() => onToggle(!value)}
        className={`rounded-md px-3 py-1 text-xs font-medium ${
          value ? "bg-emerald-100 text-emerald-700" : "bg-[var(--secondary-background-color)] lb-text-muted"
        }`}
      >
        {value ? "Activé" : "Désactivé"}
      </button>
    </div>
  );
}

function TimeCard() {
  const { data, loading, error } = useWsData("livebox/system/time", {}, 60_000);
  const ntpServers = Array.isArray(data?.ntp_servers)
    ? data.ntp_servers.join(", ")
    : typeof data?.ntp_servers === "string" ? data.ntp_servers : null;

  return (
    <Card title={<span className="flex items-center gap-2"><Clock className="size-4" /> Heure et NTP</span>}>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <Row label="Heure locale" value={data.local_time} />
          <Row label="Fuseau horaire" value={data.timezone} />
          <Row label="Synchronisation NTP" value={data.ntp_synced ? "Synchronisé" : "Non synchronisé"} />
          <Row label="Statut NTP" value={data.ntp_status} />
          {ntpServers && <Row label="Serveurs NTP" value={ntpServers} />}
        </>
      )}
    </Card>
  );
}

function UsbCard() {
  const { data, loading, error } = useWsData("livebox/system/usb");
  const runAction = useWsAction();
  const [togglingUsb3, setTogglingUsb3] = useState(false);

  const mediums = data?.mediums ?? [];
  const hosts = data?.hosts ?? [];

  const handleUsb3Toggle = async (enabled) => {
    setTogglingUsb3(true);
    try {
      await runAction(
        { type: "livebox/system/usb3/toggle", enabled },
        { success: enabled ? "USB 3.0 activé." : "USB 3.0 désactivé." },
      );
    } finally { setTogglingUsb3(false); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><HardDrive className="size-4" /> Stockage USB</span>}>
      <StateBox loading={loading} error={error} />
      {mediums.length === 0 && hosts.length === 0 && !loading && !error && (
        <p className="text-sm lb-text-muted">Aucun périphérique USB connecté.</p>
      )}
      {mediums.map((m, i) => (
        <div key={i} className="mb-2 rounded-lg border lb-border p-2">
          <p className="font-medium text-sm lb-text">{m.Name || m.Model || `Disque ${i + 1}`}</p>
          {m.Vendor && <p className="text-xs lb-text-muted">{m.Vendor} — {m.Model}</p>}
          {m.SerialNumber && <p className="text-xs lb-text-muted">S/N: {m.SerialNumber}</p>}
        </div>
      ))}
      {hosts.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs uppercase lb-text-muted">Appareils USB</p>
          {hosts.map((h, i) => <Row key={i} label={h.Name || `Appareil ${i + 1}`} value={h.DeviceClass || h.Type} />)}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={() => handleUsb3Toggle(true)} disabled={togglingUsb3}
          className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]">
          Activer USB 3.0
        </button>
        <button onClick={() => handleUsb3Toggle(false)} disabled={togglingUsb3}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
          Désactiver USB 3.0
        </button>
      </div>
    </Card>
  );
}

function PowerCard() {
  const { data, loading, error, refresh } = useWsData("livebox/system/power", {}, 60_000);
  const runAction = useWsAction();
  const [toggling, setToggling] = useState(false);
  const enabled = data?.enabled ?? false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      await runAction(
        { type: "livebox/system/power/set", enabled: !enabled },
        { success: !enabled ? "Mode éco activé." : "Mode éco désactivé." },
      );
      refresh();
    } finally { setToggling(false); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Zap className="size-4" /> Gestion de l'énergie</span>}>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <Row label="Mode éco actif" value={enabled ? "Oui" : "Non"} />
          <Row label="Statut" value={data.status ? "Actif" : "Inactif"} />
          <Row label="Mode de configuration" value={data.mode} />
          {data.power_watts != null && <Row label="Consommation" value={`${data.power_watts} W`} />}
          <div className="mt-3">
            <button onClick={handleToggle} disabled={toggling || loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                enabled ? "border border-orange-300 text-orange-700 hover:bg-orange-50" : "lb-btn-primary"
              }`}>
              {toggling ? "Modification…" : enabled ? "Désactiver le mode éco" : "Activer le mode éco"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function SystemSection() {
  const { data, loading, error, refresh } = useWsData("livebox/system", {}, 60_000);
  const runAction = useWsAction();

  const handleShowWifiPassword = async (enabled) => {
    await runAction(
      { type: "livebox/system/show_wifi_password/set", enabled },
      { success: enabled ? "Affichage du mot de passe Wifi activé." : "Affichage du mot de passe Wifi désactivé." },
    );
    refresh();
  };

  const handleAutoBackup = async (enabled) => {
    await runAction(
      { type: "livebox/system/backup/auto/set", enabled },
      { success: enabled ? "Sauvegarde automatique activée." : "Sauvegarde automatique désactivée." },
    );
    refresh();
  };

  const handleBackupNow = async () => {
    try {
      await runAction({ type: "livebox/system/backup/run" }, { success: "Sauvegarde demandée." });
      refresh();
    } catch { /* toast déjà affiché */ }
  };

  const handleRestore = async () => {
    if (!window.confirm("Restaurer la configuration depuis la dernière sauvegarde ? La Livebox va redémarrer.")) return;
    try {
      await runAction({ type: "livebox/system/restore/run" }, { success: "Restauration demandée — la Livebox va redémarrer." });
      refresh();
    } catch { /* toast déjà affiché */ }
  };

  const backup = data?.backup;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="LEDs et écran">
        <StateBox loading={loading} error={error} />
        {data && (
          <div className="space-y-3">
            <LedSlider label="LED Orange" led="orange" value={data.led_orange} onSaved={refresh} />
            <LedSlider label="LED Blanche" led="white" value={data.led_white} onSaved={refresh} />
            <ToggleButton
              label="Afficher le mot de passe Wifi sur l'écran"
              value={data.show_wifi_password}
              onToggle={handleShowWifiPassword}
            />
          </div>
        )}
      </Card>

      <Card title="Sauvegarde et restauration de la configuration">
        {backup && (
          <div className="space-y-2">
            <Row label="Statut" value={backup.status} />
            <Row label="Dernière sauvegarde" value={backup.last_backup} />
            <ToggleButton label="Sauvegarde automatique" value={backup.auto_enabled} onToggle={handleAutoBackup} />
            <div className="flex gap-2 pt-2">
              <button onClick={handleBackupNow} className="lb-btn-primary">Sauvegarder maintenant</button>
              <button onClick={handleRestore}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                Restaurer la dernière sauvegarde
              </button>
            </div>
          </div>
        )}
      </Card>

      <TimeCard />
      <UsbCard />
      <PowerCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AVANCÉ
// ─────────────────────────────────────────────────────────────────────────────

function AdvancedSection() {
  const { data, loading, error, refresh } = useWsData("livebox/advanced", {}, 60_000);
  const { data: rebootHistory } = useWsData("livebox/reboot_history", {}, 60_000);
  const runAction = useWsAction();
  const { dns, ddns, dmz, upnp, ipv6 } = data ?? {};

  const [upnpOverride, setUpnpOverride] = useState(null);
  const upnpEnabled = upnpOverride ?? upnp?.enabled ?? false;

  const handleUpnpToggle = async (enabled) => {
    setUpnpOverride(enabled);
    try {
      const result = await runAction(
        { type: "livebox/upnp/toggle", enabled },
        { success: enabled ? "UPnP activé." : "UPnP désactivé." },
      );
      setUpnpOverride(result?.enabled ?? enabled);
    } catch { setUpnpOverride(null); }
  };

  const handleUpnpDelete = async (ruleId) => {
    await runAction({ type: "livebox/upnp/delete", rule_id: ruleId }, { success: "Règle UPnP supprimée." });
    refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="DNS / IPv6">
        <StateBox loading={loading} error={error} />
        {dns && (
          <>
            <Row label="Serveurs DNS" value={dns.servers} />
            <Row label="Serveurs DNS IPv6" value={dns.ipv6_servers} />
          </>
        )}
        {ipv6 && (
          <>
            <Row label="IPv6 actif" value={ipv6.enabled ? "Oui" : "Non"} />
            <Row label="Adresse IPv6" value={ipv6.address} />
            <Row label="Préfixe IPv6" value={ipv6.prefix} />
          </>
        )}
      </Card>

      <Card title="DMZ">
        {dmz && (
          <>
            <Row label="Activée" value={dmz.enabled ? "Oui" : "Non"} />
            <Row label="IP cible" value={dmz.ip} />
          </>
        )}
      </Card>

      <Card title="DynDNS">
        {ddns && (
          <>
            {ddns.global_enabled != null && (
              <div className="flex items-center justify-between border-b lb-border pb-2 mb-2 text-sm">
                <span className="lb-text-muted">Service activé</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium lb-text">{ddns.global_enabled ? "Oui" : "Non"}</span>
                  <button
                    onClick={async () => {
                      await runAction(
                        { type: "livebox/ddns/global/toggle", enabled: !ddns.global_enabled },
                        { success: !ddns.global_enabled ? "DynDNS activé." : "DynDNS désactivé." },
                      );
                      refresh();
                    }}
                    className="lb-link text-xs hover:underline"
                  >
                    {ddns.global_enabled ? "Désactiver" : "Activer"}
                  </button>
                </span>
              </div>
            )}
            {ddns.hosts.length === 0
              ? <p className="text-sm lb-text-muted">Aucun hôte DynDNS configuré.</p>
              : <ul className="space-y-1 text-sm">
                  {ddns.hosts.map((h) => (
                    <li key={h.hostname} className="flex justify-between border-b lb-border py-1 last:border-0">
                      <span className="font-medium">{h.hostname}</span>
                      <span className="lb-text-muted">{h.service} · {h.status}</span>
                    </li>
                  ))}
                </ul>
            }
          </>
        )}
      </Card>

      <Card title="UPnP">
        {upnp && (
          <>
            <div className="flex items-center justify-between border-b lb-border py-1 text-sm">
              <span className="lb-text-muted">Activé</span>
              <span className="flex items-center gap-2">
                <span className="font-medium lb-text">{upnpEnabled ? "Oui" : "Non"}</span>
                <button onClick={() => handleUpnpToggle(!upnpEnabled)} className="lb-link text-xs hover:underline">
                  {upnpEnabled ? "Désactiver" : "Activer"}
                </button>
              </span>
            </div>
            {upnp.rules.length === 0
              ? <p className="mt-2 text-sm lb-text-muted">Aucune règle UPnP.</p>
              : <ul className="mt-2 space-y-1 text-sm">
                  {upnp.rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between border-b lb-border py-1 last:border-0">
                      <span>{r.name ?? r.id}</span>
                      <button onClick={() => handleUpnpDelete(r.id)} className="text-xs text-red-600 hover:underline">
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>}
          </>
        )}
      </Card>

      <Card title="Historique des redémarrages">
        {rebootHistory && (
          rebootHistory.length === 0
            ? <p className="text-sm lb-text-muted">Aucun historique disponible.</p>
            : <ul className="space-y-1 text-sm">
                {rebootHistory.map((entry, i) => (
                  <li key={i} className="flex justify-between border-b lb-border py-1 last:border-0">
                    <span>{entry.boot_date ?? "—"}</span>
                    <span className="lb-text-muted">{entry.boot_reason ?? "—"}</span>
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <RoutingCard />
    </div>
  );
}

function RoutingCard() {
  const { data, loading, error } = useWsData("livebox/routing/table", {}, 120_000);
  const routes = data && typeof data === "object" ? Object.values(data) : [];

  return (
    <Card title={<span className="flex items-center gap-2"><Router className="size-4" /> Table de routage</span>}>
      <StateBox loading={loading} error={error} />
      {!loading && !error && routes.length === 0 && (
        <p className="text-sm lb-text-muted">
          Aucune route statique configurée ou fonctionnalité réservée aux modèles Livebox Pro.
        </p>
      )}
      {routes.length > 0 && (
        <div className="overflow-x-auto overflow-y-auto max-h-[40vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--card-background-color)]">
              <tr className="border-b lb-border text-xs lb-text-muted">
                <th className="pb-1 text-left font-medium">Nom</th>
                <th className="pb-1 text-left font-medium">Destination</th>
                <th className="pb-1 text-left font-medium">Masque</th>
                <th className="pb-1 text-left font-medium">Passerelle</th>
                <th className="pb-1 text-left font-medium">Actif</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => (
                <tr key={i} className="border-b lb-border last:border-0">
                  <td className="py-1 pr-2 lb-text">{r.Name ?? r.name ?? "—"}</td>
                  <td className="py-1 pr-2 lb-text-muted font-mono text-xs">{r.DestinationAddress ?? r.Destination ?? "—"}</td>
                  <td className="py-1 pr-2 lb-text-muted font-mono text-xs">{r.SubnetMask ?? r.Mask ?? "—"}</td>
                  <td className="py-1 pr-2 lb-text-muted font-mono text-xs">{r.GatewayAddress ?? r.Gateway ?? "—"}</td>
                  <td className="py-1">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${r.Enable || r.enable ? "bg-emerald-100 text-emerald-700" : "bg-[var(--secondary-background-color)] lb-text-muted"}`}>
                      {r.Enable || r.enable ? "Oui" : "Non"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS
// ─────────────────────────────────────────────────────────────────────────────

const FIREWALL_LEVELS = [
  { id: "Low", label: "Bas", description: "Règles minimales, ports ouverts." },
  { id: "Medium", label: "Moyen", description: "Protection standard recommandée." },
  { id: "High", label: "Élevé", description: "Blocage strict des connexions entrantes." },
  { id: "Custom", label: "Personnalisé", description: "Règles définies manuellement." },
];

function FirewallCard() {
  const { data, loading, error, refresh } = useWsData("livebox/firewall/levels");
  const runAction = useWsAction();
  const [setting, setSetting] = useState(null);
  const current = data?.current ?? "";

  const handleSet = async (level) => {
    setSetting(level);
    try {
      await runAction({ type: "livebox/firewall/level/set", level }, { success: `Niveau de pare-feu mis à jour : ${level}.` });
      refresh();
    } finally { setSetting(null); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Shield className="size-4" /> Pare-feu</span>}>
      <StateBox loading={loading} error={error} />
      {current && <p className="mb-3 text-sm lb-text-muted">Niveau actuel : <strong className="lb-text">{current}</strong></p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {FIREWALL_LEVELS.map((lvl) => (
          <button key={lvl.id} onClick={() => handleSet(lvl.id)}
            disabled={setting !== null || current === lvl.id}
            className={`rounded-lg border p-3 text-left transition ${
              current === lvl.id ? "border-[var(--lb-brand)] bg-[var(--lb-brand)]/10" : "lb-border hover:bg-[var(--secondary-background-color)]"
            }`}>
            <p className="font-medium lb-text">{lvl.label}</p>
            <p className="text-xs lb-text-muted">{lvl.description}</p>
            {setting === lvl.id && <p className="mt-1 text-xs lb-text-muted">Application…</p>}
          </button>
        ))}
      </div>
    </Card>
  );
}

function SpeedTestCard() {
  const runAction = useWsAction();
  const [result, setResult] = useState(undefined);
  const [fetching, setFetching] = useState(false);

  const fetchResults = async () => {
    setFetching(true);
    try {
      const data = await runAction({ type: "livebox/speedtest/results" }, { error: "Impossible de récupérer les résultats." });
      setResult(data ?? null);
    } catch { /* déjà notifié */ } finally { setFetching(false); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Zap className="size-4" /> SpeedTest</span>}>
      <p className="mb-3 text-sm lb-text-muted">Derniers résultats mémorisés par la Livebox.</p>
      <button onClick={fetchResults} disabled={fetching} className="lb-btn-primary mb-3">
        {fetching ? "Récupération…" : "Afficher les résultats"}
      </button>
      {result !== undefined && (
        result?.no_data || (!result?.downstream && !result?.upstream) ? (
          <p className="text-sm lb-text-muted">Aucun résultat disponible — lancez d'abord un test depuis l'interface web Orange.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {result?.downstream && (
              <div className="rounded-lg border lb-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Débit descendant ↓</p>
                <p className="text-2xl font-bold lb-text tabular-nums">
                  {result.downstream.rate_mbit} <span className="text-sm font-normal lb-text-muted">Mbit/s</span>
                </p>
                {result.downstream.latency_ms != null && <p className="text-sm lb-text-muted">Latence : {result.downstream.latency_ms} ms</p>}
              </div>
            )}
            {result?.upstream && (
              <div className="rounded-lg border lb-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Débit montant ↑</p>
                <p className="text-2xl font-bold lb-text tabular-nums">
                  {result.upstream.rate_mbit} <span className="text-sm font-normal lb-text-muted">Mbit/s</span>
                </p>
                {result.upstream.latency_ms != null && <p className="text-sm lb-text-muted">Latence : {result.upstream.latency_ms} ms</p>}
              </div>
            )}
          </div>
        )
      )}
    </Card>
  );
}

function WanReconnectCard() {
  const runAction = useWsAction();
  const [reconnecting, setReconnecting] = useState(false);
  const [done, setDone] = useState(false);

  const handleReconnect = async () => {
    if (!window.confirm("Forcer une reconnexion WAN ? La connexion Internet sera coupée brièvement.")) return;
    setReconnecting(true); setDone(false);
    try {
      await runAction({ type: "livebox/network/wan/reconnect" }, { success: "Reconnexion WAN initiée." });
      setDone(true);
    } catch { /* déjà notifié */ } finally { setReconnecting(false); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><RefreshCw className="size-4" /> Reconnexion WAN</span>}>
      <p className="mb-3 text-sm lb-text-muted">Force une reconnexion PPPoE. La connexion Internet sera coupée quelques secondes.</p>
      <button onClick={handleReconnect} disabled={reconnecting}
        className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700 hover:bg-orange-100">
        {reconnecting ? "Reconnexion en cours…" : "⚡ Forcer la reconnexion"}
      </button>
      {done && <p className="mt-2 text-sm text-emerald-600">Reconnexion initiée. La box se reconnectera dans quelques instants.</p>}
    </Card>
  );
}

function RemoteAccessCard() {
  const { data, loading, error, refresh } = useWsData("livebox/remote_access");
  const runAction = useWsAction();
  const [toggling, setToggling] = useState(false);
  const enabled = data?.enabled ?? false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      await runAction({ type: "livebox/remote_access/set", enabled: !enabled },
        { success: !enabled ? "Accès distant activé." : "Accès distant désactivé." });
      refresh();
    } finally { setToggling(false); }
  };

  return (
    <Card title="Accès distant Orange">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <Row label="Activé" value={enabled ? "Oui" : "Non"} />
          <Row label="Statut" value={data.status ? "Actif" : "Inactif"} />
          <div className="mt-3">
            <button onClick={handleToggle} disabled={toggling || loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                enabled ? "border border-red-200 text-red-600 hover:bg-red-50" : "lb-btn-primary"
              }`}>
              {toggling ? "Modification…" : enabled ? "Désactiver" : "Activer"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function DiagnosticsSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SpeedTestCard />
      <WanReconnectCard />
      <RemoteAccessCard />
      <FirewallCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉPÉTEURS
// ─────────────────────────────────────────────────────────────────────────────

function RepeaterForm({ repeater, onSaved }) {
  const runAction = useWsAction();
  const [ip, setIp] = useState(repeater.ip);
  const [username, setUsername] = useState(repeater.username);
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
    } catch (err) { setError(err); } finally { setSaving(false); }
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
          placeholder={repeater.has_password ? "••••••••" : ""} className="lb-input" />
      </label>
      <button type="submit" disabled={saving} className="lb-btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
      {error && <p className="text-xs text-red-600 sm:col-span-4">Erreur : {String(error.message ?? error)}</p>}
    </form>
  );
}

function RepeaterInfoPanel({ repeaterKey }) {
  const runAction = useWsAction();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runAction(
        { type: "livebox/repeater/info", key: repeaterKey },
        { error: "Impossible de joindre le répéteur." }
      );
      setInfo(result ?? null);
    } catch (err) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  };

  const di = info?.device_info ?? {};
  const wifi = info?.wifi ?? {};
  const mem = info?.memory ?? {};

  return (
    <div className="mt-3">
      <button onClick={fetchInfo} disabled={loading}
        className="rounded-md border lb-border px-3 py-1 text-xs hover:bg-[var(--secondary-background-color)] disabled:opacity-50">
        <span className="flex items-center gap-1.5"><Radio className="size-3" />
          {loading ? "Connexion…" : "Interroger le répéteur"}
        </span>
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {info && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.keys(di).length > 0 && (
            <div className="rounded-lg border lb-border p-2">
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">Informations appareil</p>
              {di.Manufacturer && <Row label="Fabricant" value={di.Manufacturer} />}
              {di.ProductClass && <Row label="Modèle" value={di.ProductClass} />}
              {di.SoftwareVersion && <Row label="Firmware" value={di.SoftwareVersion} />}
              {di.SerialNumber && <Row label="N° série" value={di.SerialNumber} />}
              {di.BaseMAC && <Row label="MAC" value={di.BaseMAC} />}
              {di.UpTime != null && <Row label="Uptime" value={`${Math.round(di.UpTime / 3600)} h`} />}
            </div>
          )}
          {(wifi.Enable != null || wifi.Status != null || mem.total_mb) && (
            <div className="rounded-lg border lb-border p-2">
              <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">Wifi & Mémoire</p>
              {wifi.Enable != null && <Row label="Wifi activé" value={wifi.Enable ? "Oui" : "Non"} />}
              {wifi.Status != null && <Row label="Statut Wifi" value={wifi.Status ? "Actif" : "Inactif"} />}
              {mem.total_mb != null && <Row label="RAM totale" value={`${mem.total_mb} Mo`} />}
              {mem.free_mb != null && <Row label="RAM libre" value={`${mem.free_mb} Mo`} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepeatersSection() {
  const { data, loading, error, refresh } = useWsData("livebox/repeaters");

  return (
    <Card title="Répéteurs Wifi — paramètres de connexion">
      <StateBox loading={loading} error={error} />
      <p className="mb-3 text-xs lb-text-muted">
        Adresse IP et identifiants utilisés pour se connecter directement à chaque répéteur.
        Enregistrés en local dans le stockage de Home Assistant.
      </p>
      {data && (
        data.length === 0
          ? <p className="text-sm lb-text-muted">Aucun répéteur détecté dans la topologie.</p>
          : <div className="space-y-4">
              {data.map((repeater) => (
                <div key={repeater.key} className="rounded-lg border lb-border p-3">
                  <p className="mb-2 text-sm font-medium lb-text">📡 {repeater.name}</p>
                  <RepeaterForm repeater={repeater} onSaved={refresh} />
                  {repeater.ip && repeater.has_password && (
                    <RepeaterInfoPanel repeaterKey={repeater.key} />
                  )}
                  {repeater.ip && !repeater.has_password && (
                    <p className="mt-2 text-xs lb-text-muted">Entrez le mot de passe pour interroger le répéteur.</p>
                  )}
                </div>
              ))}
            </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function AdministrationTab() {
  const [section, setSection] = useState("system");

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              section === s.id
                ? "lb-btn-primary"
                : "border lb-border hover:bg-[var(--secondary-background-color)] lb-text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "system" && <SystemSection />}
      {section === "advanced" && <AdvancedSection />}
      {section === "diagnostics" && <DiagnosticsSection />}
      {section === "repeaters" && <RepeatersSection />}
    </div>
  );
}
