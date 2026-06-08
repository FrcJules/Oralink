import { useState } from "react";
import { Clock, HardDrive, Zap, ZapOff } from "lucide-react";
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
    } finally {
      setSaving(false);
    }
  };

  if (value == null) {
    return <p className="text-sm lb-text-muted">{label} : non disponible sur ce modèle.</p>;
  }

  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <span className="w-32 lb-text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        className="flex-1"
        disabled={saving}
      />
      <span className="w-10 text-right font-medium lb-text">{level}%</span>
    </div>
  );
}

function ToggleButton({ label, value, onToggle }) {
  if (value == null) {
    return <p className="text-sm lb-text-muted">{label} : non disponible sur ce modèle.</p>;
  }
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
    : typeof data?.ntp_servers === "string"
    ? data.ntp_servers
    : null;

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
    } finally {
      setTogglingUsb3(false);
    }
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
          {hosts.map((h, i) => (
            <Row key={i} label={h.Name || `Appareil ${i + 1}`} value={h.DeviceClass || h.Type} />
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => handleUsb3Toggle(true)}
          disabled={togglingUsb3}
          className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]"
        >
          Activer USB 3.0
        </button>
        <button
          onClick={() => handleUsb3Toggle(false)}
          disabled={togglingUsb3}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
        >
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
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Zap className="size-4" /> Gestion de l'énergie</span>}>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <Row label="Mode éco actif" value={enabled ? "Oui" : "Non"} />
          <Row label="Statut" value={data.status ? "Actif" : "Inactif"} />
          <Row label="Mode de configuration" value={data.mode} />
          {data.power_watts != null && (
            <Row label="Consommation" value={`${data.power_watts} W`} />
          )}
          <div className="mt-3">
            <button
              onClick={handleToggle}
              disabled={toggling || loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                enabled
                  ? "border border-orange-300 text-orange-700 hover:bg-orange-50"
                  : "lb-btn-primary"
              }`}
            >
              {toggling ? "Modification…" : enabled ? "Désactiver le mode éco" : "Activer le mode éco"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

export function SystemTab() {
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
      await runAction(
        { type: "livebox/system/backup/run" },
        { success: "Sauvegarde demandée." },
      );
      refresh();
    } catch {
      // toast déjà affiché par runAction
    }
  };

  const handleRestore = async () => {
    if (!window.confirm("Restaurer la configuration depuis la dernière sauvegarde ? La Livebox va redémarrer.")) return;
    try {
      await runAction(
        { type: "livebox/system/restore/run" },
        { success: "Restauration demandée — la Livebox va redémarrer." },
      );
      refresh();
    } catch {
      // toast déjà affiché par runAction
    }
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
            <ToggleButton
              label="Sauvegarde automatique"
              value={backup.auto_enabled}
              onToggle={handleAutoBackup}
            />
            <div className="flex gap-2 pt-2">
              <button onClick={handleBackupNow} className="lb-btn-primary">
                Sauvegarder maintenant
              </button>
              <button
                onClick={handleRestore}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
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
