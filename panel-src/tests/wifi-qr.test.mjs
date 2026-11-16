import { test } from "node:test";
import assert from "node:assert/strict";
import { wifiQrPayload, wifiQrSvg } from "../src/lib/wifi-qr.js";

test("échappe \\ ; , : \" dans le SSID et le mot de passe", () => {
  const out = wifiQrPayload({ ssid: "Box;1,a", password: String.raw`a:b\c"d`, security: "WPA2-Personal" });
  assert.equal(out, String.raw`WIFI:T:WPA;S:Box\;1\,a;P:a\:b\\c\"d;;`);
});

test("WPA3 et WPA2/WPA3 → type WPA", () => {
  for (const security of ["WPA3-Personal", "WPA2-WPA3-Personal"]) {
    assert.match(wifiQrPayload({ ssid: "x", password: "12345678", security }), /^WIFI:T:WPA;/);
  }
});

test("réseau ouvert → nopass sans mot de passe", () => {
  assert.equal(wifiQrPayload({ ssid: "Ouvert", password: "ignoré", security: "None" }), "WIFI:T:nopass;S:Ouvert;;");
});

test("génère un SVG", () => {
  assert.match(wifiQrSvg({ ssid: "x", password: "12345678", security: "WPA2-Personal" }), /^<svg/);
});
