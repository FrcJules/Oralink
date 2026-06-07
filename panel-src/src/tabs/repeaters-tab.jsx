import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

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
        {
          type: "livebox/repeaters/set",
          key: repeater.key,
          ip,
          username,
          ...(password ? { password } : {}),
        },
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
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.1.x"
          className="lb-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Identifiant
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="admin"
          className="lb-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Mot de passe
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={repeater.has_password ? "••••••••" : ""}
          className="lb-input"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="lb-btn-primary"
      >
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
      {error && <p className="text-xs text-red-600 sm:col-span-4">Erreur : {String(error.message ?? error)}</p>}
    </form>
  );
}

export function RepeatersTab() {
  const { data, loading, error, refresh } = useWsData("livebox/repeaters");

  return (
    <Card title="Répéteurs Wifi — paramètres de connexion">
      <StateBox loading={loading} error={error} />
      <p className="mb-3 text-xs lb-text-muted">
        Adresse IP et identifiants utilisés pour se connecter directement à
        chaque répéteur (nécessaires aux futures fonctionnalités de pilotage).
        Enregistrés en local au format JSON, dans le stockage de Home Assistant.
      </p>
      {data && (
        data.length === 0
          ? <p className="text-sm lb-text-muted">Aucun répéteur détecté dans la topologie.</p>
          : <div className="space-y-4">
              {data.map((repeater) => (
                <div key={repeater.key} className="rounded-lg border lb-border p-3">
                  <p className="mb-2 text-sm font-medium lb-text">📡 {repeater.name}</p>
                  <RepeaterForm repeater={repeater} onSaved={refresh} />
                </div>
              ))}
            </div>
      )}
    </Card>
  );
}
