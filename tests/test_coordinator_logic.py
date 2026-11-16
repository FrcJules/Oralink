"""Tests unitaires de la logique pure du coordinator (sans Home Assistant).

Les modules homeassistant/aiosysbus sont remplacés par des stubs minimaux :
on teste uniquement la détection d'événements et le calcul du débit WAN.
Lancer : python3 -m pytest tests/ -q
"""

from __future__ import annotations

import asyncio
import importlib
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

TZ = timezone(timedelta(hours=1))


def _install_stubs() -> None:
    def mod(name: str, **attrs):
        m = types.ModuleType(name)
        m.__dict__.update(attrs)
        sys.modules[name] = m
        return m

    class _Coordinator:
        def __init__(self, hass, *a, **kw):
            self.hass = hass
            self.data = None

    class _Store:
        def __init__(self, *a, **kw):
            self.saved = None

        async def async_load(self):
            return None

        def async_delay_save(self, fn, delay):
            self.saved = fn()

        async def async_save(self, data):
            self.saved = data

    for name in ["homeassistant", "homeassistant.helpers", "homeassistant.components"]:
        mod(name)
    mod("aiosysbus", AIOSysbus=object)
    mod("aiosysbus.exceptions", AiosysbusException=Exception)
    mod("homeassistant.config_entries", ConfigEntry=object)
    mod("homeassistant.const", CONF_HOST="host", CONF_PASSWORD="password",
        CONF_PORT="port", CONF_USERNAME="username")
    mod("homeassistant.core", HomeAssistant=object, callback=lambda f: f)
    mod("homeassistant.helpers.aiohttp_client", async_create_clientsession=None)
    mod("homeassistant.helpers.dispatcher", async_dispatcher_send=lambda *a: None)
    mod("homeassistant.helpers.update_coordinator",
        DataUpdateCoordinator=_Coordinator, UpdateFailed=Exception)
    mod("homeassistant.helpers.storage", Store=_Store)
    mod("homeassistant.helpers.device_registry",
        async_get=lambda hass: None, async_entries_for_config_entry=lambda r, e: [])
    sys.modules["homeassistant.helpers"].device_registry = sys.modules[
        "homeassistant.helpers.device_registry"]
    mod("homeassistant.util")
    mod("homeassistant.util.dt", DEFAULT_TIME_ZONE=TZ, UTC=timezone.utc)

    # Paquet de l'intégration chargé sans exécuter son __init__.py (qui
    # importe le frontend HA) : on crée le paquet à la main.
    root = Path(__file__).resolve().parents[1] / "custom_components"
    pkg = types.ModuleType("custom_components")
    pkg.__path__ = [str(root)]
    sys.modules["custom_components"] = pkg
    sub = types.ModuleType("custom_components.oralink")
    sub.__path__ = [str(root / "oralink")]
    sys.modules["custom_components.oralink"] = sub


_install_stubs()
coord_mod = importlib.import_module("custom_components.oralink.coordinator")


@pytest.fixture
def coordinator():
    hass = MagicMock()
    entry = MagicMock()
    entry.entry_id = "entry1"
    c = coord_mod.LiveboxDataUpdateCoordinator(hass, entry)
    return c


def dev(active: bool, name: str = "x", ip: str = "1.2.3.4") -> dict:
    return {"Active": active, "Name": name, "IPAddress": ip}


def events(c):
    return [(e["mac"], e["event"]) for e in c.event_log]


def test_bootstrap_does_not_report_new(coordinator):
    coordinator._record_device_events({}, {"AA": dev(True)})
    assert events(coordinator) == []
    assert "AA" in coordinator.event_log_store.known


def test_active_only_mode_disconnect_and_reconnect(coordinator):
    c = coordinator
    c._record_device_events({}, {"AA": dev(True, "Phone"), "BB": dev(True)})
    # Mode « Active only » : AA disparaît de la liste quand il se déconnecte
    c._record_device_events({"AA": dev(True, "Phone"), "BB": dev(True)}, {"BB": dev(True)})
    assert events(c) == [("AA", "disconnected")]
    assert c.event_log[0]["name"] == "Phone"
    # … puis réapparaît
    c._record_device_events({"BB": dev(True)}, {"AA": dev(True, "Phone"), "BB": dev(True)})
    assert events(c)[0] == ("AA", "connected")
    assert len(c.event_log) == 2


def test_all_mode_active_flag_transition(coordinator):
    c = coordinator
    c._record_device_events({}, {"AA": dev(True)})
    c._record_device_events({"AA": dev(True)}, {"AA": dev(False)})
    assert events(c) == [("AA", "disconnected")]


def test_new_device_reported_and_bus_event_fired(coordinator):
    c = coordinator
    c._record_device_events({}, {"AA": dev(True)})
    c._record_device_events({"AA": dev(True)}, {"AA": dev(True), "CC": dev(True, "Inconnu")})
    assert set(events(c)) == {("CC", "new"), ("CC", "connected")}
    fired = [call.args for call in c.hass.bus.async_fire.call_args_list]
    assert {f[1]["event"] for f in fired} == {"new", "connected"}
    assert all(f[0] == "oralink_device_event" for f in fired)
    assert all(f[1]["entry_id"] == "entry1" for f in fired)


def test_empty_fetch_is_not_mass_disconnect(coordinator):
    c = coordinator
    c._record_device_events({}, {"AA": dev(True)})
    c._record_device_events({"AA": dev(True)}, {})
    assert events(c) == []


def test_restart_uses_persisted_active_set(coordinator):
    c = coordinator
    c.event_log_store.known = {"AA": {}, "BB": {}}
    c.event_log_store.active = {"AA", "BB"}
    # Premier poll après redémarrage : previous_devices vide, BB parti pendant l'arrêt
    c._record_device_events({}, {"AA": dev(True)})
    assert events(c) == [("BB", "disconnected")]


def test_elapsed_seconds():
    now = datetime(2026, 11, 16, 12, 0, tzinfo=TZ)
    assert coord_mod._elapsed_seconds(str(now - timedelta(seconds=90)), now) == 90
    assert coord_mod._elapsed_seconds(None, now) is None
    assert coord_mod._elapsed_seconds("garbage", now) is None


def _point(t: datetime, rx: int, tx: int) -> dict:
    return {"time": str(t), "wan_rx_bytes": rx, "wan_tx_bytes": tx}


def test_wan_rate_uses_real_elapsed_time(coordinator, monkeypatch):
    c = coordinator
    now = datetime.now(tz=TZ)
    # 120 s écoulées, 15 Mo reçus → 1 Mbit/s (et non 2 avec un intervalle supposé de 60 s)
    c._traffic_history.append(_point(now - timedelta(seconds=120), 0, 0))
    asyncio.run(c._record_traffic_history({}, {"BytesReceived": 15_000_000, "BytesSent": 0}))
    assert c.traffic_history[-1]["wan_rate_rx"] == pytest.approx(1.0, rel=0.02)


def test_wan_rate_ignores_large_gap_after_restart(coordinator):
    c = coordinator
    now = datetime.now(tz=TZ)
    c._traffic_history.append(_point(now - timedelta(hours=3), 0, 0))
    asyncio.run(c._record_traffic_history({}, {"BytesReceived": 10**10, "BytesSent": 10**9}))
    assert c.traffic_history[-1]["wan_rate_rx"] == 0.0
    assert c.traffic_history[-1]["wan_rate_tx"] == 0.0


def test_devices_schedules_concurrent(coordinator):
    c = coordinator

    async def fake(key):
        await asyncio.sleep(0)
        return {"key": key}

    c.async_get_device_schedule = fake
    result = asyncio.run(c.async_get_devices_schedules({"A": {}, "B": {}, "C": {}}))
    assert result == {"A": {"key": "A"}, "B": {"key": "B"}, "C": {"key": "C"}}


def test_payload_status_or_data():
    assert coord_mod._payload({"status": {"a": 1}}) == {"a": 1}
    assert coord_mod._payload({"status": None, "data": {"IPTVStatus": "Available"}}) == {"IPTVStatus": "Available"}
    assert coord_mod._payload({"status": False}) is False
    assert coord_mod._payload(None) is None


def test_connection_extra_survives_missing_object(coordinator):
    """DSLITE absent (Livebox 6) ne doit pas faire perdre VLAN/MTU."""
    async def post(obj, fn, conf=None):
        if obj == "NMC.ServiceEligibility.DSLITE":
            raise RuntimeError("Object or parameter not found")
        if conf == {"name": "VLANID"}:
            return {"status": 832}
        if conf == {"name": "MTU"}:
            return {"status": 1500}
        return {"status": ""}

    coordinator.api = MagicMock()
    coordinator.api._auth.post = post
    extra = asyncio.run(coordinator.async_get_connection_extra())
    assert extra["vlan_id"] == 832 and extra["mtu"] == 1500
    assert extra["error_code"] is None


def test_iptv_reads_data_payload(coordinator):
    async def post(obj, fn, conf=None):
        return {
            "getIPTVStatus": {"status": None, "data": {"IPTVStatus": "Available"}},
            "getIPTVMultiScreens": {"status": None, "data": {"Enable": False}},
            "getIPTVConfig": {"status": [{"ChannelType": "VLAN", "ChannelNumber": "840"}]},
        }[fn]

    coordinator.api = MagicMock()
    coordinator.api._auth.post = post
    iptv = asyncio.run(coordinator.async_get_iptv_status())
    assert iptv["status"] == "Available"
    assert iptv["multi_screens"] is False
    assert iptv["config"]["channels"][0]["ChannelNumber"] == "840"


def test_speedtest_kbit_to_mbit(coordinator):
    async def post(obj, fn, conf=None):
        return {"status": {"status": "Completed",
                           "Downstream": {"rate": 1998148, "latency": 8, "end": "2026-10-28T12:57:24Z"},
                           "Upstream": {"rate": 777179, "latency": 9, "end": "2026-10-28T12:57:27Z"}}}

    coordinator.api = MagicMock()
    coordinator.api._auth.post = post
    st = asyncio.run(coordinator.async_get_speedtest())
    assert st["downstream"]["rate_mbit"] == 1998.15
    assert st["upstream"]["rate_mbit"] == 777.18
    assert st["downstream"]["latency_ms"] == 8


def test_speedtest_missing_object(coordinator):
    async def post(obj, fn, conf=None):
        raise RuntimeError("Object or parameter not found")

    coordinator.api = MagicMock()
    coordinator.api._auth.post = post
    assert asyncio.run(coordinator.async_get_speedtest()) == {}
