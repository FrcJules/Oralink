/**
 * Onglet Administration — combine :
 *   • Système (LEDs, écran, sauvegarde/restauration, NTP, USB, énergie)
 *   • Avancé (DNS, DMZ, UPnP, DynDNS, IPv6, historique redémarrages, table de routage)
 *   • Diagnostics (SpeedTest, Pare-feu, Accès distant, Reconnexion WAN)
 *   • Répéteurs (paramètres de connexion + infos détaillées)
 */
import { useState } from "react";
import { Clock, HardDrive, Zap, Shield, RefreshCw, Router } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { useConfirm } from "../lib/confirm-context.jsx";
import { Card, StateBox, Row } from "../components/card.jsx";
import { formatRate } from "../lib/format.js";
import { firewallLabel, stateLabel } from "../lib/labels.js";
import { PresenceBadge, StaleNotice } from "../components/presence.jsx";
import { NtfyCard } from "../components/ntfy-card.jsx";

// ── Section selector ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "system", label: "Système" },
  { id: "advanced", label: "Avancé" },
  { id: "notifications", label: "Notifications" },
  { id: "diagnostics", label: "Diagnostics" },
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
          <Row label="Statut NTP" value={stateLabel(data.ntp_status)} />
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
  const confirm = useConfirm();

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
    if (!await confirm({
      title: "Restaurer la configuration",
      message: "Restaurer la configuration depuis la dernière sauvegarde ? La Livebox va redémarrer.",
    })) return;
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
            <Row label="Statut" value={stateLabel(backup.status)} />
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
      <DangerZoneCard />
    </div>
  );
}

function DangerZoneCard() {
  const runAction = useWsAction();
  const confirm = useConfirm();
  const [resetting, setResetting] = useState(false);

  const handleFactoryReset = async () => {
    if (!await confirm({
      title: "⚠️ Réinitialisation usine",
      message: "Réinitialiser la Livebox aux paramètres d'usine ?\n\nToute la configuration (Wifi, contacts, redirections de port, etc.) sera effacée. Cette action est IRRÉVERSIBLE.",
      danger: true,
    })) return;
    if (!await confirm({
      title: "Dernière confirmation",
      message: "La Livebox va se réinitialiser et redémarrer. Confirmer ?",
      danger: true,
    })) return;
    setResetting(true);
    try {
      await runAction({ type: "livebox/system/factory_reset" }, { success: "Réinitialisation usine lancée." });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2 text-red-600"><Shield className="size-4" /> Zone dangereuse</span>}>
      <p className="mb-3 text-sm lb-text-muted">
        Réinitialise la Livebox à sa configuration d'usine. Toute la configuration actuelle sera perdue.
      </p>
      <button onClick={handleFactoryReset} disabled={resetting}
        className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-40">
        {resetting ? "Réinitialisation…" : "🗑️ Réinitialiser aux paramètres d'usine"}
      </button>
    </Card>
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
  const [upnpToggling, setUpnpToggling] = useState(false);
  const upnpEnabled = upnpOverride ?? upnp?.enabled ?? false;

  const handleUpnpToggle = async (enabled) => {
    if (upnpToggling) return;
    setUpnpToggling(true);
    setUpnpOverride(enabled);
    try {
      const result = await runAction(
        { type: "livebox/upnp/toggle", enabled },
        { success: enabled ? "UPnP activé." : "UPnP désactivé." },
      );
      setUpnpOverride(result?.enabled ?? enabled);
    } catch { setUpnpOverride(null); } finally { setUpnpToggling(false); }
  };

  const [ddnsToggling, setDdnsToggling] = useState(false);
  const handleDdnsGlobalToggle = async () => {
    if (ddnsToggling) return;
    setDdnsToggling(true);
    try {
      await runAction(
        { type: "livebox/ddns/global/toggle", enabled: !ddns.global_enabled },
        { success: !ddns.global_enabled ? "DynDNS activé." : "DynDNS désactivé." },
      );
      refresh();
    } finally {
      setDdnsToggling(false);
    }
  };

  const confirm = useConfirm();
  const handleDdnsDelete = async (host) => {
    if (!await confirm({
      title: "Supprimer l'hôte DynDNS",
      message: `Supprimer ${host.hostname} (${host.service}) ?`,
      danger: true,
    })) return;
    try {
      await runAction(
        { type: "livebox/ddns/delete", service: host.service, hostname: host.hostname },
        { success: "Hôte DynDNS supprimé." },
      );
      refresh();
    } catch { /* toast déjà affiché */ }
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

      <DmzCard fallback={dmz} />

      <PingResponseCard />

      <Card title="DynDNS">
        {ddns && (
          <>
            {ddns.global_enabled != null && (
              <div className="flex items-center justify-between border-b lb-border pb-2 mb-2 text-sm">
                <span className="lb-text-muted">Service activé</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium lb-text">{ddns.global_enabled ? "Oui" : "Non"}</span>
                  <button
                    onClick={handleDdnsGlobalToggle}
                    disabled={ddnsToggling}
                    className="lb-link text-xs hover:underline disabled:opacity-40"
                  >
                    {ddnsToggling ? "…" : ddns.global_enabled ? "Désactiver" : "Activer"}
                  </button>
                </span>
              </div>
            )}
            {ddns.hosts.length === 0
              ? <p className="text-sm lb-text-muted">Aucun hôte DynDNS configuré.</p>
              : <ul className="space-y-1 text-sm">
                  {ddns.hosts.map((h) => (
                    <li key={`${h.service}-${h.hostname}`} className="flex items-center justify-between gap-2 border-b lb-border py-1 last:border-0">
                      <span className="font-medium break-all">{h.hostname}</span>
                      <span className="flex items-center gap-2">
                        <span className="lb-text-muted">{h.service}{h.status ? ` · ${h.status}` : ""}</span>
                        <button onClick={() => handleDdnsDelete(h)} className="text-xs text-red-600 hover:underline">
                          Supprimer
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
            }
            <DdnsAddForm onSaved={refresh} />
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
                <button onClick={() => handleUpnpToggle(!upnpEnabled)} disabled={upnpToggling}
                  className="lb-link text-xs hover:underline disabled:opacity-40">
                  {upnpToggling ? "…" : upnpEnabled ? "Désactiver" : "Activer"}
                </button>
              </span>
            </div>
            <div className="mt-2"><StaleNotice items={upnp.rules} noun={["règle UPnP", "règles UPnP"]} /></div>
            {upnp.rules.length === 0
              ? <p className="mt-2 text-sm lb-text-muted">Aucune règle UPnP.</p>
              : <ul className="mt-2 space-y-1 text-sm">
                  {upnp.rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 border-b lb-border py-1 last:border-0">
                      <span className="min-w-0">
                        <span>{r.name ?? r.id}</span>
                        {r.external_port && (
                          <span className="ml-2 text-xs lb-text-muted">
                            port {r.external_port} → {r.destination_ip || "?"}
                          </span>
                        )}
                        <PresenceBadge presence={r.presence} className="block mt-0.5" />
                      </span>
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

// ── DMZ ──────────────────────────────────────────────────────────────────────
// Firewall:getDMZ/setDMZ/deleteDMZ — la Livebox gère une liste d'entrées
// identifiées (l'interface web d'Orange utilise l'identifiant « webui »).

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function DmzCard({ fallback }) {
  const { data, loading, error, refresh } = useWsData("livebox/dmz", {}, 60_000);
  const runAction = useWsAction();
  const confirm = useConfirm();
  const [ip, setIp] = useState("");
  const [saving, setSaving] = useState(false);
  const entries = data?.entries ?? [];

  const handleAdd = async (e) => {
    e.preventDefault();
    const target = ip.trim();
    if (!IPV4_RE.test(target)) return;
    if (!await confirm({
      title: "Activer la DMZ",
      message: `Exposer ${target} sur Internet ?\n\nTout le trafic entrant non redirigé sera envoyé vers cet appareil, sans filtrage du pare-feu.`,
      danger: true,
    })) return;
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/dmz/set", dmz_id: "webui", ip: target, enabled: true },
        { success: `DMZ activée vers ${target}.` },
      );
      setIp("");
      refresh();
    } catch { /* toast déjà affiché */ } finally { setSaving(false); }
  };

  const handleDelete = async (entry) => {
    if (!await confirm({ title: "Désactiver la DMZ", message: `Supprimer l'entrée DMZ vers ${entry.ip} ?` })) return;
    try {
      await runAction({ type: "livebox/dmz/delete", dmz_id: entry.id }, { success: "Entrée DMZ supprimée." });
      refresh();
    } catch { /* toast déjà affiché */ }
  };

  return (
    <Card title="DMZ">
      <StateBox loading={loading} error={error} />
      {data && !data.supported && fallback && (
        <>
          <Row label="Activée" value={fallback.enabled ? "Oui" : "Non"} />
          <Row label="IP cible" value={fallback.ip} />
        </>
      )}
      {data?.supported && (
        <>
          <StaleNotice items={entries} noun={["entrée DMZ", "entrées DMZ"]} />
          {entries.length === 0
            ? <p className="text-sm lb-text-muted">DMZ désactivée.</p>
            : <ul className="space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 border-b lb-border py-1 last:border-0">
                    <span>
                      <span className="font-medium font-mono">{entry.ip || "—"}</span>
                      <span className="ml-2 text-xs lb-text-muted">
                        {entry.id}{entry.source_prefix ? ` · depuis ${entry.source_prefix}` : ""}
                        {entry.enabled ? "" : " · inactive"}
                      </span>
                      <PresenceBadge presence={entry.presence} className="block mt-0.5" />
                    </span>
                    <button onClick={() => handleDelete(entry)} className="text-xs text-red-600 hover:underline">
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>}
          {entries.length === 0 && (
            <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-1 min-w-36 flex-col gap-1 text-xs lb-text-muted">
                IP de l'appareil exposé
                <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.x"
                  className="lb-input font-mono" />
              </label>
              <button type="submit" disabled={saving || !IPV4_RE.test(ip.trim())}
                className="lb-btn-primary text-xs disabled:opacity-40">
                {saving ? "…" : "Activer la DMZ"}
              </button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

// ── Réponse au ping (Firewall:setRespondToPing) ──────────────────────────────

function PingResponseCard() {
  const { data, loading, error, refresh } = useWsData("livebox/ping_response", {}, 60_000);
  const runAction = useWsAction();
  const [saving, setSaving] = useState(null);

  const toggle = async (family) => {
    if (!data || saving) return;
    const next = { ipv4: !!data.ipv4, ipv6: !!data.ipv6, [family]: !data[family] };
    setSaving(family);
    try {
      await runAction(
        { type: "livebox/ping_response/set", ...next },
        { success: `Réponse au ping ${family === "ipv4" ? "IPv4" : "IPv6"} ${next[family] ? "activée" : "désactivée"}.` },
      );
      refresh();
    } catch { /* toast déjà affiché */ } finally { setSaving(null); }
  };

  return (
    <Card title="Réponse au ping (WAN)">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <p className="mb-2 text-xs lb-text-muted">
            Autorise la Livebox à répondre aux requêtes ICMP (ping) venant d'Internet.
          </p>
          {[["ipv4", "IPv4"], ["ipv6", "IPv6"]].map(([family, label]) => (
            <div key={family} className="flex items-center justify-between border-b lb-border py-1 text-sm last:border-0">
              <span className="lb-text-muted">{label}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium lb-text">{data[family] ? "Répond" : "Ignore"}</span>
                <button onClick={() => toggle(family)} disabled={saving !== null}
                  className="lb-link text-xs hover:underline disabled:opacity-40">
                  {saving === family ? "…" : data[family] ? "Désactiver" : "Activer"}
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

// ── Ajout d'un hôte DynDNS ───────────────────────────────────────────────────

function DdnsAddForm({ onSaved }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="lb-btn-primary mt-3 text-xs">
        + Ajouter un hôte DynDNS
      </button>
    );
  }
  return <DdnsAddFormOpen onClose={() => setOpen(false)} onSaved={onSaved} />;
}

function DdnsAddFormOpen({ onClose, onSaved }) {
  const { data: services } = useWsData("livebox/ddns/services");
  const runAction = useWsAction();
  const [form, setForm] = useState({ service: "", hostname: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const valid = form.service && form.hostname.trim() && form.username.trim() && form.password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/ddns/add", ...form, hostname: form.hostname.trim(), username: form.username.trim() },
        { success: `Hôte ${form.hostname.trim()} ajouté.` },
      );
      onSaved();
      onClose();
    } catch { /* toast déjà affiché */ } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Fournisseur
        {services?.length ? (
          <select value={form.service} onChange={set("service")} className="lb-input">
            <option value="">— choisir —</option>
            {services.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : (
          <input value={form.service} onChange={set("service")} placeholder="dyndns, no-ip…" className="lb-input" />
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom d'hôte
        <input value={form.hostname} onChange={set("hostname")} placeholder="maison.example.net" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Identifiant
        <input value={form.username} onChange={set("username")} autoComplete="off" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Mot de passe
        <input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" className="lb-input" />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={!valid || saving} className="lb-btn-primary text-xs disabled:opacity-40">
          {saving ? "…" : "Ajouter"}
        </button>
        <button type="button" onClick={onClose} className="text-xs lb-text-muted hover:underline">Annuler</button>
      </div>
    </form>
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
      {current && <p className="mb-3 text-sm lb-text-muted">Niveau actuel : <strong className="lb-text">{firewallLabel(current)}</strong></p>}
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
                  {formatRate(result.downstream.rate_mbit)}
                </p>
                {result.downstream.latency_ms != null && <p className="text-sm lb-text-muted">Latence : {result.downstream.latency_ms} ms</p>}
              </div>
            )}
            {result?.upstream && (
              <div className="rounded-lg border lb-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Débit montant ↑</p>
                <p className="text-2xl font-bold lb-text tabular-nums">
                  {formatRate(result.upstream.rate_mbit)}
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
  const confirm = useConfirm();
  const [reconnecting, setReconnecting] = useState(false);
  const [done, setDone] = useState(false);

  const handleReconnect = async () => {
    if (!await confirm({
      title: "Reconnexion WAN",
      message: "Forcer une reconnexion WAN ? La connexion Internet sera coupée brièvement.",
    })) return;
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
      {section === "notifications" && <div className="max-w-2xl"><NtfyCard /></div>}
    </div>
  );
}
