import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRate, formatDbm, formatSignal, formatDays, frNumber, parseDate } from "../src/lib/format.js";

test("débits < 1 Mbit/s en kbit/s entiers", () => {
  assert.equal(formatRate(0), "0 kbit/s");
  assert.equal(formatRate(0.004), "4 kbit/s");
  assert.equal(formatRate(0.137), "137 kbit/s");
  assert.equal(formatRate(0.9994), "999 kbit/s");
});

test("débits en Mbit/s à 1 décimale, virgule française", () => {
  assert.equal(formatRate(0.9996), "1,0 Mbit/s");
  assert.equal(formatRate(9.24), "9,2 Mbit/s");
  assert.equal(formatRate(459.592), "459,6 Mbit/s");
  assert.equal(formatRate(999.94), "999,9 Mbit/s");
});

test("débits ≥ 1000 Mbit/s en Gbit/s", () => {
  assert.equal(formatRate(999.96), "1 Gbit/s");
  assert.equal(formatRate(2000), "2 Gbit/s");
  assert.equal(formatRate(1500), "1,5 Gbit/s");
  assert.equal(formatRate(1998.148), "2 Gbit/s");
  assert.equal(formatRate(1234), "1,23 Gbit/s");
});

test("débit absent ou négatif", () => {
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(undefined), "—");
  assert.equal(formatRate("abc"), "—");
  assert.equal(formatRate(-3), "0 kbit/s");
});

test("dBm, signal, nombres", () => {
  assert.equal(formatDbm(-19.2), "−19,2 dBm");
  assert.equal(formatSignal(-48), "−48 dBm · excellent");
  assert.equal(formatSignal(-62), "−62 dBm · bon");
  assert.equal(formatSignal(null), null);
  assert.equal(frNumber(-0.01, 1), "0,0");
});

test("durées", () => {
  assert.equal(formatDays(27.9), "27,9 jours");
  assert.equal(formatDays(1), "1 jour");
  assert.equal(formatDays(3), "3 jours");
  assert.equal(formatDays(0.25), "6 h");
  assert.equal(formatDays(null), null);
});

test("dates Python et sentinelles", () => {
  assert.equal(parseDate("2026-11-16 10:00:00.123456+01:00").toISOString(), "2026-11-16T09:00:00.123Z");
  assert.equal(parseDate("2026-11-16T09:00:00Z").toISOString(), "2026-11-16T09:00:00.000Z");
  assert.equal(parseDate("0001-01-01T00:00:00Z"), null);
  assert.equal(parseDate(""), null);
});
