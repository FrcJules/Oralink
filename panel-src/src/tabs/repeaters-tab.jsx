import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsCommand } from "../lib/hass-context.jsx";
import { Card, StateBox } from "../components/card.jsx";

function RepeaterForm({ repeater, onSaved }) {
  const callWs = useWsCommand();
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
      await callWs({
        type: "livebox/repeaters/set",
        key: repeater.key,
        ip,
        username,
        ...(password ? { password } : {}),
      });
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
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Adresse IP
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.1.x"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Identifiant
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="admin"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Mot de passe
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={repeater.has_password ? "••••••••" : ""}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
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
      <p className="mb-3 text-xs text-slate-500">
        Adresse IP et identifiants utilisés pour se connecter directement à
        chaque répéteur (nécessaires aux futures fonctionnalités de pilotage).
        Enregistrés en local au format JSON, dans le stockage de Home Assistant.
      </p>
      {data && (
        data.length === 0
          ? <p className="text-sm text-slate-500">Aucun répéteur détecté dans la topologie.</p>
          : <div className="space-y-4">
              {data.map((repeater) => (
                <div key={repeater.key} className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-medium text-slate-900">📡 {repeater.name}</p>
                  <RepeaterForm repeater={repeater} onSaved={refresh} />
                </div>
              ))}
            </div>
      )}
    </Card>
  );
}
