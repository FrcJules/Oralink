import { useState } from "react";
import { ChevronDown, ChevronRight, Settings, Wifi, WifiOff } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox } from "../components/card.jsx";

// ── helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, green, orange, red, blue }) {
  const cls = green ? "bg-emerald-100 text-emerald-700"
    : orange ? "bg-orange-100 text-orange-700"
    : red ? "bg-red-100 text-red-700"
    : blue ? "bg-blue-100 text-blue-700"
    : "bg-[var(--secondary-background-color)] lb-text";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function ifaceBand(iface) {
  if (iface.includes("2g0")) return "2.4 GHz";
  if (iface.includes("5g0")) return "5 GHz";
  return "6 GHz";
}

function fmtRate(kbps) {
  if (kbps == null) return null;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbit/s`;
  return `${kbps} Kbit/s`;
}

// ── Radio row (compact) ───────────────────────────────────────────────────────

function RadioRow({ radio, onSet }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState(String(radio.channel ?? ""));
  const [auto, setAuto] = useState(radio.auto_channel ?? false);
  const [saving, setSaving] = useState(false);

  const bandLabel = { "2.4GHz": "2.4 GHz", "5GHz": "5 GHz", "6GHz": "6 GHz" }[radio.band] ?? radio.band ?? radio.iface;
  const up = radio.status === "Up";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSet(radio.iface, { channel: auto ? undefined : parseInt(channel, 10) || undefined, auto_channel: auto });
      setOpen(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="border-b lb-border last:border-0">
      <div className="flex items-center gap-3 py-2">
        <span className={`size-2 rounded-full flex-shrink-0 ${up ? "bg-emerald-500" : "bg-gray-400"}`} />
        <span className="w-16 text-sm font-semibold lb-text">{bandLabel}</span>
        <span className="flex-1 text-xs lb-text-muted flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Canal {radio.auto_channel ? `Auto (${radio.channel})` : radio.channel}</span>
          <span>·</span>
          <span>{radio.bandwidth}</span>
          <span>·</span>
          <span>{radio.standards}</span>
          {radio.tx_power != null && <><span>·</span><span>TX {radio.tx_power}%</span></>}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded border lb-border px-2 py-0.5 text-xs hover:bg-[var(--secondary-background-color)]"
        >
          <Settings className="size-3" />
          Modifier
        </button>
      </div>
      {open && (
        <div className="mb-2 rounded-lg bg-[var(--secondary-background-color)] px-3 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Canal auto
            </label>
            {!auto && (
              <label className="flex flex-col gap-0.5 text-xs lb-text-muted">
                Canal
                <input type="number" value={channel} onChange={(e) => setChannel(e.target.value)}
                  min={1} max={165} className="lb-input w-20" />
              </label>
            )}
            <button onClick={handleSave} disabled={saving} className="lb-btn-primary text-xs px-3 py-1">
              {saving ? "…" : "Appliquer"}
            </button>
            <button onClick={() => setOpen(false)} className="text-xs lb-text-muted hover:underline">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Station sub-table ─────────────────────────────────────────────────────────

function StationTable({ stations, onKick }) {
  const [kicking, setKicking] = useState(null);
  const handleKick = async (vap, mac) => {
    setKicking(mac);
    try { await onKick(vap, mac); } finally { setKicking(null); }
  };
  if (!stations?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="lb-text-muted">
            <th className="py-1 pr-3">MAC</th>
            <th className="py-1 pr-3">IP</th>
            <th className="py-1 pr-3">RSSI</th>
            <th className="py-1 pr-3">↓ Rate</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.mac} className="border-t lb-border">
              <td className="py-1 pr-3 font-mono">{s.mac}</td>
              <td className="py-1 pr-3 lb-text-muted">{s.ip ?? "—"}</td>
              <td className="py-1 pr-3 lb-text-muted">{s.rssi != null ? `${s.rssi} dBm` : "—"}</td>
              <td className="py-1 pr-3 lb-text-muted">{fmtRate(s.tx_rate) ?? "—"}</td>
              <td className="py-1">
                <button
                  onClick={() => handleKick(s.vap, s.mac)}
                  disabled={kicking === s.mac}
                  className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                >
                  {kicking === s.mac ? "…" : "Éjecter"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── VAP row ───────────────────────────────────────────────────────────────────

function VapRow({ vap, onKick, onSet }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ssid, setSsid] = useState(vap.ssid ?? "");
  const [hidden, setHidden] = useState(vap.hidden ?? false);
  const [saving, setSaving] = useState(false);

  const band = ifaceBand(vap.iface);
  const isGuest = vap.iface.includes("guest");
  const up = vap.status === "Up";
  const count = vap.station_count ?? vap.stations?.length ?? 0;

  const [enabled, setEnabled] = useState(vap.enabled ?? true);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSet(vap.iface, { ssid, hidden, enabled });
      setEditOpen(false);
    } finally { setSaving(false); }
  };

  const stationsWithVap = (vap.stations ?? []).map((s) => ({ ...s, vap: vap.iface }));

  return (
    <div className="border-b lb-border last:border-0">
      {/* Main row */}
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => count > 0 && setExpanded((v) => !v)}
          className="flex-shrink-0 disabled:opacity-30"
          disabled={count === 0}
        >
          {expanded ? <ChevronDown className="size-3.5 lb-text-muted" /> : <ChevronRight className="size-3.5 lb-text-muted" />}
        </button>
        <span className={`size-2 rounded-full flex-shrink-0 ${up ? "bg-emerald-500" : "bg-gray-400"}`} />
        <span className="flex-1 text-sm font-medium lb-text truncate">{vap.ssid ?? vap.iface}</span>
        <span className="text-xs lb-text-muted">{band}</span>
        {isGuest && <Badge orange>Invité</Badge>}
        {!up && <Badge red>Down</Badge>}
        {vap.hidden && <Badge>Masqué</Badge>}
        <span className="w-14 text-right text-xs lb-text-muted">
          {count > 0 ? `${count} client${count > 1 ? "s" : ""}` : "0 client"}
        </span>
        <span className="w-36 text-xs lb-text-muted font-mono truncate hidden sm:block">{vap.bssid}</span>
        <button
          onClick={() => setEditOpen((v) => !v)}
          className="flex items-center gap-1 rounded border lb-border px-1.5 py-0.5 text-xs hover:bg-[var(--secondary-background-color)] flex-shrink-0"
        >
          <Settings className="size-3" />
          Modifier
        </button>
      </div>

      {/* Stations */}
      {expanded && stationsWithVap.length > 0 && (
        <div className="ml-6 mb-2">
          <StationTable stations={stationsWithVap} onKick={onKick} />
        </div>
      )}

      {/* Edit form */}
      {editOpen && (
        <div className="ml-6 mb-2 rounded-lg bg-[var(--secondary-background-color)] px-3 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs lb-text-muted">
              SSID
              <input value={ssid} onChange={(e) => setSsid(e.target.value)}
                className="lb-input w-48" maxLength={32} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              SSID masqué
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              VAP activé
            </label>
            <button onClick={handleSave} disabled={saving || !ssid} className="lb-btn-primary text-xs px-3 py-1">
              {saving ? "…" : "Appliquer"}
            </button>
            <button onClick={() => setEditOpen(false)} className="text-xs lb-text-muted hover:underline">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Global Wifi toggle ────────────────────────────────────────────────────────

function GlobalWifiCard({ wifiEnabled, guestEnabled, guestTimerHours, onRefresh }) {
  const runAction = useWsAction();
  const [toggling, setToggling] = useState(null);
  const [timer, setTimer] = useState(String(guestTimerHours ?? 0));

  const handleWifiToggle = async () => {
    setToggling("wifi");
    try {
      await runAction(
        { type: "livebox/wifi/global/toggle", enabled: !wifiEnabled },
        { success: !wifiEnabled ? "Wifi activé." : "Wifi désactivé." },
      );
      onRefresh();
    } finally { setToggling(null); }
  };

  const handleGuestToggle = async () => {
    setToggling("guest");
    try {
      const timerHours = parseInt(timer, 10) || 0;
      await runAction(
        { type: "livebox/wifi/guest/toggle", enabled: !guestEnabled, timer_hours: timerHours },
        { success: !guestEnabled ? "Wifi invité activé." : "Wifi invité désactivé." },
      );
      onRefresh();
    } finally { setToggling(null); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Wifi className="size-4" /> Wifi global</span>}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium lb-text">Wifi principal</p>
            <p className="text-xs lb-text-muted">Active ou désactive tous les réseaux Wifi</p>
          </div>
          <button
            onClick={handleWifiToggle}
            disabled={toggling !== null || wifiEnabled == null}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              wifiEnabled
                ? "border border-red-200 text-red-600 hover:bg-red-50"
                : "lb-btn-primary"
            } disabled:opacity-40`}
          >
            {toggling === "wifi" ? "…" : wifiEnabled ? <span className="flex items-center gap-1.5"><WifiOff className="size-3.5" /> Désactiver</span> : <span className="flex items-center gap-1.5"><Wifi className="size-3.5" /> Activer</span>}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium lb-text">Wifi invité</p>
            {guestEnabled && (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs lb-text-muted">Durée (h, 0=∞)</p>
                <input
                  type="number" min={0} max={24} value={timer}
                  onChange={(e) => setTimer(e.target.value)}
                  className="lb-input w-14 text-xs py-0.5"
                />
              </div>
            )}
          </div>
          <button
            onClick={handleGuestToggle}
            disabled={toggling !== null || guestEnabled == null}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              guestEnabled
                ? "border border-red-200 text-red-600 hover:bg-red-50"
                : "lb-btn-primary"
            } disabled:opacity-40`}
          >
            {toggling === "guest" ? "…" : guestEnabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function WifiTab() {
  const { data, loading, error, refresh } = useWsData("livebox/wifi/detail", {}, 30_000);
  const runAction = useWsAction();

  const handleRadioSet = async (iface, params) => {
    await runAction({ type: "livebox/wifi/radio/set", iface, ...params }, { success: "Paramètres radio mis à jour." });
    refresh();
  };
  const handleVapSet = async (iface, params) => {
    await runAction({ type: "livebox/wifi/vap/set", iface, ...params }, { success: "Paramètres VAP mis à jour." });
    refresh();
  };
  const handleKick = async (vap, mac) => {
    await runAction({ type: "livebox/wifi/kickstation", vap, mac }, { success: "Client déconnecté." });
    refresh();
  };

  const radios = data?.radios ?? [];
  const vaps = data?.vaps ?? [];
  const mainVaps = vaps.filter((v) => !v.iface.includes("guest"));
  const guestVaps = vaps.filter((v) => v.iface.includes("guest"));
  const totalClients = mainVaps.reduce((s, v) => s + (v.station_count ?? 0), 0);

  return (
    <div className="space-y-4">
      <StateBox loading={loading} error={error} />

      {/* Global controls */}
      {data && (
        <GlobalWifiCard
          wifiEnabled={data.wifi_enabled}
          guestEnabled={data.guest_enabled}
          guestTimerHours={data.guest_timer_hours}
          onRefresh={refresh}
        />
      )}

      {/* Radios */}
      <Card title={
        <span className="flex items-center justify-between w-full">
          <span>Radios</span>
          <button onClick={refresh} className="rounded border lb-border px-2 py-0.5 text-xs hover:bg-[var(--secondary-background-color)]">↻</button>
        </span>
      }>
        {radios.length === 0 && !loading && <p className="text-sm lb-text-muted">Aucune info radio.</p>}
        {radios.map((r) => <RadioRow key={r.iface} radio={r} onSet={handleRadioSet} />)}
      </Card>

      {/* VAPs */}
      <Card title={`Réseaux (${mainVaps.length} VAP · ${totalClients} client${totalClients !== 1 ? "s" : ""})`}>
        <div className="hidden sm:grid grid-cols-[1rem_1rem_1fr_4rem_4rem_5rem_9rem_6rem] text-xs lb-text-muted uppercase pb-1 border-b lb-border">
          <span /><span />
          <span>SSID</span>
          <span>Bande</span>
          <span />
          <span className="text-right">Clients</span>
          <span className="text-right">BSSID</span>
          <span />
        </div>
        {mainVaps.map((v) => <VapRow key={v.iface} vap={v} onKick={handleKick} onSet={handleVapSet} />)}
        {mainVaps.length === 0 && !loading && <p className="text-sm lb-text-muted">Aucun VAP.</p>}
      </Card>

      {/* Guest */}
      {guestVaps.length > 0 && (
        <Card title="Réseaux invités">
          {guestVaps.map((v) => <VapRow key={v.iface} vap={v} onKick={handleKick} onSet={handleVapSet} />)}
        </Card>
      )}
    </div>
  );
}
