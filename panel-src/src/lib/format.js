// Formatage des nombres pour l'affichage (virgule décimale française).
// Module pur, testé par tests/format.test.mjs.

import { signalQuality } from "./labels.js";

const MINUS = "−"; // vrai signe moins typographique

/** 1.5 → « 1,5 » ; -19.2 → « −19,2 ». */
export function frNumber(value, decimals = 0) {
  const text = Math.abs(value).toFixed(decimals).replace(".", ",");
  return value < 0 && Number(text.replace(",", ".")) !== 0 ? `${MINUS}${text}` : text;
}

/**
 * Débit en Mbit/s → texte lisible, une seule règle partout :
 * < 1 Mbit/s en kbit/s entiers, sinon Mbit/s à 1 décimale, ≥ 1000 en Gbit/s
 * (jusqu'à 2 décimales, zéros inutiles retirés : « 2 Gbit/s », « 1,5 Gbit/s »).
 * Renvoie « — » si la valeur est absente.
 */
export function formatRate(mbit) {
  if (mbit == null || mbit === "" || Number.isNaN(Number(mbit))) return "—";
  const value = Math.max(0, Number(mbit));
  const kbit = Math.round(value * 1000);
  if (kbit < 1000) return `${kbit} kbit/s`;
  const mbitRounded = Math.round(value * 10) / 10;
  if (mbitRounded < 1000) return `${frNumber(mbitRounded, 1)} Mbit/s`;
  const gbit = (Math.round(value / 10) / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${gbit.replace(".", ",")} Gbit/s`;
}

/** Puissance en dBm : « −19,2 dBm ». */
export function formatDbm(dbm, decimals = 1) {
  if (dbm == null || Number.isNaN(Number(dbm))) return null;
  return `${frNumber(Number(dbm), decimals)} dBm`;
}

/** Signal Wi-Fi qualifié : « −48 dBm · bon ». */
export function formatSignal(dbm) {
  const quality = signalQuality(dbm);
  if (!quality) return null;
  return `${formatDbm(dbm, 0)} · ${quality.label}`;
}

/** Durée en jours → « 27,9 jours », « 1 jour », « 5 h » (< 1 jour). */
export function formatDays(days) {
  if (days == null || Number.isNaN(Number(days))) return null;
  const d = Number(days);
  if (d < 1) return `${Math.max(0, Math.round(d * 24))} h`;
  const rounded = Math.round(d * 10) / 10;
  return `${frNumber(rounded, Number.isInteger(rounded) ? 0 : 1)} ${rounded < 2 ? "jour" : "jours"}`;
}

/**
 * Parse les dates renvoyées par le backend : ISO, mais aussi `str(datetime)`
 * Python (« 2026-11-16 10:00:00.123456+01:00 »), que Safari refuse tel quel.
 */
export function parseDate(value) {
  if (!value || typeof value !== "string" || value.startsWith("0001-01-01")) return null;
  const iso = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
