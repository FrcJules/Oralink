import { useState } from "react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

const STATUS_LABELS = {
  media_type: { LIVE: "Direct", REPLAY: "Replay", VOD: "VOD", PVR: "Enregistrement" },
};

const REMOTE_LAYOUT = [
  [{ key: "power", label: "⏻" }, null, { key: "mute", label: "🔇" }],
  [null, { key: "up", label: "▲" }, null],
  [{ key: "left", label: "◀" }, { key: "ok", label: "OK" }, { key: "right", label: "▶" }],
  [null, { key: "down", label: "▼" }, null],
  [{ key: "back", label: "↩" }, { key: "menu", label: "☰" }, { key: "rec", label: "⏺" }],
  [{ key: "vol_down", label: "VOL −" }, { key: "chan_up", label: "CH ▲" }, { key: "vol_up", label: "VOL +" }],
  [{ key: "fbwd", label: "⏪" }, { key: "play", label: "⏯" }, { key: "ffwd", label: "⏩" }],
  [null, { key: "chan_down", label: "CH ▼" }, null],
];

function statusLabel(status) {
  if (!status) return "Aucune information";
  const channel = status.channel && status.channel !== "NA" ? status.channel : null;
  const type = status.media_type && status.media_type !== "NA"
    ? (STATUS_LABELS.media_type[status.media_type] || status.media_type)
    : null;
  if (!channel && !type) return "En veille / aucun programme";
  return [channel, type].filter(Boolean).join(" · ");
}

function DecoderForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [mac, setMac] = useState(initial?.mac ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [ip, setIp] = useState(initial?.ip ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ mac: mac.trim(), name: name.trim(), ip: ip.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 sm:grid-cols-4 sm:items-end">
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Adresse MAC
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="aa:bb:cc:dd:ee:ff"
          disabled={!!initial?.mac}
          className="lb-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Nom
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Décodeur salon" className="lb-input" />
      </label>
      <label className="flex flex-col gap-1 text-xs lb-text-muted">
        Adresse IP
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.x" className="lb-input" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !mac || !name || !ip} className="lb-btn-primary">
          {saving ? "Enregistrement…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="lb-btn-outline px-2.5 py-1 text-xs">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function RemoteControl({ disabled, onKey }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {REMOTE_LAYOUT.flat().map((btn, i) =>
        btn ? (
          <button
            key={btn.key}
            disabled={disabled}
            onClick={() => onKey(btn.key)}
            className="lb-btn-outline rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {btn.label}
          </button>
        ) : (
          <span key={`empty-${i}`} />
        ),
      )}
    </div>
  );
}

function DecoderCard({ decoder, onRemove, onSendKey }) {
  const [sendingKey, setSendingKey] = useState(null);

  const handleKey = async (key) => {
    setSendingKey(key);
    try {
      await onSendKey(decoder.mac, key);
    } finally {
      setSendingKey(null);
    }
  };

  return (
    <div className="rounded-lg border lb-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium lb-text">📺 {decoder.name}</p>
          <p className="text-xs lb-text-muted">
            {decoder.ip} · {decoder.online ? <span className="text-emerald-600">en ligne</span> : <span className="lb-text-muted">injoignable</span>}
          </p>
        </div>
        <button onClick={() => onRemove(decoder.mac, decoder.name)} className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
          Supprimer
        </button>
      </div>
      <p className="mb-3 text-sm lb-text">{statusLabel(decoder.status)}</p>
      <RemoteControl disabled={!decoder.online || sendingKey !== null} onKey={handleKey} />
    </div>
  );
}

export function TvDecoderTab() {
  const { data, loading, error, refresh } = useWsData("livebox/tvdecoders");
  const runAction = useWsAction();
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState(null);

  const handleAdd = async ({ mac, name, ip }) => {
    await runAction(
      { type: "livebox/tvdecoders/set", mac, name, ip },
      { success: `Décodeur « ${name} » enregistré.` },
    );
    setAdding(false);
    setCandidates((c) => (c ? c.filter((cand) => cand.mac !== mac) : c));
    refresh();
  };

  const handleRemove = async (mac, name) => {
    if (!window.confirm(`Oublier le décodeur « ${name} » ?`)) return;
    await runAction(
      { type: "livebox/tvdecoders/remove", mac },
      { success: `Décodeur « ${name} » oublié.` },
    );
    refresh();
  };

  const handleSendKey = async (mac, key) => {
    try {
      await runAction({ type: "livebox/tvdecoders/key", mac, key });
    } catch {
      // déjà notifié par le toast d'erreur de useWsAction
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setCandidates(null);
    try {
      const found = await runAction(
        { type: "livebox/tvdecoders/discover" },
        { error: "Échec de la recherche sur le réseau." },
      );
      setCandidates(found);
    } catch {
      // déjà notifié
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <Card title="Décodeurs TV Orange">
      <StateBox loading={loading} error={error} />
      <p className="mb-3 text-xs lb-text-muted">
        Le décodeur ne passe pas par l'API de la Livebox : il faut connaître son
        adresse IP locale pour lui parler directement en HTTP (télécommande
        virtuelle, statut). Saisissez-la manuellement, ou laissez Oralink la
        repérer parmi les appareils déjà connus du réseau (le décodeur doit
        être allumé pour répondre).
      </p>

      {data && data.length > 0 && (
        <div className="mb-4 space-y-3">
          {data.map((decoder) => (
            <DecoderCard key={decoder.mac} decoder={decoder} onRemove={handleRemove} onSendKey={handleSendKey} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleDiscover} disabled={discovering} className="lb-btn-outline px-2.5 py-1 text-xs">
          {discovering ? "Recherche en cours…" : "🔍 Rechercher sur le réseau"}
        </button>
        <button onClick={() => setAdding((v) => !v)} className="lb-btn-outline px-2.5 py-1 text-xs">
          {adding ? "Annuler l'ajout manuel" : "+ Ajouter manuellement"}
        </button>
      </div>

      {candidates !== null && (
        <div className="mt-3 rounded-lg border lb-border p-3">
          {candidates.length === 0
            ? <p className="text-sm lb-text-muted">Aucun décodeur trouvé. Vérifiez qu'il est allumé, ou ajoutez-le manuellement avec son IP.</p>
            : <>
                <p className="mb-2 text-sm font-medium lb-text">Décodeurs détectés :</p>
                <ul className="space-y-2">
                  {candidates.map((c) => (
                    <li key={c.mac} className="flex items-center justify-between gap-2 text-sm">
                      <span>📺 {c.name} <span className="lb-text-muted">— {c.ip}</span></span>
                      <button
                        onClick={() => handleAdd({ mac: c.mac, name: c.name, ip: c.ip })}
                        className="lb-btn-outline px-2.5 py-1 text-xs"
                      >
                        + Ajouter
                      </button>
                    </li>
                  ))}
                </ul>
              </>
          }
        </div>
      )}

      {adding && (
        <div className="mt-3 rounded-lg border lb-border p-3">
          <DecoderForm onSubmit={handleAdd} onCancel={() => setAdding(false)} submitLabel="Ajouter" />
        </div>
      )}

      {data && data.length === 0 && candidates === null && !adding && (
        <p className="mt-3 text-sm lb-text-muted">Aucun décodeur configuré pour le moment.</p>
      )}
    </Card>
  );
}
