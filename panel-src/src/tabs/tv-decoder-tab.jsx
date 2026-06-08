import { useState } from "react";
import {
  Power, VolumeX, Volume1, Volume2, ChevronUp, ChevronDown, ChevronLeft,
  ChevronRight, CornerUpLeft, Menu, Circle, Rewind, Play, FastForward,
} from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

const STATUS_LABELS = {
  media_type: { LIVE: "Direct", REPLAY: "Replay", VOD: "VOD", PVR: "Enregistrement" },
};


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

function RemoteKey({ disabled, onClick, label, className = "", children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center lb-text transition active:scale-95 disabled:opacity-30 disabled:active:scale-100 hover:bg-[var(--primary-background-color)] ${className}`}
    >
      {children}
    </button>
  );
}

function RemoteRocker({ disabled, onUp, onDown, upLabel, downLabel, upIcon, downIcon }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-full border lb-border">
      <RemoteKey disabled={disabled} onClick={onUp} label={upLabel} className="h-8 w-11">
        {upIcon}
      </RemoteKey>
      <div className="h-px border-t lb-border" />
      <RemoteKey disabled={disabled} onClick={onDown} label={downLabel} className="h-8 w-11">
        {downIcon}
      </RemoteKey>
    </div>
  );
}

function RemoteControl({ disabled, onKey }) {
  const key = (k) => () => onKey(k);
  const icon = "h-[18px] w-[18px]";
  const iconSm = "h-3.5 w-3.5";

  return (
    <div className="mx-auto flex w-full max-w-[230px] flex-col gap-3 rounded-[26px] border lb-border bg-[var(--secondary-background-color)] px-4 py-4">
      {/* Marche / muet */}
      <div className="flex items-center justify-between">
        <RemoteKey disabled={disabled} onClick={key("power")} label="Marche / Veille" className="h-9 w-9 rounded-full border lb-border text-red-500 hover:bg-red-500/10">
          <Power className={icon} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("mute")} label="Muet" className="h-9 w-9 rounded-full border lb-border">
          <VolumeX className={icon} />
        </RemoteKey>
      </div>

      {/* Pavé directionnel circulaire */}
      <div className="mx-auto grid grid-cols-3 grid-rows-3 place-items-center gap-1">
        <span />
        <RemoteKey disabled={disabled} onClick={key("up")} label="Haut" className="h-10 w-10 rounded-full">
          <ChevronUp className={icon} />
        </RemoteKey>
        <span />
        <RemoteKey disabled={disabled} onClick={key("left")} label="Gauche" className="h-10 w-10 rounded-full">
          <ChevronLeft className={icon} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("ok")} label="OK" className="h-10 w-10 rounded-full border lb-border text-xs font-semibold">
          OK
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("right")} label="Droite" className="h-10 w-10 rounded-full">
          <ChevronRight className={icon} />
        </RemoteKey>
        <span />
        <RemoteKey disabled={disabled} onClick={key("down")} label="Bas" className="h-10 w-10 rounded-full">
          <ChevronDown className={icon} />
        </RemoteKey>
        <span />
      </div>

      {/* Retour / menu / enregistrement */}
      <div className="flex items-center justify-center gap-3">
        <RemoteKey disabled={disabled} onClick={key("back")} label="Retour" className="h-9 w-9 rounded-full">
          <CornerUpLeft className={icon} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("menu")} label="Menu" className="h-9 w-9 rounded-full">
          <Menu className={icon} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("rec")} label="Enregistrer" className="h-9 w-9 rounded-full">
          <Circle className={`${iconSm} fill-red-500 text-red-500`} />
        </RemoteKey>
      </div>

      {/* Volume / chaîne */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <RemoteRocker
            disabled={disabled}
            onUp={key("vol_up")} onDown={key("vol_down")}
            upLabel="Volume +" downLabel="Volume −"
            upIcon={<Volume2 className={iconSm} />} downIcon={<Volume1 className={iconSm} />}
          />
          <span className="text-[10px] uppercase tracking-wide lb-text-muted">Volume</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RemoteRocker
            disabled={disabled}
            onUp={key("chan_up")} onDown={key("chan_down")}
            upLabel="Chaîne +" downLabel="Chaîne −"
            upIcon={<ChevronUp className={iconSm} />} downIcon={<ChevronDown className={iconSm} />}
          />
          <span className="text-[10px] uppercase tracking-wide lb-text-muted">Chaîne</span>
        </div>
      </div>

      {/* Lecture */}
      <div className="flex items-center justify-center gap-3">
        <RemoteKey disabled={disabled} onClick={key("fbwd")} label="Retour rapide" className="h-9 w-9 rounded-full">
          <Rewind className={iconSm} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("play")} label="Lecture / Pause" className="h-11 w-11 rounded-full border lb-border">
          <Play className={icon} />
        </RemoteKey>
        <RemoteKey disabled={disabled} onClick={key("ffwd")} label="Avance rapide" className="h-9 w-9 rounded-full">
          <FastForward className={iconSm} />
        </RemoteKey>
      </div>
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
    <div className="rounded-2xl border lb-border p-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold lb-text">📺 {decoder.name}</p>
          <p className="text-xs lb-text-muted">
            {decoder.ip}
            <span className="mx-1.5">·</span>
            {decoder.online
              ? <span className="font-medium text-emerald-600">En ligne</span>
              : <span>Injoignable</span>}
          </p>
          <p className="mt-1 text-sm lb-text-muted">{statusLabel(decoder.status)}</p>
        </div>
        <button
          onClick={() => onRemove(decoder.mac, decoder.name)}
          className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Supprimer
        </button>
      </div>
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
