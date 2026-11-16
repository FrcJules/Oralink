// Petit client HA (login flow + WebSocket). Identifiants via variables d'env.
export async function haConnect(HA = "http://192.168.1.134:8123") {
  const CID = HA + "/";
  const post = async (p, b, form) => (await fetch(HA + p, { method: "POST",
    headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form ? new URLSearchParams(b) : JSON.stringify(b) })).text().then(t => t ? JSON.parse(t) : {});
  const flow = await post("/auth/login_flow", { client_id: CID, handler: ["homeassistant", null], redirect_uri: CID });
  const res = await post(`/auth/login_flow/${flow.flow_id}`, { client_id: CID, username: process.env.HA_USER, password: process.env.HA_PASS });
  const tok = await post("/auth/token", { grant_type: "authorization_code", code: res.result, client_id: CID }, true);
  const ws = new WebSocket(HA.replace("http", "ws") + "/api/websocket");
  let id = 1; const pending = {};
  await new Promise((ok, ko) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: tok.access_token }));
      else if (m.type === "auth_ok") ok();
      else if (m.type === "auth_invalid") ko(new Error("auth_invalid"));
      else if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    };
  });
  const call = (msg, timeout = 90000) => new Promise((ok) => {
    const i = id++; pending[i] = ok; ws.send(JSON.stringify({ id: i, ...msg }));
    setTimeout(() => { if (pending[i]) { delete pending[i]; ok({ success: false, error: { code: "timeout" } }); } }, timeout);
  });
  const close = async () => { await post("/auth/revoke", { token: tok.refresh_token }, true); ws.close(); };
  return { call, close };
}
