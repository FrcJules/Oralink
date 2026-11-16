// Libellés humains partagés par tous les onglets : interfaces, états,
// pare-feu, qualité du signal Wi-Fi, valeurs vides. Module pur (pas de JSX ni
// de React) pour être testé directement avec node:test.

// Ports Ethernet de la Livebox (Livebox 6 : ETH0 = port 2,5 Gbit/s).
export const PORT_LABELS = {
  ETH0: "Port LAN 2.5G", ETH1: "Port LAN 1", ETH2: "Port LAN 2", ETH3: "Port LAN 3", ETH4: "Port LAN 4",
};

export const WIFI_LABELS = {
  vap2g0priv0: "Wi-Fi 2,4 GHz", vap2g0priv1: "Wi-Fi 2,4 GHz",
  vap5g0priv0: "Wi-Fi 5 GHz", vap5g0priv1: "Wi-Fi 5 GHz",
  vap6g0priv0: "Wi-Fi 6 GHz", vap6g0priv1: "Wi-Fi 6 GHz",
  wlan0: "Wi-Fi 2,4 GHz", wl0: "Wi-Fi 5 GHz",
};

const BAND_LABELS = { "2.4GHz": "Wi-Fi 2,4 GHz", "5GHz": "Wi-Fi 5 GHz", "6GHz": "Wi-Fi 6 GHz" };

/** Interface Wi-Fi (VAP Livebox) ? */
export function isWifiInterface(iface) {
  return !!iface && /^(vap|wl)/i.test(iface);
}

/** « 5GHz » → « Wi-Fi 5 GHz ». */
export function bandLabel(band) {
  if (!band) return null;
  return BAND_LABELS[band] ?? `Wi-Fi ${String(band).replace(/(\d)\.(\d)/, "$1,$2").replace(/GHz$/i, " GHz")}`;
}

/**
 * Nom lisible d'une interface Livebox : ETH2 → « Port LAN 2 »,
 * vap5g0priv0 → « Wi-Fi 5 GHz », tout VAP invité → « Wi-Fi invité ».
 * `band` (OperatingFrequencyBand) sert de repli pour une VAP inconnue.
 */
export function interfaceLabel(iface, band) {
  if (!iface) return bandLabel(band);
  if (/guest/i.test(iface)) return "Wi-Fi invité";
  const upper = iface.toUpperCase();
  if (PORT_LABELS[upper]) return PORT_LABELS[upper];
  if (WIFI_LABELS[iface]) return WIFI_LABELS[iface];
  if (isWifiInterface(iface) && band) return bandLabel(band);
  return iface;
}

// États bruts renvoyés par la box (WanState, LinkType, OnuState, DeviceStatus…).
const STATE_LABELS = {
  up: "Connecté",
  down: "Déconnecté",
  connected: "Connecté",
  disconnected: "Déconnecté",
  connecting: "Connexion en cours",
  bound: "Connecté",
  enabled: "Activé",
  disabled: "Désactivé",
  available: "Disponible",
  unavailable: "Indisponible",
  error: "Erreur",
  gpon: "Fibre",
  xgspon: "Fibre",
  "xgs-pon": "Fibre",
  sfp: "Fibre",
  dsl: "ADSL",
  adsl: "ADSL",
  vdsl: "VDSL",
  ethernet: "Ethernet",
  dhcp: "DHCP",
  pppoe: "PPPoE",
  o1: "Initialisation (O1)",
  o2: "Attente (O2)",
  o3: "Numéro de série (O3)",
  o4: "Télémétrie (O4)",
  o5: "Opérationnel (O5)",
  o6: "Signal perdu (O6)",
  o7: "Arrêt d'urgence (O7)",
};

/** « up » → « Connecté », « gpon » → « Fibre »… ; valeur inconnue rendue telle quelle. */
export function stateLabel(value) {
  if (isEmptyValue(value)) return null;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return STATE_LABELS[String(value).trim().toLowerCase()] ?? String(value);
}

const FIREWALL_LABELS = { low: "Pare-feu bas", medium: "Pare-feu moyen", high: "Pare-feu élevé", custom: "Pare-feu personnalisé" };

/** Low/Medium/High → « Pare-feu bas/moyen/élevé ». */
export function firewallLabel(level) {
  if (isEmptyValue(level)) return null;
  return FIREWALL_LABELS[String(level).toLowerCase()] ?? `Pare-feu ${level}`;
}

/**
 * Qualité d'un signal Wi-Fi (dBm, négatif) — mêmes seuils que
 * LiveboxDeviceSignalSensor (sensor.py). `level` : ok | warn | bad, pour la
 * couleur d'état.
 */
export function signalQuality(dbm) {
  if (dbm == null || dbm === 0 || Number.isNaN(Number(dbm))) return null;
  const abs = Math.abs(Number(dbm));
  if (abs > 90) return { label: "très mauvais", level: "bad" };
  if (abs >= 80) return { label: "mauvais", level: "bad" };
  if (abs >= 70) return { label: "très faible", level: "warn" };
  if (abs >= 67) return { label: "faible", level: "warn" };
  if (abs >= 60) return { label: "bon", level: "ok" };
  if (abs >= 50) return { label: "très bon", level: "ok" };
  return { label: "excellent", level: "ok" };
}

/** Puissance fibre reçue (dBm) : bon ≥ −25, faible jusqu'à −27, critique en dessous. */
export function fiberLevel(powerRx) {
  if (powerRx == null || Number.isNaN(Number(powerRx))) return null;
  if (powerRx >= -25) return { level: "ok", label: "bon" };
  if (powerRx >= -27) return { level: "warn", label: "faible" };
  return { level: "bad", label: "critique" };
}

const SENTINELS = new Set(["", "0001-01-01T00:00:00Z", "0001-01-01T00:00:00", "None", "null", "undefined"]);

/** Valeur vide ou sentinelle Livebox (null, "", date « 0001-01-01 »…) — à masquer. */
export function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "string") return SENTINELS.has(value.trim());
  return false;
}
