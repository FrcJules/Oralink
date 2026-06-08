import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

const PROTOCOLS = ["TCP", "UDP", "TCP/UDP"];

function AddRuleForm({ onSaved }) {
  const runAction = useWsAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", protocol: "TCP", external_port: "", internal_port: "", destination_ip: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await runAction(
        { type: "livebox/nat/add", ...form },
        { success: `Règle « ${form.name} » ajoutée.` },
      );
      setForm({ name: "", protocol: "TCP", external_port: "", internal_port: "", destination_ip: "" });
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
      <button onClick={() => setOpen(true)} className="lb-btn-primary mb-3">
        + Ajouter une redirection
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom de la règle
        <input value={form.name} onChange={set("name")} required className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Protocole
        <select value={form.protocol} onChange={set("protocol")} className="lb-input">
          {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        IP destination (machine)
        <input value={form.destination_ip} onChange={set("destination_ip")} required placeholder="192.168.1.x" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Port externe (internet)
        <input value={form.external_port} onChange={set("external_port")} required placeholder="8080" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Port interne (machine)
        <input value={form.internal_port} onChange={set("internal_port")} required placeholder="80" className="lb-input" />
      </label>
      <span />
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

export function NatTab() {
  const { data, loading, error, refresh } = useWsData("livebox/nat", {}, 60_000);
  const runAction = useWsAction();
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async (ruleId, ruleName) => {
    setDeleteError(null);
    try {
      await runAction(
        { type: "livebox/nat/delete", rule_id: ruleId },
        { success: `Règle « ${ruleName ?? ruleId} » supprimée.` },
      );
      refresh();
    } catch (err) {
      setDeleteError(err);
    }
  };

  return (
    <Card title="Règles NAT / redirection de ports">
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <AddRuleForm onSaved={refresh} />
          {deleteError && <p className="mb-2 text-xs text-red-600">Erreur : {String(deleteError.message ?? deleteError)}</p>}
          {data.length === 0 ? (
            <p className="text-sm lb-text-muted">Aucune règle NAT configurée.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase lb-text-muted">
                <tr>
                  <th className="py-1.5 pr-3">Nom</th>
                  <th className="py-1.5 pr-3">IP destination</th>
                  <th className="py-1.5 pr-3">Port externe</th>
                  <th className="py-1.5 pr-3">Port interne</th>
                  <th className="py-1.5 pr-3">Protocole</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {data.map((rule) => (
                  <tr key={rule.id} className="border-t lb-border">
                    <td className="py-1.5 pr-3 font-medium">{rule.name ?? rule.id ?? "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.destination_ip || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.external_port || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.internal_port || "—"}</td>
                    <td className="py-1.5 pr-3 lb-text-muted">{rule.protocol || "—"}</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => handleDelete(rule.id, rule.name)}
                        className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  );
}
