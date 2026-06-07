import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsCommand } from "../lib/hass-context.jsx";
import { Card, StateBox } from "../components/card.jsx";

function AddContactForm({ onSaved }) {
  const callWs = useWsCommand();
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
      await callWs({ type: "livebox/phone/contacts/add", ...form });
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
        className="mb-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        + Ajouter un contact
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Nom
        <input value={form.name} onChange={set("name")} required className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Prénom
        <input value={form.first_name} onChange={set("first_name")} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
      </label>
      <span />
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Mobile
        <input value={form.cell} onChange={set("cell")} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Domicile
        <input value={form.home} onChange={set("home")} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Travail
        <input value={form.work} onChange={set("work")} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-red-600 sm:col-span-3">Erreur : {String(error.message ?? error)}</p>}
    </form>
  );
}

const STATUS_LABEL = { missed: "Manqué", incoming: "Entrant", outgoing: "Sortant", accepted: "Reçu" };

export function PhoneTab() {
  const { data, loading, error, refresh } = useWsData("livebox/phone");
  const callWs = useWsCommand();
  const { callers = [], contacts = [] } = data ?? {};

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer ce contact du carnet de la Livebox ?")) return;
    await callWs({ type: "livebox/phone/contacts/delete", unique_id: id });
    refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Historique d'appels">
        <StateBox loading={loading} error={error} />
        {data && (
          callers.length === 0
            ? <p className="text-sm text-slate-500">Aucun appel enregistré.</p>
            : <ul className="space-y-1 text-sm">
                {callers.slice(0, 30).map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
                    <span className="font-medium text-slate-900">{c.phone_number || "Numéro masqué"}</span>
                    <span className="text-xs text-slate-500">
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
            ? <p className="text-sm text-slate-500">Aucun contact enregistré sur la Livebox.</p>
            : <ul className="space-y-1 text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1 last:border-0">
                    <span>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{[c.cell, c.home, c.work].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 hover:underline">
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
        )}
      </Card>
    </div>
  );
}
