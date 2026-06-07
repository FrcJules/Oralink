import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

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

export function SystemTab() {
  const { data, loading, error, refresh } = useWsData("livebox/system");
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
            <div className="flex justify-between border-b lb-border py-1 text-sm">
              <span className="lb-text-muted">Statut</span>
              <span className="font-medium lb-text">{backup.status || "—"}</span>
            </div>
            <div className="flex justify-between border-b lb-border py-1 text-sm">
              <span className="lb-text-muted">Dernière sauvegarde</span>
              <span className="font-medium lb-text">{backup.last_backup || "—"}</span>
            </div>
            <ToggleButton
              label="Sauvegarde automatique"
              value={backup.auto_enabled}
              onToggle={handleAutoBackup}
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleBackupNow}
                className="lb-btn-primary"
              >
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
    </div>
  );
}
