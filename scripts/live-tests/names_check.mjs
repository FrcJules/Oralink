import { haConnect } from "./ha.mjs";
import { readFileSync } from "node:fs";
const { call, close } = await haConnect();
console.log("langue HA:", (await call({ type: "get_config" })).result.language);
const reg = (await call({ type: "config/entity_registry/list" })).result.filter(e => e.platform === "oralink");
const before = JSON.parse(readFileSync("ids_before.json"));
const now = reg.map(e => e.entity_id).sort();
console.log("entity_id identiques:", JSON.stringify(before) === JSON.stringify(now), `(${now.length})`);
const states = Object.fromEntries((await call({ type: "get_states" })).result.map(s => [s.entity_id, s]));
for (const id of ["switch.livebox_6_wifi", "switch.livebox_6_guest_wifi", "sensor.livebox_6_speedtest_download", "binary_sensor.livebox_6_wan_status",
                  "button.livebox_6_livebox_restart", "select.livebox_6_firewall_level", "event.livebox_6_evenements_reseau", "sensor.sonos_chambre_damis_debit"])
  console.log(id.padEnd(42), "→", states[id]?.attributes?.friendly_name ?? "(absent)");
const logs = (await call({ type: "system_log/list" })).result.filter(l => /oralink|translation/i.test(l.name + JSON.stringify(l.source) + l.message));
console.log("journal HA (oralink/translation):", logs.length); for (const l of logs) console.log(" -", l.level, String(l.message).slice(0, 160));
await close();
