/**
 * Qualité de la connexion : test de débit planifié (speedtest.py, mesuré
 * depuis Home Assistant vers Cloudflare) et santé de la fibre (puissance
 * optique relevée chaque heure). Données : livebox/monitor.
 */
import { useState } from "react";
import { Gauge, Activity, Play } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { useWsAction } from "../lib/use-ws-action.js";
import { Card, StateBox, Row } from "../components/card.jsx";
import { Pill, Sparkline } from "../components/status.jsx";
import { frNumber, parseDate } from "../lib/format.js";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const fmtDate = (v) => { const d = parseDate(v); return d ? dateFmt.format(d) : "—"; };
const mbit = (v) => (v == null ? "—" : `${frNumber(v, v < 100 ? 1 : 0)} Mbit/s`);
const FIBER_LEVEL = { ok: "Correct", warn: "À surveiller", bad: "Critique", unknown: "Inconnu" };

function SpeedtestCard({ data, onChanged }) {
  const runAction = useWsAction();
  const [running, setRunning] = useState(false);
  const { latest, history, baseline_down: baseline } = data.speedtest;

  const run = async () => {
    setRunning(true);
    try {
      const r = await runAction({ type: "livebox/speedtest/run" }, {});
      onChanged();
      return r;
    } catch { /* toast */ } finally { setRunning(false); }
  };

  return (
    <Card
      title={<span className="flex items-center gap-2"><Gauge className="size-4" /> Test de débit</span>}
      actions={
        <button onClick={run} disabled={running || data.speedtest.running}
          className="lb-btn-primary inline-flex items-center gap-1 text-xs disabled:opacity-40">
          <Play className="size-3.5" /> {running || data.speedtest.running ? "Test en cours (~20 s)…" : "Tester maintenant"}
        </button>
      }
    >
      {latest ? (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs lb-text-muted">↓ Descendant</p><p className="text-lg font-semibold lb-text">{mbit(latest.down)}</p></div>
            <div><p className="text-xs lb-text-muted">↑ Montant</p><p className="text-lg font-semibold lb-text">{mbit(latest.up)}</p></div>
            <div><p className="text-xs lb-text-muted">Latence</p><p className="text-lg font-semibold lb-text">{frNumber(latest.latency, 0)} ms</p></div>
          </div>
          <Row label="Dernier test" value={fmtDate(latest.time)} />
          {baseline && <Row label="Débit ↓ habituel (médiane)" value={mbit(baseline)} />}
          {history.length > 1 && (
            <div className="mt-3">
              <p className="mb-1 text-xs lb-text-muted">{history.length} derniers tests (↓ plein, ↑ pointillé)</p>
              <Sparkline label="Historique des tests de débit" series={[
                { values: history.map((h) => h.down), color: "var(--lb-data)", area: true },
                { values: history.map((h) => h.up), color: "var(--lb-data)", dashed: true },
              ]} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm lb-text-muted">Aucun test pour l'instant. Le premier aura lieu à l'heure programmée, ou lancez-en un.</p>
      )}
      <p className="mt-3 text-xs lb-text-muted">
        Mesuré depuis Home Assistant vers les serveurs de test Cloudflare (la Livebox ne permet pas de lancer
        de test elle-même). Le résultat est limité par la connexion de la machine Home Assistant : un serveur en
        Ethernet 1 Gbit/s ne mesurera pas plus de ~940 Mbit/s, même sur une fibre plus rapide.
      </p>
      <SpeedtestSettings settings={data.settings} onSaved={onChanged} />
    </Card>
  );
}

function SpeedtestSettings({ settings, onSaved }) {
  const runAction = useWsAction();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  const save = async () => {
    setSaving(true);
    try {
      await runAction({ type: "livebox/monitor/set", speedtest_enabled: form.speedtest_enabled,
        speedtest_hour: Number(form.speedtest_hour), min_down: Number(form.min_down) || 0 },
      { success: "Réglages du test de débit enregistrés." });
      onSaved();
    } catch { /* toast */ } finally { setSaving(false); }
  };

  return (
    <div className="mt-3 space-y-2 border-t lb-border pt-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.speedtest_enabled}
          onChange={(e) => setForm({ ...form, speedtest_enabled: e.target.checked })} />
        Test automatique chaque jour à
        <select value={form.speedtest_hour} disabled={!form.speedtest_enabled}
          onChange={(e) => setForm({ ...form, speedtest_hour: Number(e.target.value) })} className="lb-input py-0.5 text-xs">
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h 17</option>)}
        </select>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        Alerter si ↓ inférieur à
        <input type="number" min={0} value={form.min_down}
          onChange={(e) => setForm({ ...form, min_down: e.target.value })} className="lb-input w-24 py-0.5 text-xs" />
        Mbit/s
        <span className="text-xs lb-text-muted">(0 = automatique : moitié du débit habituel, confirmée par un 2ᵉ test)</span>
      </label>
      {dirty && (
        <button onClick={save} disabled={saving} className="lb-btn-primary text-xs disabled:opacity-40">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      )}
    </div>
  );
}

function FiberCard({ fiber }) {
  const { level, text, current, history } = fiber;
  return (
    <Card title={<span className="flex items-center gap-2"><Activity className="size-4" /> Santé de la fibre</span>}>
      {!current ? (
        <p className="text-sm lb-text-muted">Pas encore de relevé (un par heure).</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Pill level={level === "unknown" ? "neutral" : level}>{FIBER_LEVEL[level]}</Pill>
            <span className="text-sm lb-text">{text}</span>
          </div>
          <Row label="Puissance reçue" value={`${frNumber(current.rx, 1)} dBm`} />
          <Row label="Puissance émise" value={`${frNumber(current.tx, 1)} dBm`} />
          {current.temp != null && <Row label="Température du module" value={`${current.temp} °C`} />}
          <Row label="Dernier relevé" value={fmtDate(current.t)} />
          {history.length > 1 && (
            <div className="mt-3">
              <p className="mb-1 text-xs lb-text-muted">
                Puissance reçue, {history.length} relevés horaires (min {frNumber(Math.min(...history.map((h) => h.rx)), 1)} ·
                max {frNumber(Math.max(...history.map((h) => h.rx)), 1)} dBm)
              </p>
              {/* Décalage pour que la courbe reste lisible (valeurs négatives). */}
              <Sparkline label="Puissance optique reçue" series={[
                { values: history.map((h) => h.rx + 40), color: "var(--lb-data)", area: true },
              ]} />
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-xs lb-text-muted">
        Repères GPON : entre -8 et -25 dBm tout va bien ; en dessous de -27 dBm la marge devient faible ;
        vers -28 dBm les coupures arrivent. Une baisse de 3 dB par rapport à l'habitude signale souvent un
        connecteur sale ou une fibre pliée. Alerte ntfy à chaque changement de niveau.
      </p>
    </Card>
  );
}

export function MonitorTab() {
  const { data, loading, error, refresh } = useWsData("livebox/monitor", {}, 30_000);
  return (
    <div className="space-y-4">
      <StateBox loading={loading} error={error} />
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <SpeedtestCard data={data} onChanged={refresh} />
          <FiberCard fiber={data.fiber} />
        </div>
      )}
    </div>
  );
}
