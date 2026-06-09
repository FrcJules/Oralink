import { useState } from "react";
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

function VoipTrunksCard() {
  const { data, loading, error } = useWsData("livebox/voip/trunks", {}, 120_000);
  const trunks = Array.isArray(data) ? data : (data && typeof data === "object" ? Object.values(data) : []);

  return (
    <Card title="Lignes VoIP (trunks)">
      <StateBox loading={loading} error={error} />
      {!loading && !error && trunks.length === 0 && (
        <p className="text-sm lb-text-muted">Aucun trunk VoIP configuré ou service non disponible.</p>
      )}
      {trunks.map((trunk, i) => (
        <div key={i} className="mb-3 rounded-lg border lb-border p-2">
          <p className="mb-1 font-medium text-sm lb-text">{trunk.Name || trunk.name || `Ligne ${i + 1}`}</p>
          {trunk.Status != null && <Row label="Statut" value={trunk.Status} />}
          {trunk.Enable != null && <Row label="Activé" value={trunk.Enable ? "Oui" : "Non"} />}
          {trunk.DirectoryNumber && <Row label="Numéro" value={trunk.DirectoryNumber} />}
          {trunk.RegistrarServer && <Row label="Serveur SIP" value={trunk.RegistrarServer} />}
          {trunk.AuthUserName && <Row label="Utilisateur SIP" value={trunk.AuthUserName} />}
          {trunk.URI && <Row label="URI" value={trunk.URI} />}
        </div>
      ))}
    </Card>
  );
}

function AddContactForm({ onSaved }) {
  const runAction = useWsAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", first_name: "", cell: "", home: "", work: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await runAction(
        { type: "livebox/phone/contacts/add", ...form },
        { success: `Contact « ${form.name} » ajouté.` },
      );
      setForm({ name: "", first_name: "", cell: "", home: "", work: "" });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="lb-btn-primary mb-3"
      >
        + Ajouter un contact
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom
        <input value={form.name} onChange={set("name")} required className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Prénom
        <input value={form.first_name} onChange={set("first_name")} className="lb-input" />
      </label>
      <span />
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Mobile
        <input value={form.cell} onChange={set("cell")} className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Domicile
        <input value={form.home} onChange={set("home")} className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Travail
        <input value={form.work} onChange={set("work")} className="lb-input" />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={saving} className="lb-btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="lb-btn-outline">
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-red-600 sm:col-span-3">Erreur : {String(error.message ?? error)}</p>}
    </form>
  );
}

const STATUS_LABEL = { missed: "Manqué", incoming: "Entrant", outgoing: "Sortant", accepted: "Reçu" };

export function PhoneTab() {
  const { data, loading, error, refresh } = useWsData("livebox/phone", {}, 60_000);
  const runAction = useWsAction();
  const { callers = [], contacts = [] } = data ?? {};

  const handleDelete = async (id, name) => {
    if (!window.confirm("Supprimer ce contact du carnet de la Livebox ?")) return;
    await runAction(
      { type: "livebox/phone/contacts/delete", unique_id: id },
      { success: `Contact « ${name ?? id} » supprimé.` },
    );
    refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Historique d'appels">
        <StateBox loading={loading} error={error} />
        {data && (
          callers.length === 0
            ? <p className="text-sm lb-text-muted">Aucun appel enregistré.</p>
            : <ul className="space-y-1 text-sm">
                {callers.slice(0, 30).map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b lb-border py-1 last:border-0">
                    <span className="font-medium lb-text">{c.phone_number || "Numéro masqué"}</span>
                    <span className="text-xs lb-text-muted">
                      {STATUS_LABEL[c.status] ?? c.status} · {c.date} {c.duration ? `· ${c.duration}s` : ""}
                    </span>
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <Card title="Carnet de contacts (Livebox)">
        <AddContactForm onSaved={refresh} />
        {data && (
          contacts.length === 0
            ? <p className="text-sm lb-text-muted">Aucun contact enregistré sur la Livebox.</p>
            : <ul className="space-y-1 text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b lb-border py-1 last:border-0">
                    <span>
                      <span className="font-medium lb-text">{c.name}</span>
                      <span className="ml-2 text-xs lb-text-muted">{[c.cell, c.home, c.work].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button onClick={() => handleDelete(c.id, c.name)} className="text-xs text-red-600 hover:underline">
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
        )}
      </Card>

      <VoipTrunksCard />
    </div>
  );
}
