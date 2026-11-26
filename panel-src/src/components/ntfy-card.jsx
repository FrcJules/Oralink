/**
 * Notifications ntfy (Administration → Notifications) — livebox/notifications*.
 * Oralink publie directement sur ntfy, sans automatisation HA ni appli mobile HA.
 */
import { useState } from "react";
import { Bell } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "./card.jsx";

const ALERTS = [
  { key: "new_device", label: "Nouvel appareil sur le réseau", hint: "Avec un bouton « Couper Internet »." },
  { key: "upnp", label: "Un appareil ouvre un port sur Internet (UPnP)", hint: "À la première ouverture de chaque appareil." },
  { key: "upnp_all", label: "… à chaque ouverture de port UPnP", hint: "Plus bavard : les consoles et décodeurs en ouvrent souvent.", sub: true },
  { key: "pause_end", label: "Fin d'une pause Internet de groupe" },
  { key: "guest_off", label: "Wi-Fi invité éteint par son minuteur" },
];

export function NtfyCard() {
  const { data, loading, error, refresh } = useWsData("livebox/notifications");
  return (
    <Card title={<span className="flex items-center gap-2"><Bell className="size-4" /> Notifications ntfy</span>}>
      <StateBox loading={loading} error={error} />
      {/* Remonté à chaque nouvelle réponse : le formulaire part des valeurs enregistrées. */}
      {data && <NtfyForm key={JSON.stringify(data)} saved={data} onSaved={refresh} />}
    </Card>
  );
}

function NtfyForm({ saved, onSaved }) {
  const runAction = useWsAction();
  const [form, setForm] = useState({
    enabled: saved.enabled, server: saved.server || "https://ntfy.sh", topic: saved.topic,
    alerts: { ...saved.alerts }, actions: saved.actions,
  });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(null);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setAlert = (key, value) => setForm((f) => ({ ...f, alerts: { ...f.alerts, [key]: value } }));
  const dirty = token !== "" || JSON.stringify(form) !== JSON.stringify({
    enabled: saved.enabled, server: saved.server || "https://ntfy.sh", topic: saved.topic,
    alerts: saved.alerts, actions: saved.actions,
  });

  const save = async (extra = {}) => {
    setBusy("save");
    try {
      await runAction(
        { type: "livebox/notifications/set", ...form, ...(token ? { token } : {}), ...extra },
        { success: "Réglages des notifications enregistrés." },
      );
      setToken("");
      onSaved();
    } catch { /* toast */ } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy("test");
    try {
      if (dirty) await save();
      await runAction({ type: "livebox/notifications/test" }, { success: "Notification de test envoyée." });
    } catch { /* toast */ } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs lb-text-muted">
        Oralink envoie ses alertes directement sur un topic{" "}
        <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="lb-link hover:underline">ntfy</a>
        {" "}(serveur public ou auto-hébergé). Abonnez-vous au topic dans l'appli ntfy de votre téléphone.
        Les événements restent aussi publiés dans Home Assistant pour vos automatisations.
      </p>

      <label className="flex items-center gap-2 font-medium lb-text">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Activer les notifications ntfy
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs lb-text-muted">
          Serveur
          <input value={form.server} onChange={(e) => set("server", e.target.value)}
            placeholder="https://ntfy.sh" className="lb-input" />
        </label>
        <label className="flex flex-col gap-1 text-xs lb-text-muted">
          Topic (lettres, chiffres, - _)
          <input value={form.topic} onChange={(e) => set("topic", e.target.value)}
            pattern="[A-Za-z0-9_\-]{1,64}" placeholder="livebox-maison" className="lb-input font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-2">
          Jeton d'accès (facultatif — serveur protégé)
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
            placeholder={saved.token_set ? "•••••• (enregistré — laisser vide pour le garder)" : "tk_…"}
            className="lb-input font-mono" />
        </label>
        {saved.token_set && (
          <button type="button" onClick={() => save({ clear_token: true })}
            className="justify-self-start text-xs text-red-600 hover:underline">
            Supprimer le jeton enregistré
          </button>
        )}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-medium uppercase lb-text-muted">Alertes</legend>
        {ALERTS.map((a) => (
          <label key={a.key} className={`flex items-start gap-2 ${a.sub ? "ml-6" : ""}`}>
            <input type="checkbox" className="mt-0.5" checked={!!form.alerts[a.key]}
              disabled={a.sub && !form.alerts.upnp}
              onChange={(e) => setAlert(a.key, e.target.checked)} />
            <span>
              <span className="lb-text">{a.label}</span>
              {a.hint && <span className="block text-xs lb-text-muted">{a.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={form.actions} onChange={(e) => set("actions", e.target.checked)} />
        <span>
          <span className="lb-text">Boutons d'action dans les notifications</span>
          <span className="block text-xs lb-text-muted">
            « Couper Internet » puis « Rétablir », via un webhook Home Assistant (jeton à usage unique, 24 h).
            {!saved.external_url && " ⚠ Aucune URL externe n'est configurée dans Home Assistant : les boutons ne seront pas ajoutés."}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => save()} disabled={busy !== null || !dirty} className="lb-btn-primary disabled:opacity-40">
          {busy === "save" ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button onClick={test} disabled={busy !== null || !form.topic || !form.enabled} className="lb-btn-outline disabled:opacity-40">
          {busy === "test" ? "Envoi…" : "Envoyer une notification de test"}
        </button>
      </div>
    </div>
  );
}
