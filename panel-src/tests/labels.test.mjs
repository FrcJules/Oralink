import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interfaceLabel, bandLabel, fiberLevel, stateLabel, firewallLabel, signalQuality, isEmptyValue, isWifiInterface,
} from "../src/lib/labels.js";

test("ports Ethernet", () => {
  assert.equal(interfaceLabel("ETH0"), "Port LAN 2.5G");
  for (const n of [1, 2, 3, 4]) assert.equal(interfaceLabel(`ETH${n}`), `Port LAN ${n}`);
  assert.equal(interfaceLabel("eth2"), "Port LAN 2");
});

test("VAP Wi-Fi et invité", () => {
  assert.equal(interfaceLabel("vap2g0priv0"), "Wi-Fi 2,4 GHz");
  assert.equal(interfaceLabel("vap5g0priv0"), "Wi-Fi 5 GHz");
  assert.equal(interfaceLabel("vap6g0priv0"), "Wi-Fi 6 GHz");
  assert.equal(interfaceLabel("guest"), "Wi-Fi invité");
  assert.equal(interfaceLabel("vap5g0guest"), "Wi-Fi invité");
  assert.equal(interfaceLabel("vap5g0priv9", "5GHz"), "Wi-Fi 5 GHz");
  assert.ok(isWifiInterface("vap2g0priv0") && !isWifiInterface("ETH1"));
});

test("repli sur la bande, interface inconnue inchangée", () => {
  assert.equal(interfaceLabel("", "2.4GHz"), "Wi-Fi 2,4 GHz");
  assert.equal(bandLabel("6GHz"), "Wi-Fi 6 GHz");
  assert.equal(interfaceLabel(null, null), null);
  assert.equal(interfaceLabel("bridge"), "bridge");
});

test("états en français", () => {
  assert.equal(stateLabel("up"), "Connecté");
  assert.equal(stateLabel("Up"), "Connecté");
  assert.equal(stateLabel("down"), "Déconnecté");
  assert.equal(stateLabel("gpon"), "Fibre");
  assert.equal(stateLabel("O5"), "Opérationnel (O5)");
  assert.equal(stateLabel("Inconnu"), "Inconnu");
  assert.equal(stateLabel(""), null);
});

test("pare-feu", () => {
  assert.equal(firewallLabel("Low"), "Pare-feu bas");
  assert.equal(firewallLabel("Medium"), "Pare-feu moyen");
  assert.equal(firewallLabel("High"), "Pare-feu élevé");
  assert.equal(firewallLabel(null), null);
});

test("qualité du signal (seuils de sensor.py)", () => {
  const q = (dbm) => signalQuality(dbm)?.label;
  assert.equal(q(-45), "excellent");
  assert.equal(q(-50), "très bon");
  assert.equal(q(-48), "excellent");
  assert.equal(q(-60), "bon");
  assert.equal(q(-67), "faible");
  assert.equal(q(-70), "très faible");
  assert.equal(q(-80), "mauvais");
  assert.equal(q(-91), "très mauvais");
  assert.equal(signalQuality(-62).level, "ok");
  assert.equal(signalQuality(-72).level, "warn");
  assert.equal(signalQuality(0), null);
  assert.equal(signalQuality(null), null);
});

test("valeurs vides et sentinelles", () => {
  for (const v of [null, undefined, "", "  ", "0001-01-01T00:00:00Z", NaN]) assert.ok(isEmptyValue(v), String(v));
  for (const v of [0, false, "x", "2026-01-01T00:00:00Z"]) assert.ok(!isEmptyValue(v), String(v));
});

test("niveau du signal fibre", () => {
  assert.equal(fiberLevel(-19.2).level, "ok");
  assert.equal(fiberLevel(-25).level, "ok");
  assert.equal(fiberLevel(-26).level, "warn");
  assert.equal(fiberLevel(-27).level, "warn");
  assert.equal(fiberLevel(-27.1).level, "bad");
  assert.equal(fiberLevel(null), null);
});
