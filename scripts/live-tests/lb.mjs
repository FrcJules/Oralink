// Client minimal sysbus Livebox (LB_USER / LB_PASS)
export async function lbConnect(host = "192.168.1.1") {
  const url = `http://${host}/ws`;
  let cookie = "";
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-sah-ws-4-call+json", Authorization: "X-Sah-Login" },
    body: JSON.stringify({ service: "sah.Device.Information", method: "createContext",
      parameters: { applicationName: "webui", username: process.env.LB_USER, password: process.env.LB_PASS } }) });
  cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  const ctx = (await r.json()).data?.contextID;
  if (!ctx) throw new Error("login Livebox refusé");
  const call = async (service, method, parameters = {}) => (await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/x-sah-ws-4-call+json", Authorization: `X-Sah ${ctx}`, "X-Context": ctx, Cookie: cookie },
    body: JSON.stringify({ service, method, parameters }) })).json();
  return { call };
}
