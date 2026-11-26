import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, KeyRound, QrCode, Settings, Wifi, WifiOff } from "lucide-react";
import { wifiQrSvg } from "../lib/wifi-qr.js";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { useDeviceNames } from "../lib/use-device-names.js";
import { Card, StateBox } from "../components/card.jsx";
import { useConfirm } from "../lib/confirm-context.jsx";
import { formatRate, formatSignal, parseDate } from "../lib/format.js";

// ── helpers ───────────────────────────────────────────────────────────────────

// Couleurs d'état uniquement pour les états (vert / orange / rouge) ; le
// reste en neutre. Classes lb-pill-* : lisibles en thème clair et sombre.
function Badge({ children, green, orange, red }) {
  const level = green ? "ok" : orange ? "warn" : red ? "bad" : "neutral";
  return <span className={`lb-pill lb-pill-${level}`}>{children}</span>;
}

function ifaceBand(iface) {
  if (iface.includes("2g0")) return "2,4 GHz";
  if (iface.includes("5g0")) return "5 GHz";
  return "6 GHz";
}

// Débit de liaison d'une station, fourni en kbit/s par la box.
const fmtRate = (kbps) => (kbps == null ? null : formatRate(kbps / 1000));

// ── Radio row (compact) ───────────────────────────────────────────────────────

function RadioRow({ radio, onSet }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState(String(radio.channel ?? ""));
  const [auto, setAuto] = useState(radio.auto_channel ?? false);
  const [saving, setSaving] = useState(false);

  const bandLabel = { "2.4GHz": "2,4 GHz", "5GHz": "5 GHz", "6GHz": "6 GHz" }[radio.band] ?? radio.band ?? radio.iface;
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
        <span className={`lb-dot ${up ? "lb-dot-ok" : "lb-dot-neutral"}`} title={up ? "Active" : "Inactive"} />
        <span className="w-16 text-sm font-semibold lb-text">{bandLabel}</span>
        <span className="flex-1 text-xs lb-text-muted flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Canal {radio.auto_channel ? `Auto (${radio.channel})` : radio.channel}</span>
          <span>·</span>
          <span>{radio.bandwidth}</span>
          <span>·</span>
          <span>{radio.standards}</span>
          {radio.tx_power != null && <><span>·</span><span>TX {radio.tx_power < 0 ? "auto" : `${radio.tx_power}%`}</span></>}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded border lb-border px-2 py-1 text-xs hover:bg-[var(--secondary-background-color)]"
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
  const resolveName = useDeviceNames();
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
            <th className="py-1 pr-3">Nom</th>
            <th className="py-1 pr-3">MAC</th>
            <th className="py-1 pr-3">IP</th>
            <th className="py-1 pr-3">Signal</th>
            <th className="py-1 pr-3">Liaison ↓</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.mac} className="border-t lb-border">
              <td className="py-1 pr-3 font-medium lb-text">{resolveName(s.mac, "—")}</td>
              <td className="py-1 pr-3 font-mono lb-text-muted">{s.mac}</td>
              <td className="py-1 pr-3 lb-text-muted">{s.ip ?? "—"}</td>
              <td className="py-1 pr-3 lb-text-muted">{formatSignal(s.rssi) ?? "—"}</td>
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
        <span className={`lb-dot ${up ? "lb-dot-ok" : "lb-dot-neutral"}`} />
        <span className="flex-1 text-sm font-medium lb-text truncate">{vap.ssid ?? vap.iface}</span>
        <span className="text-xs lb-text-muted">{band}</span>
        {isGuest && <Badge>Invité</Badge>}
        {!up && <Badge>Inactif</Badge>}
        {vap.hidden && <Badge>Masqué</Badge>}
        <span className="w-14 text-right text-xs lb-text-muted">
          {count > 0 ? `${count} client${count > 1 ? "s" : ""}` : "0 client"}
        </span>
        <span className="w-36 text-xs lb-text-muted font-mono truncate hidden sm:block">{vap.bssid}</span>
        <button
          onClick={() => setEditOpen((v) => !v)}
          className="flex items-center gap-1 rounded border lb-border px-1.5 py-1 text-xs hover:bg-[var(--secondary-background-color)] flex-shrink-0"
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
                className="lb-input w-full sm:w-48" maxLength={32} />
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

const GUEST_DURATIONS = [
  { hours: 1, label: "1 h" },
  { hours: 4, label: "4 h" },
  { hours: 24, label: "24 h" },
  { hours: 0, label: "Sans limite" },
];
const untilFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

function GlobalWifiCard({ wifiEnabled, guestEnabled, guestUntil, onRefresh }) {
  const runAction = useWsAction();
  const [toggling, setToggling] = useState(null);
  const [hours, setHours] = useState(4);

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

  // Durée gérée par le minuteur de la box (NMC.WlanTimer) : elle s'éteint
  // toute seule, même si Home Assistant est arrêté.
  const setGuest = async (enabled) => {
    setToggling("guest");
    try {
      await runAction(
        { type: "livebox/wifi/guest/toggle", enabled, timer_hours: enabled ? hours : 0 },
        { success: enabled
            ? (hours ? `Wifi invité activé pour ${hours} h.` : "Wifi invité activé.")
            : "Wifi invité désactivé." },
      );
      onRefresh();
    } finally { setToggling(null); }
  };

  const until = parseDate(guestUntil);

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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium lb-text">Wifi invité</p>
            {guestEnabled ? (
              <p className="text-xs lb-text-muted">
                {until ? `Actif — s'éteint ${untilFmt.format(until)}` : "Actif, sans limite de durée"}
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-1" role="group" aria-label="Durée">
                {GUEST_DURATIONS.map((d) => (
                  <button key={d.hours} onClick={() => setHours(d.hours)} aria-pressed={hours === d.hours}
                    className={`rounded-md border lb-border px-2 py-0.5 text-xs ${
                      hours === d.hours ? "lb-sidebar-active font-medium" : "lb-text-muted"
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setGuest(!guestEnabled)}
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
        {guestEnabled && (
          <p className="text-xs lb-text-muted">
            QR code à montrer à vos invités : « Configuration des réseaux » ci-dessous → Wi-Fi invité.
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

// ── Configuration des réseaux (SSID, mot de passe, sécurité) ──────────────────

const SECURITY_LABELS = {
  "None": "Aucune (ouvert)",
  "WPA2-Personal": "WPA2",
  "WPA3-Personal": "WPA3",
  "WPA2-WPA3-Personal": "WPA2 / WPA3",
};

function WifiNetworkRow({ net, onSaved }) {
  const runAction = useWsAction();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const start = () => {
    setForm({ ssid: net.ssid, password: net.password, security: net.security, broadcast: net.broadcast, wps: !!net.wps });
    setFormError(null);
    setEditing(true);
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const passwordError = form && form.security !== "None" && (form.password.length < 8 || form.password.length > 63)
    ? "8 à 63 caractères" : null;
  const ssidError = form && (form.ssid.length < 1 || new TextEncoder().encode(form.ssid).length > 32) ? "1 à 32 caractères" : null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (passwordError || ssidError) return;
    const changes = {};
    for (const key of ["ssid", "password", "security", "broadcast", "wps"]) {
      const current = key === "wps" ? !!net.wps : net[key];
      if (form[key] !== current) changes[key] = form[key];
    }
    if (Object.keys(changes).length === 0) { setEditing(false); return; }
    if (net.network === "lan" && net.enabled && !await confirm({
      title: "Modifier le Wi-Fi principal",
      message: `Le réseau « ${net.ssid} » (${net.band}) va redémarrer : les appareils connectés seront déconnectés quelques secondes`
        + (changes.ssid || changes.password || changes.security
          ? " et devront se reconnecter avec les nouveaux paramètres (pensez aux objets connectés)." : "."),
      danger: true,
    })) return;
    setSaving(true);
    setFormError(null);
    try {
      await runAction({ type: "livebox/wifi/config/set", network: net.network, vap: net.vap, ...changes },
        { success: `Réseau « ${form.ssid} » mis à jour.` });
      setEditing(false);
      onSaved();
    } catch (err) { setFormError(err); } finally { setSaving(false); }
  };

  return (
    <div className="border-t lb-border py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={`inline-block size-2 rounded-full ${net.enabled ? "bg-emerald-500" : "bg-[var(--disabled-text-color)]"}`} />
        <span className="min-w-28 font-medium lb-text break-all">{net.ssid || "—"}</span>
        <span className="text-xs lb-text-muted">{net.band || net.vap}{net.enabled ? "" : " · désactivé"}</span>
        <span className="text-xs lb-text-muted">{SECURITY_LABELS[net.security] ?? net.security}</span>
        {net.security !== "None" && (
          <span className="inline-flex items-center gap-1 font-mono text-xs lb-text-muted">
            <KeyRound className="size-3" />
            {showPassword ? net.password : "••••••••"}
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="hover:lb-text" title={showPassword ? "Masquer" : "Afficher"}>
              {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </span>
        )}
        {!net.broadcast && <Badge orange>masqué</Badge>}
        {net.wps && <Badge blue>WPS</Badge>}
        <button onClick={() => setShowQr((v) => !v)} className="ml-auto inline-flex items-center gap-1 lb-link text-xs hover:underline"
          title="QR code pour rejoindre ce réseau">
          <QrCode className="size-3.5" /> {showQr ? "Masquer" : "QR code"}
        </button>
        <button onClick={editing ? () => setEditing(false) : start} className="lb-link text-xs hover:underline">
          {editing ? "Annuler" : "Modifier"}
        </button>
      </div>
      {showQr && (
        <div className="mt-2 flex flex-wrap items-center gap-4 rounded-lg border lb-border p-3">
          {/* SVG généré localement par uqr : SSID et mot de passe sont encodés
              dans les modules du QR, jamais insérés comme texte. */}
          <div className="size-44 rounded bg-white p-1 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: wifiQrSvg(net) }} />
          <div className="text-xs lb-text-muted">
            <p className="font-medium lb-text">{net.ssid}</p>
            <p>Scannez avec l'appareil photo du téléphone pour rejoindre le réseau.</p>
            {!net.enabled && <p className="mt-1 text-amber-600">Ce réseau est actuellement désactivé.</p>}
          </div>
        </div>
      )}
      {editing && form && (
        <form onSubmit={handleSave} className="mt-2 grid gap-2 rounded-lg border lb-border p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs lb-text-muted">
            Nom du réseau (SSID)
            <input value={form.ssid} onChange={set("ssid")} className="lb-input" />
            {ssidError && <span className="text-red-600">{ssidError}</span>}
          </label>
          <label className="flex flex-col gap-1 text-xs lb-text-muted">
            Sécurité
            <select value={form.security} onChange={set("security")} className="lb-input">
              {(net.security_modes.length ? net.security_modes : [net.security]).map((m) => (
                <option key={m} value={m}>{SECURITY_LABELS[m] ?? m}</option>
              ))}
            </select>
          </label>
          {form.security !== "None" && (
            <label className="flex flex-col gap-1 text-xs lb-text-muted sm:col-span-2">
              Mot de passe
              <input value={form.password} onChange={set("password")} autoComplete="new-password" className="lb-input font-mono" />
              {passwordError && <span className="text-red-600">{passwordError}</span>}
            </label>
          )}
          {form.security === "None" && (
            <p className="text-xs text-red-600 sm:col-span-2">Attention : réseau ouvert, sans mot de passe.</p>
          )}
          {/* La Livebox ignore le masquage du SSID invité (toujours diffusé). */}
          {net.network !== "guest" && (
            <label className="flex items-center gap-2 text-xs lb-text-muted">
              <input type="checkbox" checked={form.broadcast} onChange={set("broadcast")} /> Diffuser le nom du réseau
            </label>
          )}
          {net.wps != null && (
            <label className="flex items-center gap-2 text-xs lb-text-muted">
              <input type="checkbox" checked={form.wps} onChange={set("wps")} /> WPS
            </label>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving || !!passwordError || !!ssidError} className="lb-btn-primary text-xs disabled:opacity-40">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          {formError && <p className="text-xs text-red-600 sm:col-span-2">Erreur : {String(formError.message ?? formError)}</p>}
        </form>
      )}
    </div>
  );
}

function WifiConfigCard() {
  const { data, loading, error, refresh } = useWsData("livebox/wifi/config", {}, 120_000);
  const networks = data?.networks ?? [];
  const groups = [
    { label: "Wi-Fi principal", items: networks.filter((n) => n.network === "lan") },
    { label: "Wi-Fi invité", items: networks.filter((n) => n.network === "guest") },
  ];
  return (
    <Card title="Configuration des réseaux">
      <StateBox loading={loading} error={error?.code === "unauthorized" ? { message: "Réservé aux administrateurs Home Assistant." } : error} />
      {groups.map((g) => g.items.length > 0 && (
        <div key={g.label} className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase lb-text-muted">{g.label}</p>
          {g.items.map((n) => <WifiNetworkRow key={`${n.network}-${n.vap}`} net={n} onSaved={refresh} />)}
        </div>
      ))}
    </Card>
  );
}

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
          guestUntil={data.guest_until}
          onRefresh={refresh}
        />
      )}

      <WifiConfigCard />

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
