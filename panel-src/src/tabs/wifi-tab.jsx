import { useState } from "react";
import { Wifi, WifiOff, Radio, Users, Settings, Zap, ZapOff } from "lucide-react";
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

function Badge({ children, color = "default" }) {
  const colors = {
    default: "bg-[var(--secondary-background-color)] lb-text",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    orange: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${colors[color] ?? colors.default}`}>
      {children}
    </span>
  );
}

function RadioCard({ radio, onSet }) {
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState(String(radio.channel ?? ""));
  const [auto, setAuto] = useState(radio.auto_channel ?? false);
  const [saving, setSaving] = useState(false);

  const bandLabel = {
    "2.4GHz": "2.4 GHz",
    "5GHz": "5 GHz",
    "6GHz": "6 GHz",
  }[radio.band] ?? radio.band ?? radio.iface;

  const statusColor = radio.status === "Up" ? "green" : radio.status ? "red" : "default";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSet(radio.iface, {
        channel: auto ? undefined : parseInt(channel, 10) || undefined,
        auto_channel: auto,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border lb-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="size-4 lb-text-muted" />
          <span className="font-semibold lb-text">{bandLabel}</span>
          <Badge color={statusColor}>{radio.status ?? "Inconnu"}</Badge>
          {!radio.enabled && <Badge color="red">Désactivée</Badge>}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border lb-border px-2 py-0.5 text-xs hover:bg-[var(--secondary-background-color)]"
        >
          <Settings className="mr-1 inline size-3" />
          {editing ? "Annuler" : "Modifier"}
        </button>
      </div>
      <Row label="Canal" value={radio.auto_channel ? `Auto (actuel: ${radio.channel})` : radio.channel} />
      <Row label="Largeur de bande" value={radio.bandwidth} />
      <Row label="Standards" value={radio.standards} />
      <Row label="Puissance TX" value={radio.tx_power != null ? `${radio.tx_power}%` : null} />

      {editing && (
        <div className="mt-3 rounded-lg bg-[var(--secondary-background-color)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Modifier la radio</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Sélection automatique du canal
            </label>
            {!auto && (
              <label className="flex flex-col gap-1 text-xs lb-text-muted">
                Canal
                <input
                  type="number"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="ex: 6"
                  min={1}
                  max={165}
                  className="lb-input w-28"
                />
              </label>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="lb-btn-primary"
            >
              {saving ? "Enregistrement…" : "Appliquer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VapCard({ vap, onKick, onSet }) {
  const [kicking, setKicking] = useState(null);
  const [editing, setEditing] = useState(false);
  const [ssid, setSsid] = useState(vap.ssid ?? "");
  const [hidden, setHidden] = useState(vap.hidden ?? false);
  const [saving, setSaving] = useState(false);

  const isGuest = vap.iface.includes("guest");
  const bandLabel = vap.iface.includes("2g0") ? "2.4 GHz" : vap.iface.includes("5g0") ? "5 GHz" : "6 GHz";
  const statusColor = vap.status === "Up" ? "green" : vap.status ? "red" : "default";

  const handleKick = async (mac) => {
    setKicking(mac);
    try {
      await onKick(vap.iface, mac);
    } finally {
      setKicking(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSet(vap.iface, { ssid, hidden });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border lb-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Wifi className="size-4 lb-text-muted" />
          <span className="font-semibold lb-text">{vap.ssid ?? vap.iface}</span>
          <Badge>{bandLabel}</Badge>
          {isGuest && <Badge color="orange">Invités</Badge>}
          <Badge color={statusColor}>{vap.status ?? "Inconnu"}</Badge>
          {vap.hidden && <Badge color="orange">Masqué</Badge>}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border lb-border px-2 py-0.5 text-xs hover:bg-[var(--secondary-background-color)]"
        >
          <Settings className="mr-1 inline size-3" />
          {editing ? "Annuler" : "Modifier"}
        </button>
      </div>
      <Row label="BSSID" value={vap.bssid} />
      <Row label="Clients connectés" value={vap.station_count ?? vap.stations?.length ?? 0} />

      {vap.stations && vap.stations.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs uppercase lb-text-muted">Clients associés</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="lb-text-muted">
                  <th className="py-1 pr-2">MAC</th>
                  <th className="py-1 pr-2">IP</th>
                  <th className="py-1 pr-2">RSSI</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {vap.stations.map((s) => (
                  <tr key={s.mac} className="border-t lb-border">
                    <td className="py-1 pr-2 font-mono">{s.mac}</td>
                    <td className="py-1 pr-2 lb-text-muted">{s.ip ?? "—"}</td>
                    <td className="py-1 pr-2 lb-text-muted">{s.rssi ?? "—"}</td>
                    <td className="py-1">
                      <button
                        onClick={() => handleKick(s.mac)}
                        disabled={kicking === s.mac}
                        className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        {kicking === s.mac ? "…" : "Déconnecter"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-3 rounded-lg bg-[var(--secondary-background-color)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase lb-text-muted">Modifier le VAP</p>
          <div className="space-y-2">
            <label className="flex flex-col gap-1 text-xs lb-text-muted">
              SSID
              <input
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="lb-input"
                maxLength={32}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              Masquer le réseau (SSID caché)
            </label>
            <button onClick={handleSave} disabled={saving || !ssid} className="lb-btn-primary">
              {saving ? "Enregistrement…" : "Appliquer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WifiTab() {
  const { data, loading, error, refresh } = useWsData("livebox/wifi/detail");
  const runAction = useWsAction();

  const handleRadioSet = async (iface, params) => {
    await runAction(
      { type: "livebox/wifi/radio/set", iface, ...params },
      { success: "Paramètres radio mis à jour." },
    );
    refresh();
  };

  const handleVapSet = async (iface, params) => {
    await runAction(
      { type: "livebox/wifi/vap/set", iface, ...params },
      { success: "Paramètres VAP mis à jour." },
    );
    refresh();
  };

  const handleKick = async (vap, mac) => {
    await runAction(
      { type: "livebox/wifi/kickstation", vap, mac },
      { success: "Client déconnecté." },
    );
    refresh();
  };

  const radios = data?.radios ?? [];
  const vaps = data?.vaps ?? [];
  const mainVaps = vaps.filter((v) => !v.iface.includes("guest"));
  const guestVaps = vaps.filter((v) => v.iface.includes("guest"));

  return (
    <div className="space-y-4">
      <Card
        title="Radios Wifi"
        actions={
          <button onClick={refresh} className="rounded-md border lb-border px-2.5 py-1 text-xs hover:bg-[var(--secondary-background-color)]">
            ↻ Rafraîchir
          </button>
        }
      >
        <StateBox loading={loading} error={error} />
        {radios.length === 0 && !loading && !error && (
          <p className="text-sm lb-text-muted">Aucune information radio disponible.</p>
        )}
        <div className="space-y-3">
          {radios.map((r) => (
            <RadioCard key={r.iface} radio={r} onSet={handleRadioSet} />
          ))}
        </div>
      </Card>

      <Card title="Réseaux Wifi (VAP)">
        {mainVaps.length === 0 && !loading && !error && (
          <p className="text-sm lb-text-muted">Aucun VAP principal disponible.</p>
        )}
        <div className="space-y-3">
          {mainVaps.map((v) => (
            <VapCard key={v.iface} vap={v} onKick={handleKick} onSet={handleVapSet} />
          ))}
        </div>
      </Card>

      {guestVaps.length > 0 && (
        <Card title="Réseaux invités">
          <div className="space-y-3">
            {guestVaps.map((v) => (
              <VapCard key={v.iface} vap={v} onKick={handleKick} onSet={handleVapSet} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
