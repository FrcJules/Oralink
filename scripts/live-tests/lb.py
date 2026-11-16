"""Client minimal de l'API sysbus Livebox (identifiants via LB_USER / LB_PASS)."""
import http.cookiejar, json, os, urllib.request

class Livebox:
    def __init__(self, host="192.168.1.1"):
        self.url = f"http://{host}/ws"
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        r = self._post({"service": "sah.Device.Information", "method": "createContext",
                        "parameters": {"applicationName": "webui", "username": os.environ["LB_USER"],
                                       "password": os.environ["LB_PASS"]}},
                       {"Authorization": "X-Sah-Login"})
        self.ctx = r.get("data", {}).get("contextID")
        if not self.ctx:
            raise SystemExit(f"login Livebox refusé: {r}")

    def _post(self, body, extra):
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/x-sah-ws-4-call+json", **extra})
        with self.opener.open(req, timeout=60) as resp:
            return json.loads(resp.read() or b"{}")

    def call(self, service, method, params=None):
        return self._post({"service": service, "method": method, "parameters": params or {}},
                          {"Authorization": f"X-Sah {self.ctx}", "X-Context": self.ctx})

    def logout(self):
        try: self.call("sah.Device.Information", "releaseContext", {"applicationName": "webui"})
        except Exception: pass
