import { createRequire } from "node:module";
const require = createRequire("/home/appuser/.npm/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright-core");
const HA = "http://192.168.1.134:8123", CID = HA + "/";
const post = async (p, b, form) => { const r = await fetch(HA + p, { method: "POST",
  headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
  body: form ? new URLSearchParams(b) : JSON.stringify(b) }); const t = await r.text(); return t ? JSON.parse(t) : {}; };
const flow = await post("/auth/login_flow", { client_id: CID, handler: ["homeassistant", null], redirect_uri: CID });
const res = await post(`/auth/login_flow/${flow.flow_id}`, { client_id: CID, username: process.env.HA_USER, password: process.env.HA_PASS });
const tok = await post("/auth/token", { grant_type: "authorization_code", code: res.result, client_id: CID }, true);

const exe = process.env.CHROME;
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [], requests = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.url().includes("livebox_panel")) requests.push(`${r.status()} ${r.url().replace(HA, "")}`); });
await page.addInitScript(([t, url, cid]) => {
  localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: url, clientId: cid, expires: Date.now() + t.expires_in * 1000 }));
}, [tok, HA, CID]);

const panelText = () => page.evaluate(() => {
  const find = (root) => { // descend dans les shadow roots jusqu'à <livebox-panel>
    const el = root.querySelector("livebox-panel"); if (el) return el;
    for (const n of root.querySelectorAll("*")) if (n.shadowRoot) { const f = find(n.shadowRoot); if (f) return f; }
    return null;
  };
  const p = find(document);
  return p?.shadowRoot ? p.shadowRoot.textContent.replace(/\s+/g, " ").slice(0, 400) : "(panel introuvable)";
});
const clickNav = (label) => page.evaluate((label) => {
  const find = (root) => { const el = root.querySelector("livebox-panel"); if (el) return el;
    for (const n of root.querySelectorAll("*")) if (n.shadowRoot) { const f = find(n.shadowRoot); if (f) return f; } return null; };
  const btn = [...find(document).shadowRoot.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  if (!btn) return false; btn.click(); return true;
}, label);
const hasSvgCount = (sel) => page.evaluate((sel) => {
  const find = (root) => { const el = root.querySelector("livebox-panel"); if (el) return el;
    for (const n of root.querySelectorAll("*")) if (n.shadowRoot) { const f = find(n.shadowRoot); if (f) return f; } return null; };
  return find(document).shadowRoot.querySelectorAll(sel).length;
}, sel);

await page.goto(HA + "/oralink", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(4000);
console.log("Vue d'ensemble :", (await panelText()).slice(0, 200));
for (const [label, sel] of [["Topologie", ".react-flow__node"], ["Graphiques", ".recharts-surface"], ["Appareils", "tbody tr"], ["DHCP & NAT", "table"]]) {
  const ok = await clickNav(label);
  await page.waitForTimeout(5000); await page.screenshot({ path: `tab_${label.replace(/[^a-z]/gi, "")}.png` });
  console.log(`${label.padEnd(12)} clic=${ok} éléments(${sel})=${await hasSvgCount(sel)} | ${(await panelText()).slice(0, 110)}`);
}
await page.screenshot({ path: "panel_topology_check.png" });
console.log("\nRequêtes panel :"); for (const r of [...new Set(requests)]) console.log("  " + r);
console.log("\nErreurs console :", errors.length ? "" : "aucune"); for (const e of errors) console.log("  " + e.slice(0, 200));
await browser.close();
await post("/auth/revoke", { token: tok.refresh_token }, true);
console.log("jeton révoqué");
