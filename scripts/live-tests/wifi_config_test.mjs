import { haConnect } from "./ha.mjs";
import { lbConnect } from "./lb.mjs";
const ha = await haConnect(); const lb = await lbConnect();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const rec = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "OK " : "KO "} ${n.padEnd(42)} ${d}`); };
const boxVap = async (net, k) => (await lb.call(`NeMo.Intf.${net}`, "getMIBs", { mibs: "wlanvap base" })).status;

const cfg = await ha.call({ type: "livebox/wifi/config" });
const nets = cfg.result?.networks ?? [];
rec("lecture config", cfg.success && nets.length >= 7, `${nets.length} réseaux : ${nets.map(n => `${n.network}/${n.vap}${n.enabled ? "" : "(off)"}`).join(", ")}`);

for (const [network, vap] of [["guest", "vap2g0guest0"], ["lan", "vap2g0priv1"]]) {
  const before = nets.find(n => n.vap === vap);
  if (!before || before.enabled) { rec(`${vap} désactivé (pré-requis)`, false, "réseau actif : test annulé"); continue; }
  const flip = network === "guest" ? {} : { broadcast: !before.broadcast };
  const r = await ha.call({ type: "livebox/wifi/config/set", network, vap, ssid: before.ssid + "-T", password: "OralinkTest-123", ...flip });
  await sleep(3000);
  const mid = await boxVap(network);
  const v = mid.wlanvap[vap];
  rec(`${vap} : modification`, r.success && v.SSID === before.ssid + "-T" && v.Security.KeyPassPhrase === "OralinkTest-123" && v.SSIDAdvertisementEnabled === (network === "guest" ? before.broadcast : !before.broadcast),
      `${r.error?.message ?? JSON.stringify(r.result)}`);
  rec(`${vap} : toujours désactivé`, mid.base[vap]?.Enable === false);
  const back = await ha.call({ type: "livebox/wifi/config/set", network, vap, ssid: before.ssid, password: before.password, broadcast: before.broadcast });
  await sleep(3000);
  const after = (await boxVap(network)).wlanvap[vap];
  rec(`${vap} : restauration exacte`, back.success && after.SSID === before.ssid && after.Security.KeyPassPhrase === before.password && after.SSIDAdvertisementEnabled === before.broadcast);
}
const hide = await ha.call({ type: "livebox/wifi/config/set", network: "guest", vap: "vap2g0guest0", broadcast: false });
rec("masquage SSID invité → « non appliqué »", !hide.success && hide.error?.code === "not_applied", hide.error?.message);
const noop = await ha.call({ type: "livebox/wifi/config/set", network: "guest", vap: "vap2g0guest0", ssid: nets.find(n => n.vap === "vap2g0guest0").ssid });
rec("aucun changement → noop", noop.success && noop.result.status === "noop");
const bad = await ha.call({ type: "livebox/wifi/config/set", network: "guest", vap: "vap2g0guest0", password: "court" });
rec("mot de passe trop court refusé", !bad.success, bad.error?.message);
const bad2 = await ha.call({ type: "livebox/wifi/config/set", network: "guest", vap: "vap2g0guest0", security: "WEP" });
rec("mode de sécurité inconnu refusé", !bad2.success, bad2.error?.message);
const unknown = await ha.call({ type: "livebox/wifi/config/set", network: "guest", vap: "vap9g9guest9", ssid: "x" });
rec("réseau inexistant refusé", !unknown.success, unknown.error?.message);
console.log(`\n${results.filter(Boolean).length}/${results.length} OK`);
await ha.close();
