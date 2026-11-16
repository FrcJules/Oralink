import { haConnect } from "./ha.mjs";
const { call, close } = await haConnect();
const reg = (await call({ type: "config/entity_registry/list" })).result.filter(e => e.platform === "oralink");
const pick = reg.filter(e => /speedtest|device_events/.test(e.unique_id));
const states = Object.fromEntries((await call({ type: "get_states" })).result.map(s => [s.entity_id, s]));
for (const e of pick) { const s = states[e.entity_id]; console.log(e.entity_id.padEnd(48), s?.state, JSON.stringify(s?.attributes ?? {}).slice(0, 150)); }
const ev = pick.find(e => /device_events/.test(e.unique_id));
if (ev && process.env.FIRE_TEST_EVENT) {
  const entry = reg.find(e => e.config_entry_id)?.config_entry_id;
  // Événement factice (MAC fictive) pour vérifier le relais bus → entité
  await call({ type: "fire_event", event_type: "oralink_device_event",
    event_data: { entry_id: entry, event: "new", mac: "02:0A:11:22:33:47", name: "Test Oralink", ip: "192.168.1.245", time: new Date().toISOString() } });
  await new Promise(r => setTimeout(r, 1500));
  const s = (await call({ type: "get_states" })).result.find(x => x.entity_id === ev.entity_id);
  console.log("après événement test:", s.state, s.attributes.event_type, s.attributes.name, s.attributes.mac);
}
const logs = (await call({ type: "system_log/list" })).result.filter(l => /oralink|aiosysbus/i.test(l.name + JSON.stringify(l.source) + l.message));
console.log(`journal HA : ${logs.length} entrée(s) Oralink`);
for (const l of logs) console.log("-", l.level, l.name, String(l.message).slice(0, 200));
await close();
