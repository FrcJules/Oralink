"""Tests de la résolution « appareil visé par une règle » (presence_utils)."""

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "presence_utils",
    Path(__file__).resolve().parents[1] / "custom_components/oralink/presence_utils.py",
)
pu = importlib.util.module_from_spec(spec)
sys.modules["presence_utils"] = pu  # requis par @dataclass
spec.loader.exec_module(pu)

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)

# Formes réelles de Devices:get (Livebox 6) : un appareil déconnecté perd son
# IPAddress, ses anciennes adresses restent parfois en « not reachable ».
SERVER = {"Active": True, "Name": "Serveur", "IPAddress": "192.168.1.20",
          "IPv4Address": [{"Address": "192.168.1.20", "Status": "reachable"}],
          "IPv6Address": [{"Address": "2a01:db8::20", "Status": "reachable", "Scope": "global"},
                          {"Address": "2a01:db8::99", "Status": "not reachable", "Scope": "global"}]}
OLD_PC = {"Active": False, "Name": "Vieux PC", "IPAddress": "",
          "LastConnection": "2026-10-01T08:00:00Z", "LastChanged": "2026-09-01T00:00:00Z",
          "IPv4Address": [{"Address": "192.168.1.30", "Status": "not reachable"}]}
GONE_NO_IP = {"Active": False, "Name": "Console", "IPAddress": "", "LastConnection": "2026-11-18T12:00:00Z",
              "LastChanged": "2026-11-20T12:00:00Z"}


def index(seen=None):
    return pu.PresenceIndex(
        {"AA:AA:AA:AA:AA:01": SERVER}, {"AA:AA:AA:AA:AA:02": OLD_PC, "AA:AA:AA:AA:AA:03": GONE_NO_IP},
        seen or {}, NOW,
    )


def test_online_by_ipv4_and_ipv6():
    idx = index()
    assert idx.by_ip("192.168.1.20")["state"] == "online"
    assert idx.by_ip("2A01:DB8::20")["name"] == "Serveur"


def test_offline_from_box_history():
    r = index().by_ip("192.168.1.30")
    assert r["state"] == "offline" and r["name"] == "Vieux PC"
    assert r["offline_days"] == 56.17


def test_seen_record_gives_ip_the_box_forgot():
    seen = {"AA:AA:AA:AA:AA:03": {"name": "Console", "last_seen": "2026-11-24T12:00:00+00:00",
                                  "ip": "192.168.1.40", "ipv6": []}}
    r = index(seen).by_ip("192.168.1.40")
    # Oralink l'a vue plus tard que son LastConnection box : on garde le plus récent.
    assert r["state"] == "offline" and r["offline_days"] == 2.0


def test_moved_when_last_holder_is_online_elsewhere():
    r = index().by_ip("2a01:db8::99")
    assert r["state"] == "moved" and r["current_ip"] == "192.168.1.20"


def test_unknown_and_empty():
    idx = index()
    assert idx.by_ip("192.168.1.250")["state"] == "unknown"
    assert idx.by_ip("") is None and idx.by_ip("0.0.0.0") is None


def test_by_mac():
    idx = index()
    assert idx.by_mac("aa:aa:aa:aa:aa:01")["state"] == "online"
    assert idx.by_mac("AA:AA:AA:AA:AA:03")["offline_days"] == 6.0
    assert idx.by_mac("FF:FF:FF:FF:FF:FF")["state"] == "unknown"


def test_seen_record_keeps_previous_ipv6():
    rec = pu.seen_record(SERVER, {"ipv6": ["2a01:db8::1"], "ip": "x"}, "t")
    assert rec["ip"] == "192.168.1.20"
    assert rec["ipv6"] == ["2a01:db8::20", "2a01:db8::1"]
    assert rec["last_seen"] == "t"
