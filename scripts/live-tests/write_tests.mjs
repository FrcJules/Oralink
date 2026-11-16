import { haConnect } from "./ha.mjs";
import { lbConnect } from "./lb.mjs";
const ha = await haConnect(); const lb = await lbConnect();
const st = async (s, m, p) => (await lb.call(s, m, p)).status;
const ws = async (msg) => { const r = await ha.call(msg); return r.success ? { ok: true, r: r.result } : { ok: false, e: `${r.error?.code}: ${r.error?.message}` }; };
const results = [];
const rec = (name, ok, detail = "") => { results.push([name, ok, detail]); console.log(`${ok ? "OK " : "KO "} ${name.padEnd(34)} ${detail}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function test(name, fn) { try { await fn(); } catch (e) { rec(name, false, "EXCEPTION " + e.message); } }

// 1. LED orange (valeur de référence lue sur la box, restaurée ensuite)
await test("LED orange", async () => {
  const before = (await st("LEDs.LED.Orange", "get")).Brightness;
  const a = await ws({ type: "livebox/system/led/set", led: "orange", brightness: 50 });
  const mid = (await st("LEDs.LED.Orange", "get")).Brightness;
  // restauration directe sur la box (la commande Oralink est limitée à 0-100)
  await lb.call("LEDs.LED.Orange", "set", { Brightness: before });
  const after = (await st("LEDs.LED.Orange", "get")).Brightness;
  rec("LED orange : écriture (50 %)", a.ok && mid === 128 && after === before, `avant ${before} → Oralink 50 % → box ${mid} (attendu 128) → restauré ${after} ${a.e ?? ""}`);
});
// 2. Écran : mot de passe Wifi
await test("Écran mot de passe", async () => {
  const before = await st("Screen", "getShowWifiPassword");
  const a = await ws({ type: "livebox/system/show_wifi_password/set", enabled: !before });
  const mid = await st("Screen", "getShowWifiPassword");
  const b = await ws({ type: "livebox/system/show_wifi_password/set", enabled: before });
  const after = await st("Screen", "getShowWifiPassword");
  rec("Écran mot de passe Wifi", a.ok && b.ok && mid === !before && after === before, `${before} → ${mid} → ${after} ${a.e ?? ""}${b.e ?? ""}`);
});
// 3. Réponse au ping
await test("Ping", async () => {
  const before = await st("Firewall", "getRespondToPing", { sourceInterface: "data" });
  const a = await ws({ type: "livebox/ping_response/set", ipv4: !before.enableIPv4, ipv6: before.enableIPv6 });
  const mid = await st("Firewall", "getRespondToPing", { sourceInterface: "data" });
  const b = await ws({ type: "livebox/ping_response/set", ipv4: before.enableIPv4, ipv6: before.enableIPv6 });
  const after = await st("Firewall", "getRespondToPing", { sourceInterface: "data" });
  rec("Réponse au ping IPv4", a.ok && b.ok && mid.enableIPv4 === !before.enableIPv4 && after.enableIPv4 === before.enableIPv4,
    `${before.enableIPv4} → ${mid.enableIPv4} → ${after.enableIPv4} ${a.e ?? ""}${b.e ?? ""}`);
});
// 4. Règle NAT de test
await test("NAT", async () => {
  const a = await ws({ type: "livebox/nat/add", name: "OralinkTest", protocol: "TCP/UDP", external_port: "65011", internal_port: "65011", destination_ip: "192.168.1.248" });
  const pf = await st("Firewall", "getPortForwarding", {});
  const key = Object.keys(pf).find(k => pf[k].Description === "OralinkTest" || k.includes("OralinkTest"));
  rec("NAT : ajout (TCP/UDP)", a.ok && !!key && pf[key].Protocol === "6,17", `${a.e ?? ""} id=${key} Protocol=${key ? pf[key].Protocol : ""}`);
  if (key) {
    const b = await ws({ type: "livebox/nat/delete", rule_id: key });
    const pf2 = await st("Firewall", "getPortForwarding", {});
    rec("NAT : suppression", b.ok && !pf2[key], b.e ?? "");
  }
});
// 5. PTF de test
await test("PTF", async () => {
  const a = await ws({ type: "livebox/ptf/add", name: "OralinkTest", protocol: "47", destination_ip: "192.168.1.248" });
  const r = await st("Firewall", "getProtocolForwarding", {});
  const key = Object.keys(r || {}).find(k => (r[k].Description || "").includes("OralinkTest") || k.includes("OralinkTest"));
  rec("PTF : ajout (GRE)", a.ok && !!key && r[key].Protocol === "47" && r[key].DestinationIPAddress === "192.168.1.248", `${a.e ?? ""} id=${key} box=${JSON.stringify(r).slice(0, 160)}`);
  const lst = await ws({ type: "livebox/ptf" });
  rec("PTF : lecture via Oralink", lst.ok && (lst.r || []).some(x => x.id === key && x.destination_ip === "192.168.1.248"), JSON.stringify(lst.r ?? lst.e).slice(0, 160));
  if (key) {
    const b = await ws({ type: "livebox/ptf/delete", rule_id: key });
    const r2 = await st("Firewall", "getProtocolForwarding", {});
    rec("PTF : suppression", b.ok && !(r2 || {})[key], b.e ?? "");
  }
});
// 6. Bail DHCP statique (MAC fictive localement administrée)
await test("DHCP statique", async () => {
  const mac = "02:0A:11:22:33:44";
  const a = await ws({ type: "livebox/dhcp_static/add", mac, ip: "192.168.1.247", name: "OralinkTest" });
  const l = await st("DHCPv4.Server.Pool.default", "getStaticLeases", {});
  const found = (l || []).find(x => x.MACAddress.toUpperCase() === mac);
  rec("DHCP statique : ajout", a.ok && !!found, `${a.e ?? ""} ${found ? found.IPAddress : ""}`);
  const b = await ws({ type: "livebox/dhcp_static/delete", mac });
  const l2 = await st("DHCPv4.Server.Pool.default", "getStaticLeases", {});
  rec("DHCP statique : suppression", b.ok && !(l2 || []).some(x => x.MACAddress.toUpperCase() === mac), b.e ?? "");
});
// 7. DMZ vers une IP inutilisée
await test("DMZ", async () => {
  const a = await ws({ type: "livebox/dmz/set", ip: "192.168.1.248", enabled: true });
  const d = await st("Firewall", "getDMZ", {});
  rec("DMZ : activation", a.ok && d && d.webui?.DestinationIPAddress === "192.168.1.248", `${a.e ?? ""} ${JSON.stringify(d).slice(0, 120)}`);
  const list = await ws({ type: "livebox/dmz" });
  rec("DMZ : lecture via Oralink", list.ok && list.r.entries.some(e => e.ip === "192.168.1.248"), JSON.stringify(list.r ?? list.e).slice(0, 120));
  const b = await ws({ type: "livebox/dmz/delete", dmz_id: "webui" });
  const d2 = await st("Firewall", "getDMZ", {});
  rec("DMZ : suppression", b.ok && !d2?.webui, `${b.e ?? ""} ${JSON.stringify(d2)}`);
});
// 8. Contact
await test("Contact", async () => {
  const a = await ws({ type: "livebox/phone/contacts/add", name: "OralinkTest", cell: "0600000000" });
  const c = await st("Phonebook", "getAllContacts", {});
  const found = (c || []).find(x => (x.formattedName || "").includes("OralinkTest") || (x.name || "").includes("OralinkTest"));
  rec("Contact : ajout", a.ok && !!found, `${a.e ?? ""} ${found ? found.uniqueID : JSON.stringify(c).slice(0, 120)}`);
  if (found) {
    const b = await ws({ type: "livebox/phone/contacts/delete", unique_id: found.uniqueID });
    const c2 = await st("Phonebook", "getAllContacts", {});
    rec("Contact : suppression", b.ok && !(c2 || []).some(x => x.uniqueID === found.uniqueID), b.e ?? "");
  }
});
// 9. Pare-feu (même niveau → vérifie seulement que la commande marche)
await test("Pare-feu", async () => {
  const before = await st("Firewall", "getFirewallLevel", {});
  const a = await ws({ type: "livebox/firewall/level/set", level: before });
  const after = await st("Firewall", "getFirewallLevel", {});
  rec("Pare-feu : niveau (inchangé)", a.ok && after === before, `${before} → ${after} ${a.e ?? ""}`);
});
// 10. Fuseau horaire (même valeur)
await test("Fuseau", async () => {
  const tz = (await lb.call("Time", "getLocalTimeZoneName", {})).data?.timezone;
  const a = await ws({ type: "livebox/system/time/set", timezone: tz });
  const after = (await lb.call("Time", "getLocalTimeZoneName", {})).data?.timezone;
  rec("Fuseau horaire (inchangé)", a.ok && after === tz, `${tz} → ${after} ${a.e ?? ""}`);
});
// 11. DynDNS (hôte fictif, supprimé aussitôt)
await test("DynDNS", async () => {
  const a = await ws({ type: "livebox/ddns/add", service: "No-IP", hostname: "oralink-test.invalid", username: "x", password: "x" });
  const h = await st("DynDNS", "getHosts", {});
  rec("DynDNS : ajout", a.ok && (h || []).some(x => x.hostname === "oralink-test.invalid"), a.e ?? "");
  const b = await ws({ type: "livebox/ddns/delete", service: "No-IP", hostname: "oralink-test.invalid" });
  const h2 = await st("DynDNS", "getHosts", {});
  rec("DynDNS : suppression (hôte réel conservé)", b.ok && !(h2 || []).some(x => x.hostname === "oralink-test.invalid") && (h2 || []).length === (h || []).length - 1, b.e ?? "");
});
// 12. Wake-on-LAN (MAC fictive)
await test("WoL", async () => { const a = await ws({ type: "livebox/device/wake", mac: "02:0A:11:22:33:44" }); rec("Wake-on-LAN", a.ok, a.e ?? JSON.stringify(a.r)); });
// 13. Stockage HA : type d'appareil, topologie, décodeur TV
await test("Type appareil", async () => {
  const mac = "02:0A:11:22:33:44";
  const a = await ws({ type: "livebox/topology/type/set", mac, device_type: "Computer" });
  const t = await ws({ type: "livebox/topology/types" });
  const b = await ws({ type: "livebox/topology/type/set", mac, device_type: null });
  const t2 = await ws({ type: "livebox/topology/types" });
  rec("Type d'appareil forcé", a.ok && t.r?.[mac] === "Computer" && b.ok && !t2.r?.[mac], `${a.e ?? ""}${b.e ?? ""}`);
});
await test("Topologie", async () => {
  const a = await ws({ type: "livebox/topology/positions/set", node_id: "oralink-test", x: 10, y: 20 });
  const p = await ws({ type: "livebox/topology/positions" });
  const sw = await ws({ type: "livebox/topology/switches/set", name: "OralinkTest", devices: [] });
  const sws = await ws({ type: "livebox/topology/switches" });
  const id = (sws.r || []).find(s => s.name === "OralinkTest")?.id;
  const rm = id ? await ws({ type: "livebox/topology/switches/remove", switch_id: id }) : { ok: false, e: "switch introuvable " + JSON.stringify(sws.r).slice(0, 100) };
  const pr = await ws({ type: "livebox/topology/parent/set", mac: "02:0A:11:22:33:44", parent: "02:0A:11:22:33:46" });
  const prs = await ws({ type: "livebox/topology/parents" });
  const pr2 = await ws({ type: "livebox/topology/parent/set", mac: "02:0A:11:22:33:44", parent: null });
  const pos = await ws({ type: "livebox/topology/positions" });
  rec("Topologie : position", a.ok && p.r?.["oralink-test"]?.x === 10, a.e ?? "");
  rec("Topologie : switch perso", sw.ok && rm.ok, `${sw.e ?? ""}${rm.e ?? ""}`);
  rec("Topologie : rattachement forcé", pr.ok && prs.r?.["02:0A:11:22:33:44"] === "02:0A:11:22:33:46" && pr2.ok, `${pr.e ?? ""}${pr2.e ?? ""} ${JSON.stringify(prs.r).slice(0, 80)}`);
  // nettoyage de la position de test : reset seulement si aucune autre position n'existait
  const others = Object.keys(pos.r || {}).filter(k => k !== "oralink-test");
  if (!others.length) { const r = await ws({ type: "livebox/topology/positions/reset" }); rec("Topologie : reset positions", r.ok, r.e ?? ""); }
});
await test("Décodeur TV", async () => {
  const a = await ws({ type: "livebox/tvdecoders/set", mac: "02:0A:11:22:33:45", name: "OralinkTest", ip: "192.168.1.246" });
  const l = await ws({ type: "livebox/tvdecoders" });
  const b = await ws({ type: "livebox/tvdecoders/remove", mac: "02:0A:11:22:33:45" });
  const l2 = await ws({ type: "livebox/tvdecoders" });
  rec("Décodeur TV : config", a.ok && JSON.stringify(l.r).includes("OralinkTest") && b.ok && !JSON.stringify(l2.r).includes("OralinkTest"), `${a.e ?? ""}${b.e ?? ""}`);
});
console.log(`\n${results.filter(r => r[1]).length}/${results.length} OK`);
await ha.close();
