import { renderSVG } from "uqr";

// Format standard « WIFI: » reconnu par les appareils photo iOS / Android.
// Les caractères \ ; , : " doivent être échappés dans le SSID et le mot de passe.
const escape = (value) => String(value ?? "").replace(/([\\;,:"])/g, "\\$1");

export function wifiQrPayload({ ssid, password, security }) {
  const type = !security || security === "None" ? "nopass" : "WPA"; // WPA couvre WPA2/WPA3
  const pass = type === "nopass" ? "" : `P:${escape(password)};`;
  return `WIFI:T:${type};S:${escape(ssid)};${pass};`;
}

/** SVG (chaîne) du QR code permettant de rejoindre le réseau. */
export function wifiQrSvg(network) {
  return renderSVG(wifiQrPayload(network), { border: 2, ecc: "M" });
}
