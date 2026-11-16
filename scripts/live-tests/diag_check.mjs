import { writeFileSync } from "node:fs";
const HA = "http://192.168.1.134:8123", CID = HA + "/";
const post = async (p, b, form) => { const r = await fetch(HA + p, { method: "POST",
  headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
  body: form ? new URLSearchParams(b) : JSON.stringify(b) }); const t = await r.text(); return t ? JSON.parse(t) : {}; };
const flow = await post("/auth/login_flow", { client_id: CID, handler: ["homeassistant", null], redirect_uri: CID });
const res = await post(`/auth/login_flow/${flow.flow_id}`, { client_id: CID, username: process.env.HA_USER, password: process.env.HA_PASS });
const tok = await post("/auth/token", { grant_type: "authorization_code", code: res.result, client_id: CID }, true);
const r = await fetch(`${HA}/api/diagnostics/config_entry/${process.env.ENTRY_ID}`, { headers: { Authorization: "Bearer " + tok.access_token } });
const text = await r.text();
writeFileSync(process.env.OUT, text);
console.log("HTTP", r.status, "taille", text.length);
await post("/auth/revoke", { token: tok.refresh_token }, true);
