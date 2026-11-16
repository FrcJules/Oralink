import { createRequire } from "node:module";
const require = createRequire("/home/appuser/.npm/_npx/e41f203b7505f1fb/node_modules/");
const { chromium } = require("playwright-core");
const HA = "http://192.168.1.134:8123", CID = HA + "/";
const post = async (p, b, form) => { const r = await fetch(HA + p, { method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
  body: form ? new URLSearchParams(b) : JSON.stringify(b) }); const t = await r.text(); return t ? JSON.parse(t) : {}; };
const flow = await post("/auth/login_flow", { client_id: CID, handler: ["homeassistant", null], redirect_uri: CID });
const res = await post(`/auth/login_flow/${flow.flow_id}`, { client_id: CID, username: process.env.HA_USER, password: process.env.HA_PASS });
const tok = await post("/auth/token", { grant_type: "authorization_code", code: res.result, client_id: CID }, true);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(([t, url, cid]) => localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: url, clientId: cid, expires: Date.now() + t.expires_in * 1000 })), [tok, HA, CID]);
await page.goto(HA + "/reseau-oralink/reseau", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(8000);
const report = await page.evaluate(() => {
  const all = []; const walk = (root) => { for (const n of root.querySelectorAll("*")) { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); } }; walk(document);
  const errs = all.filter((n) => n.tagName === "HUI-ERROR-CARD" || n.tagName === "HUI-WARNING");
  return { cards: all.filter((n) => /^HUI-.*-CARD$/.test(n.tagName)).length, errors: errs.map((e) => (e.shadowRoot?.textContent || e.textContent).trim().slice(0, 120)) };
});
console.log("cartes rendues:", report.cards, "| cartes en erreur:", report.errors.length, report.errors);
await page.screenshot({ path: "dash_reseau.png", fullPage: false });
console.log("erreurs JS:", errors.length ? errors : "aucune");
await browser.close();
await post("/auth/revoke", { token: tok.refresh_token }, true);
