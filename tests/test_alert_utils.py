"""Tests des briques pures des alertes : diff UPnP et messages ntfy."""

import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "custom_components/oralink"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


uu = _load("upnp_utils")
if "aiohttp" not in sys.modules:  # ntfy.py n'a besoin que de ClientTimeout/ClientError ici
    sys.modules["aiohttp"] = types.SimpleNamespace(
        ClientTimeout=lambda **kw: None, ClientError=Exception, ClientSession=object)
nt = _load("ntfy")


def rule(rid, port, ip="192.168.1.20", proto="6"):
    return {"id": rid, "external_port": port, "protocol": proto, "destination_ip": ip}


def test_diff_ignores_manual_rules_and_detects_changes():
    before = [rule("webui_ssh", "22"), rule("upnp_a", "50000")]
    after = [rule("webui_ssh", "22"), rule("webui_new", "80"), rule("upnp_b", "40000")]
    opened, closed = uu.diff_upnp(before, after)
    assert [r["id"] for r in opened] == ["upnp_b"]
    assert [r["id"] for r in closed] == ["upnp_a"]


def test_diff_same_id_new_port_counts_as_new():
    opened, closed = uu.diff_upnp([rule("upnp_a", "1")], [rule("upnp_a", "2")])
    assert len(opened) == 1 and len(closed) == 1


def test_build_message_limits_actions():
    body = nt.build_message("t", "Titre", "Msg", tags=["x"], click="https://h/oralink",
                            actions=[nt.view_action(str(i), "u") for i in range(5)])
    assert body["topic"] == "t" and body["click"] == "https://h/oralink"
    assert len(body["actions"]) == 3
    assert "actions" not in nt.build_message("t", "a", "b")


def test_http_action_shape():
    action = nt.http_action("Couper Internet", "https://h/api/webhook/w", '{"token": "x"}')
    assert action["method"] == "POST" and action["clear"] is True
    assert action["headers"]["Content-Type"] == "application/json"
