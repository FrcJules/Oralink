/**
 * Groupes d'appareils et pause Internet minutée (livebox/groups*, groups.py).
 * La pause coupe l'accès Internet de chaque appareil du groupe (planificateur
 * de la box) ; la reprise automatique est programmée par Home Assistant.
 */
import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Pencil, Trash2, Users } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { useConfirm } from "../lib/confirm-context.jsx";
import { Card, StateBox } from "../components/card.jsx";
import { Dot, Pill } from "../components/status.jsx";
import { parseDate } from "../lib/format.js";

const DURATIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
  { minutes: "tomorrow", label: "Jusqu'à demain 7 h" },
  { minutes: 0, label: "Jusqu'à reprise" },
];

const timeFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Minutes jusqu'au lendemain 7 h (heure du navigateur). */
function minutesUntilTomorrow7() {
  const now = new Date();
  const target = new Date(now);
  target.setDate(now.getDate() + (now.getHours() < 7 ? 0 : 1));
  target.setHours(7, 0, 0, 0);
  return Math.max(1, Math.round((target - now) / 60000));
}

function remaining(until, now) {
  const d = parseDate(until);
  if (!d) return null;
  const min = Math.max(0, Math.round((d.getTime() - now) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

function GroupCard({ group, now, onEdit, onChanged }) {
  const runAction = useWsAction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const pause = async (minutes) => {
    const value = minutes === "tomorrow" ? minutesUntilTomorrow7() : minutes;
    setBusy(true);
    try {
      const result = await runAction(
        { type: "livebox/groups/pause", group_id: group.group_id, minutes: value },
        { success: `Internet en pause pour « ${group.name} ».` },
      );
      if (result?.errors?.length) console.warn("Pause partielle :", result.errors);
      onChanged();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const resume = async () => {
    setBusy(true);
    try {
      await runAction({ type: "livebox/groups/resume", group_id: group.group_id },
        { success: `Internet rétabli pour « ${group.name} ».` });
      onChanged();
    } catch { /* toast */ } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!await confirm({ title: "Supprimer le groupe", message: `Supprimer « ${group.name} » ?${group.paused ? "\n\nLa pause en cours sera levée." : ""}`, danger: true })) return;
    try {
      await runAction({ type: "livebox/groups/delete", group_id: group.group_id }, { success: "Groupe supprimé." });
      onChanged();
    } catch { /* toast */ }
  };

  const until = parseDate(group.until);
  return (
    <Card
      title={<span className="flex items-center gap-2"><Users className="size-4" /> {group.name}</span>}
      actions={
        <>
          <button onClick={() => onEdit(group)} className="lb-text-muted hover:text-[var(--primary-text-color)]" title="Modifier"><Pencil className="size-4" /></button>
          <button onClick={remove} className="text-red-600" title="Supprimer"><Trash2 className="size-4" /></button>
        </>
      }
    >
      {group.paused ? (
        <div className="lb-banner lb-banner-warn mb-3" role="status">
          <span className="lb-banner-icon" style={{ background: "var(--lb-warn)" }}><Pause className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold lb-text">Internet en pause</p>
            <p className="text-sm lb-text-muted">
              {until ? `Reprise ${timeFmt.format(until)} (dans ${remaining(group.until, now)})` : "Jusqu'à reprise manuelle"}
              {` · ${group.paused_count} appareil${group.paused_count > 1 ? "s" : ""} coupé${group.paused_count > 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={resume} disabled={busy} className="lb-btn-primary inline-flex items-center gap-1 text-xs disabled:opacity-40">
            <Play className="size-3.5" /> Reprendre
          </button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs lb-text-muted">Mettre en pause :</span>
          {DURATIONS.map((d) => (
            <button key={d.label} onClick={() => pause(d.minutes)} disabled={busy || !group.members.length}
              className="lb-btn-outline text-xs disabled:opacity-40">{d.label}</button>
          ))}
        </div>
      )}
      {group.members.length === 0
        ? <p className="text-sm lb-text-muted">Aucun appareil dans ce groupe.</p>
        : <ul className="flex flex-wrap gap-1.5">
            {group.members.map((m) => (
              <li key={m.mac} className="inline-flex items-center gap-1.5 rounded-full border lb-border px-2.5 py-0.5 text-xs" title={m.mac}>
                <Dot level={m.active ? "ok" : "neutral"} /> {m.name}
              </li>
            ))}
          </ul>}
    </Card>
  );
}

function GroupEditor({ group, devices, onClose, onSaved }) {
  const runAction = useWsAction();
  const [name, setName] = useState(group?.name ?? "");
  const [macs, setMacs] = useState(() => new Set(group?.members.map((m) => m.mac) ?? []));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Les membres d'abord, puis les appareils actifs, puis le reste.
    return [...devices]
      .filter((d) => !q || [d.name, d.mac, d.ip].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (macs.has(b.mac.toUpperCase()) - macs.has(a.mac.toUpperCase()))
        || (b.active - a.active) || a.name.localeCompare(b.name));
  }, [devices, search, macs]);

  const toggle = (mac) => setMacs((s) => {
    const next = new Set(s);
    const key = mac.toUpperCase();
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await runAction(
        { type: "livebox/groups/set", ...(group ? { group_id: group.group_id } : {}), name: name.trim(), macs: [...macs] },
        { success: `Groupe « ${name.trim()} » enregistré.` },
      );
      onSaved();
    } catch { /* toast */ } finally { setSaving(false); }
  };

  // Membres d'un groupe qui ne figurent plus dans la liste des appareils.
  const missing = (group?.members ?? []).filter((m) => !devices.some((d) => d.mac.toUpperCase() === m.mac));

  return (
    <Card title={group ? `Modifier « ${group.name} »` : "Nouveau groupe"}>
      <form onSubmit={save} className="space-y-3">
        <label className="flex flex-col gap-1 text-xs lb-text-muted">
          Nom du groupe
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40}
            placeholder="Enfants, Consoles…" className="lb-input" />
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs lb-text-muted">Appareils ({macs.size} sélectionné{macs.size > 1 ? "s" : ""})</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="lb-input w-40 text-xs" />
          </div>
          <div className="max-h-[40vh] overflow-y-auto rounded-md border lb-border">
            {missing.map((m) => (
              <label key={m.mac} className="flex items-center gap-2 border-b lb-border px-2 py-1.5 text-sm last:border-0">
                <input type="checkbox" checked={macs.has(m.mac)} onChange={() => toggle(m.mac)} />
                <span className="flex-1">{m.name}</span>
                <Pill level="neutral">hors ligne</Pill>
              </label>
            ))}
            {list.map((d) => (
              <label key={d.mac} className="flex items-center gap-2 border-b lb-border px-2 py-1.5 text-sm last:border-0">
                <input type="checkbox" checked={macs.has(d.mac.toUpperCase())} onChange={() => toggle(d.mac)} />
                <Dot level={d.active ? "ok" : "neutral"} />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="font-mono text-xs lb-text-muted">{d.ip}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !name.trim()} className="lb-btn-primary disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={onClose} className="lb-btn-outline">Annuler</button>
        </div>
      </form>
    </Card>
  );
}

export function GroupsTab() {
  const { data, loading, error, refresh } = useWsData("livebox/groups", {}, 30_000);
  const { data: devices } = useWsData("livebox/devices", {}, 60_000);
  const [editing, setEditing] = useState(null); // null | "new" | group
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <Card title="Pause Internet par groupe">
        <p className="text-sm lb-text-muted">
          Regroupez des appareils (enfants, consoles…) pour leur couper Internet d'un coup, pendant une durée
          choisie ou jusqu'à reprise. Le réseau local reste accessible. Un appareil déjà bloqué à la main
          avant la pause le reste après.
        </p>
        {!editing && (
          <button onClick={() => setEditing("new")} className="lb-btn-primary mt-3">+ Nouveau groupe</button>
        )}
      </Card>
      <StateBox loading={loading} error={error} />
      {editing && (
        <GroupEditor
          key={editing === "new" ? "new" : editing.group_id}
          group={editing === "new" ? null : editing}
          devices={devices ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {data && data.length === 0 && !editing && (
        <p className="text-sm lb-text-muted">Aucun groupe pour l'instant.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((g) => (
          <GroupCard key={g.group_id} group={g} now={now} onEdit={setEditing} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}
