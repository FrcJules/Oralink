/**
 * Onglet Réseau — combine :
 *   • Interfaces live (NeMo.Intf, 3 s)
 *   • DHCP (statiques, dynamiques, Wifi invité)
 *   • NAT / redirection de ports
 */
import { useState, useEffect } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";
import { useConfirm } from "../lib/confirm-context.jsx";

function fmtBytes(b) {
  if (b == null || b === 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)} ${units[i]}`;
}

function fmtRate(mbit) {
  if (mbit == null) return "—";
  if (mbit < 0.01) return "< 0.01 Mbit/s";
  if (mbit >= 1000) return `${(mbit / 1000).toFixed(2)} Gbit/s`;
  if (mbit >= 1) return `${mbit.toFixed(2)} Mbit/s`;
  return `${(mbit * 1000).toFixed(0)} Kbit/s`;
}

const TYPE_COLOR = {
  ont: "#2563eb", wan: "#2563eb",
  lan: "#16a34a", eth: "#7c3aed",
  wif: "#f59e0b", wig: "#94a3b8",
};

// ── Interfaces ────────────────────────────────────────────────────────────────

function IfaceRow({ iface }) {
  const hasRate = iface.rate_rx != null;
  const color = TYPE_COLOR[iface.type] ?? "#94a3b8";
  const maxRate = hasRate ? Math.max(iface.rate_rx, iface.rate_tx, 0.001) : 0;
  return (
    <div className="border-b lb-border py-2 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium lb-text">{iface.name}</span>
          <span className="text-xs lb-text-muted">({iface.key})</span>
        </div>
        <div className="text-right tabular-nums text-xs lb-text-muted">
          {fmtBytes(iface.rx_bytes)} / {fmtBytes(iface.tx_bytes)}
        </div>
      </div>
      {hasRate && (
        <div className="mt-1.5 flex gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs">
              <span className="lb-text-muted">↓</span>
              <span className="font-medium lb-text">{fmtRate(iface.rate_rx)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--secondary-background-color)]">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, (iface.rate_rx / maxRate) * 100)}%`,
                backgroundColor: color,
              }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs">
              <span className="lb-text-muted">↑</span>
              <span className="font-medium lb-text">{fmtRate(iface.rate_tx)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--secondary-background-color)]">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, (iface.rate_tx / maxRate) * 100)}%`,
                backgroundColor: color,
                opacity: 0.7,
              }} />
            </div>
          </div>
        </div>
      )}
      {!hasRate && (
        <div className="mt-0.5 text-xs lb-text-muted italic">En attente d'un second relevé…</div>
      )}
    </div>
  );
}

export function InterfacesCard() {
  const { data: liveIfaces, loading } = useWsData("livebox/interfaces/live", {}, 3_000);
  return (
    <Card title="Interfaces réseau (live)">
      {loading && !liveIfaces && <p className="text-sm lb-text-muted">Chargement…</p>}
      {liveIfaces && liveIfaces.length === 0 && (
        <p className="text-sm lb-text-muted">Aucune interface remontée.</p>
      )}
      {liveIfaces && liveIfaces.map((iface) => (
        <IfaceRow key={iface.key} iface={iface} />
      ))}
    </Card>
  );
}

// ── DHCP ──────────────────────────────────────────────────────────────────────

function StaticLeaseTable({ leases, empty, onRefresh }) {
  const runAction = useWsAction();
  const [deletingMac, setDeletingMac] = useState(null);

  const handleDelete = async (mac) => {
    setDeletingMac(mac);
    try {
      await runAction(
        { type: "livebox/dhcp_static/delete", mac },
        { success: `Réservation ${mac} supprimée.` },
      );
      onRefresh();
    } catch { /* toast */ } finally { setDeletingMac(null); }
  };

  if (!leases?.length) return <p className="text-sm lb-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[45vh]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 text-xs uppercase lb-text-muted bg-[var(--card-background-color)]">
          <tr>
            <th className="py-1.5 pr-3">Équipement</th>
            <th className="py-1.5 pr-3">Adresse IP statique</th>
            <th className="py-1.5 pr-3">Adresse MAC</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {leases.map((l) => (
            <tr key={l.mac} className="border-t lb-border">
              <td className="py-1.5 pr-3 font-medium">{l.name || "—"}</td>
              <td className="py-1.5 pr-3 lb-text-muted">{l.ip || "—"}</td>
              <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{l.mac || "—"}</td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => handleDelete(l.mac)}
                  disabled={deletingMac === l.mac}
                  className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  {deletingMac === l.mac ? "…" : "Supprimer"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DynamicLeaseTable({ leases, empty, onAddStatic }) {
  if (!leases?.length) return <p className="text-sm lb-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[45vh]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 text-xs uppercase lb-text-muted bg-[var(--card-background-color)]">
          <tr>
            <th className="py-1.5 pr-3">Équipement</th>
            <th className="py-1.5 pr-3">Adresse IP dynamique</th>
            <th className="py-1.5 pr-3">Adresse MAC</th>
            {onAddStatic && <th className="py-1.5" />}
          </tr>
        </thead>
        <tbody>
          {leases.map((l) => (
            <tr key={l.mac} className="border-t lb-border">
              <td className="py-1.5 pr-3 font-medium">{l.name || "—"}</td>
              <td className="py-1.5 pr-3 lb-text-muted">{l.ip || "—"}</td>
              <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{l.mac || "—"}</td>
              {onAddStatic && (
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => onAddStatic(l)}
                    className="text-xs lb-text-muted hover:underline"
                    title="Attribuer une IP fixe"
                  >
                    → IP fixe
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleLeaseTable({ leases, empty }) {
  if (!leases?.length) return <p className="text-sm lb-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[40vh]">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase lb-text-muted">
          <tr>
            <th className="py-1.5 pr-3">Équipement</th>
            <th className="py-1.5 pr-3">IP</th>
            <th className="py-1.5 pr-3">MAC</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((l, i) => (
            <tr key={l.mac || i} className="border-t lb-border">
              <td className="py-1.5 pr-3 font-medium">{l.name || "—"}</td>
              <td className="py-1.5 pr-3 lb-text-muted">{l.ip || "—"}</td>
              <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{l.mac || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DhcpSection() {
  const { data, loading, error, refresh } = useWsData("livebox/dhcp", {}, 30_000);
  const [prefill, setPrefill] = useState(null);

  const handleAddStatic = (lease) => {
    setPrefill(lease);
    // scroll to top of static card
    document.getElementById("dhcp-static-card")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Card title="DHCP statiques" id="dhcp-static-card">
        <StateBox loading={loading} error={error} />
        {data && (
          <>
            <p className="mb-3 text-xs lb-text-muted">
              Attribuez vous-même une adresse IP à votre équipement.
            </p>
            <AddStaticFormControlled
              dynamicLeases={data.dynamic}
              prefill={prefill}
              onPrefillUsed={() => setPrefill(null)}
              onSaved={refresh}
            />
            <StaticLeaseTable
              leases={data.static}
              empty="Aucune réservation DHCP statique."
              onRefresh={refresh}
            />
          </>
        )}
      </Card>
      <Card title="Baux DHCP dynamiques">
        {data && (
          <>
            <p className="mb-3 text-xs lb-text-muted">
              Équipements dont l'adresse IP est attribuée automatiquement par la Livebox.
            </p>
            <DynamicLeaseTable
              leases={data.dynamic}
              empty="Aucun bail DHCP dynamique."
              onAddStatic={handleAddStatic}
            />
          </>
        )}
      </Card>
      <Card title="Wifi invité">
        {data && <SimpleLeaseTable leases={data.guest} empty="Aucun appareil sur le Wifi invité." />}
      </Card>
    </>
  );
}

function AddStaticFormControlled({ dynamicLeases, prefill, onPrefillUsed, onSaved }) {
  const runAction = useWsAction();
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState("");
  const [ip, setIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // When parent pre-fills (from "→ IP fixe" button), open form and fill fields
  useEffect(() => {
    if (prefill) {
      setMac(prefill.mac || "");
      setIp(prefill.ip || "");
      setOpen(true);
      onPrefillUsed?.();
    }
  }, [prefill]);

  const selectDevice = (e) => {
    const val = e.target.value;
    if (!val) { setMac(""); setIp(""); return; }
    const [selMac, selIp] = val.split("|");
    setMac(selMac || "");
    setIp(selIp || "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/dhcp_static/add", mac: mac.trim(), ip: ip.trim() },
        { success: `IP statique ${ip.trim()} attribuée à ${mac.trim()}.` },
      );
      setMac(""); setIp(""); setOpen(false);
      onSaved();
    } catch (err) { setFormError(err); } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="lb-btn-primary mb-3 text-xs">
        + Ajouter un bail statique
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border lb-border p-3 grid gap-2 sm:grid-cols-2">
      {dynamicLeases?.length > 0 && (
        <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-2">
          Choisir un équipement connu
          <select onChange={selectDevice} value={`${mac}|${ip}`} className="lb-input">
            <option value="|">— sélectionner —</option>
            {dynamicLeases.map((l) => (
              <option key={l.mac} value={`${l.mac}|${l.ip}`}>
                {l.name || l.mac} — {l.ip}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Adresse MAC
        <input value={mac} onChange={(e) => setMac(e.target.value)} required
          placeholder="AA:BB:CC:DD:EE:FF" className="lb-input font-mono" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Adresse IP statique
        <input value={ip} onChange={(e) => setIp(e.target.value)} required
          placeholder="192.168.1.x" className="lb-input" />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={saving || !mac.trim() || !ip.trim()} className="lb-btn-primary">
          {saving ? "Enregistrement…" : "Attribuer"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMac(""); setIp(""); setFormError(null); }}
          className="lb-btn-outline">
          Annuler
        </button>
      </div>
      {formError && <p className="text-xs text-red-600 sm:col-span-2">Erreur : {String(formError.message ?? formError)}</p>}
    </form>
  );
}

// ── NAT ───────────────────────────────────────────────────────────────────────

const PROTOCOLS = ["TCP", "UDP", "TCP/UDP"];

function AddRuleForm({ onSaved }) {
  const runAction = useWsAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", protocol: "TCP", external_port: "", internal_port: "", destination_ip: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await runAction({ type: "livebox/nat/add", ...form }, { success: `Règle « ${form.name} » ajoutée.` });
      setForm({ name: "", protocol: "TCP", external_port: "", internal_port: "", destination_ip: "" });
      setOpen(false);
      onSaved();
    } catch (err) { setFormError(err); } finally { setSaving(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} className="lb-btn-primary mb-3">+ Ajouter une redirection</button>;

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
        <button type="submit" disabled={saving} className="lb-btn-primary">{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" onClick={() => setOpen(false)} className="lb-btn-outline">Annuler</button>
      </div>
      {formError && <p className="text-xs text-red-600 sm:col-span-3">Erreur : {String(formError.message ?? formError)}</p>}
    </form>
  );
}

function NatSection() {
  const { data, loading, error, refresh } = useWsData("livebox/nat", {}, 60_000);
  const runAction = useWsAction();
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async (ruleId, ruleName) => {
    setDeleteError(null);
    try {
      await runAction({ type: "livebox/nat/delete", rule_id: ruleId }, { success: `Règle « ${ruleName ?? ruleId} » supprimée.` });
      refresh();
    } catch (err) { setDeleteError(err); }
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
            <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 text-xs uppercase lb-text-muted bg-[var(--card-background-color)]">
                  <tr>
                    <th className="py-1.5 pr-3">Nom</th>
                    <th className="py-1.5 pr-3">IP destination</th>
                    <th className="py-1.5 pr-3">Port ext.</th>
                    <th className="py-1.5 pr-3">Port int.</th>
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
                      <td className="py-1.5 pr-3 lb-text-muted">{PROTOCOL_LABELS[rule.protocol] ?? formatProtocols(rule.protocol)}</td>
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
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// Protocoles IP courants pour la redirection de protocole (numéros IANA)
const PTF_PROTOCOLS = [
  { value: "47", label: "GRE (47) — VPN PPTP" },
  { value: "50", label: "ESP (50) — VPN IPsec" },
  { value: "51", label: "AH (51) — IPsec" },
  { value: "41", label: "IPv6-in-IPv4 (41)" },
  { value: "custom", label: "Autre (numéro)…" },
];
const PTF_PROTOCOL_NAMES = { 1: "ICMP", 6: "TCP", 17: "UDP", 41: "IPv6", 47: "GRE", 50: "ESP", 51: "AH" };
const formatProtocols = (value) => String(value || "")
  .split(",").filter(Boolean)
  .map((n) => PTF_PROTOCOL_NAMES[n] ? `${PTF_PROTOCOL_NAMES[n]} (${n})` : n).join(", ") || "—";

const EMPTY_PTF = { name: "", protocol: "47", custom: "", destination_ip: "" };

function AddPtfRuleForm({ onSaved }) {
  const runAction = useWsAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PTF);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const protocol = form.protocol === "custom" ? form.custom.trim() : form.protocol;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await runAction(
        { type: "livebox/ptf/add", name: form.name.trim(), protocol, destination_ip: form.destination_ip.trim() },
        { success: `Règle « ${form.name.trim()} » ajoutée.` },
      );
      setForm(EMPTY_PTF);
      setOpen(false);
      onSaved();
    } catch (err) { setFormError(err); } finally { setSaving(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} className="lb-btn-primary mb-3">+ Ajouter une redirection de protocole</button>;

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom de la règle
        <input value={form.name} onChange={set("name")} required maxLength={64} className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Protocole IP
        <select value={form.protocol} onChange={set("protocol")} className="lb-input">
          {PTF_PROTOCOLS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      {form.protocol === "custom" ? (
        <label className="flex flex-col gap-1 text-xs lb-text-muted">
          Numéro de protocole (0-255)
          <input value={form.custom} onChange={set("custom")} required pattern="\d{1,3}" placeholder="47" className="lb-input" />
        </label>
      ) : <span />}
      <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-2">
        IP de destination (machine du réseau)
        <input value={form.destination_ip} onChange={set("destination_ip")} required placeholder="192.168.1.x" className="lb-input font-mono" />
      </label>
      <span />
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={saving} className="lb-btn-primary">{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" onClick={() => setOpen(false)} className="lb-btn-outline">Annuler</button>
      </div>
      {formError && <p className="text-xs text-red-600 sm:col-span-3">Erreur : {String(formError.message ?? formError)}</p>}
    </form>
  );
}

function PtfSection() {
  const { data, loading, error, refresh } = useWsData("livebox/ptf", {}, 60_000);
  const runAction = useWsAction();
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async (ruleId, ruleName) => {
    setDeleteError(null);
    try {
      await runAction({ type: "livebox/ptf/delete", rule_id: ruleId }, { success: `Règle « ${ruleName ?? ruleId} » supprimée.` });
      refresh();
    } catch (err) { setDeleteError(err); }
  };

  return (
    <Card title="Redirection de protocole">
      <p className="mb-3 text-xs lb-text-muted">
        Redirige un protocole IP entier (sans notion de port) vers une machine du réseau — typiquement
        GRE pour un serveur VPN PPTP, ou ESP/AH pour IPsec. Pour des ports TCP/UDP, utilisez le NAT ci-dessus.
      </p>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <AddPtfRuleForm onSaved={refresh} />
          {deleteError && <p className="mb-2 text-xs text-red-600">Erreur : {String(deleteError.message ?? deleteError)}</p>}
          {data.length === 0 ? (
            <p className="text-sm lb-text-muted">Aucune règle PTF configurée.</p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 text-xs uppercase lb-text-muted bg-[var(--card-background-color)]">
                  <tr>
                    <th className="py-1.5 pr-3">Nom</th>
                    <th className="py-1.5 pr-3">Protocole</th>
                    <th className="py-1.5 pr-3">Destination</th>
                    <th className="py-1.5 pr-3">État</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((rule) => (
                    <tr key={rule.id} className="border-t lb-border">
                      <td className="py-1.5 pr-3 font-medium">{rule.name ?? rule.id ?? "—"}</td>
                      <td className="py-1.5 pr-3 lb-text-muted">{formatProtocols(rule.protocol)}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted">{rule.destination_ip || "—"}</td>
                      <td className="py-1.5 pr-3 lb-text-muted">{rule.enable ? "Active" : "Inactive"}</td>
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
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Pare-feu IPv6 (pinholes) ──────────────────────────────────────────────────

const EMPTY_PINHOLE = { name: "", protocol: "TCP", port: "", destination_ip: "" };

function AddPinholeForm({ onSaved }) {
  const runAction = useWsAction();
  const { data: devices } = useWsData("livebox/devices", {}, 60_000);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PINHOLE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const withIpv6 = (devices ?? []).filter((d) => d.ipv6 && d.active);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await runAction(
        { type: "livebox/ipv6/pinhole/add", name: form.name.trim(), protocol: form.protocol,
          port: form.port.trim(), destination_ip: form.destination_ip.trim() },
        { success: `Port ${form.port.trim()} ouvert en IPv6.` },
      );
      setForm(EMPTY_PINHOLE);
      setOpen(false);
      onSaved();
    } catch (err) { setFormError(err); } finally { setSaving(false); }
  };

  if (!open) return <button onClick={() => setOpen(true)} className="lb-btn-primary mb-3">+ Ouvrir un port IPv6</button>;

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-3">
      {withIpv6.length > 0 && (
        <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-3">
          Appareil (adresse IPv6 globale)
          <select value={form.destination_ip} onChange={set("destination_ip")} className="lb-input">
            <option value="">— sélectionner —</option>
            {withIpv6.map((d) => <option key={d.mac} value={d.ipv6}>{d.name} — {d.ipv6}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom (lettres, chiffres, - _)
        <input value={form.name} onChange={set("name")} required pattern="[A-Za-z0-9_\-]{1,32}" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Protocole
        <select value={form.protocol} onChange={set("protocol")} className="lb-input">
          {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Port ou plage (ex. 443 ou 8000-8010)
        <input value={form.port} onChange={set("port")} required pattern="\d{1,5}(-\d{1,5})?" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-3">
        Adresse IPv6 de destination
        <input value={form.destination_ip} onChange={set("destination_ip")} required placeholder="2a01:…" className="lb-input font-mono" />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={saving} className="lb-btn-primary">{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <button type="button" onClick={() => setOpen(false)} className="lb-btn-outline">Annuler</button>
      </div>
      {formError && <p className="text-xs text-red-600 sm:col-span-3">Erreur : {String(formError.message ?? formError)}</p>}
    </form>
  );
}

const PROTOCOL_LABELS = { "6": "TCP", "17": "UDP", "6,17": "TCP/UDP" };

function PinholeSection() {
  const { data, loading, error, refresh } = useWsData("livebox/ipv6/pinholes", {}, 60_000);
  const runAction = useWsAction();
  const confirm = useConfirm();

  const handleDelete = async (rule) => {
    if (!await confirm({ title: "Fermer le port IPv6", message: `Supprimer « ${rule.name} » (port ${rule.port} vers ${rule.destination_ip}) ?`, danger: true })) return;
    try {
      await runAction({ type: "livebox/ipv6/pinhole/delete", rule_id: rule.rule_id, origin: rule.origin || "webui" },
        { success: `Règle « ${rule.name} » supprimée.` });
      refresh();
    } catch { /* toast déjà affiché */ }
  };

  if (data && !data.supported) return null;

  return (
    <Card title="Pare-feu IPv6 (ouvertures de ports)">
      <p className="mb-3 text-xs lb-text-muted">
        En IPv6 il n'y a pas de NAT : chaque appareil a sa propre adresse publique, mais le pare-feu
        de la Livebox bloque les connexions entrantes. Une règle ouvre un port vers une adresse précise.
      </p>
      <StateBox loading={loading} error={error} />
      {data && (
        <>
          <AddPinholeForm onSaved={refresh} />
          {data.rules.length === 0 ? (
            <p className="text-sm lb-text-muted">Aucun port IPv6 ouvert.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase lb-text-muted">
                  <tr>
                    <th className="py-1.5 pr-3">Nom</th>
                    <th className="py-1.5 pr-3">Protocole</th>
                    <th className="py-1.5 pr-3">Port</th>
                    <th className="py-1.5 pr-3">Destination</th>
                    <th className="py-1.5 pr-3">Origine</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((rule) => (
                    <tr key={rule.rule_id} className="border-t lb-border">
                      <td className="py-1.5 pr-3 font-medium">{rule.name}</td>
                      <td className="py-1.5 pr-3 lb-text-muted">{PROTOCOL_LABELS[rule.protocol] ?? rule.protocol}</td>
                      <td className="py-1.5 pr-3 lb-text-muted">{rule.port}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs lb-text-muted break-all">{rule.destination_ip}</td>
                      <td className="py-1.5 pr-3 lb-text-muted">{rule.origin === "upnp" ? "UPnP" : "Manuelle"}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => handleDelete(rule)}
                          className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ReseauTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* DHCP sections */}
      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
        <DhcpSection />
      </div>
      {/* NAT full width */}
      <div className="md:col-span-2">
        <NatSection />
      </div>
      {/* PTF full width */}
      <div className="md:col-span-2">
        <PtfSection />
      </div>
      {/* Pare-feu IPv6 full width */}
      <div className="md:col-span-2">
        <PinholeSection />
      </div>
    </div>
  );
}
