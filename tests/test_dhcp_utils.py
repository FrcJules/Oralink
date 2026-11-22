"""Tests de l'état du serveur DHCP et de l'origine des IP (dhcp_utils)."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "dhcp_utils", Path(__file__).resolve().parents[1] / "custom_components/oralink/dhcp_utils.py"
)
du = importlib.util.module_from_spec(spec)
spec.loader.exec_module(du)

# Forme de DHCPv4.Server:getDHCPServerPool (status), cf. LiveboxMonitor LmInfoTab.
POOL = {
    "default": {
        "Enable": True, "Status": "Enabled", "Server": "192.168.1.1",
        "SubnetMask": "255.255.255.0", "MinAddress": "192.168.1.10",
        "MaxAddress": "192.168.1.150", "LeaseTime": 86400,
    },
    "guest": {"Enable": False, "MinAddress": "192.168.144.2", "MaxAddress": "192.168.144.254"},
}


def test_pool_summary():
    assert du.pool_summary(POOL) == {
        "enabled": True, "status": "Enabled", "server": "192.168.1.1",
        "netmask": "255.255.255.0", "start": "192.168.1.10", "end": "192.168.1.150",
        "lease_time": 86400,
    }
    assert du.pool_summary(POOL, "guest")["enabled"] is False


def test_pool_summary_unknown():
    # Requête en échec (_make_request renvoie {}) : état inconnu, pas « désactivé ».
    assert du.pool_summary({})["enabled"] is None
    assert du.pool_summary(None)["enabled"] is None
    assert du.pool_summary({"default": "oops"})["enabled"] is None


def test_ip_in_range():
    assert du.ip_in_range("192.168.1.10", "192.168.1.10", "192.168.1.150") is True
    assert du.ip_in_range("192.168.1.150", "192.168.1.10", "192.168.1.150") is True
    assert du.ip_in_range("192.168.1.200", "192.168.1.10", "192.168.1.150") is False
    assert du.ip_in_range("192.168.1.9", "192.168.1.10", "192.168.1.150") is False
    assert du.ip_in_range("", "192.168.1.10", "192.168.1.150") is None
    assert du.ip_in_range("192.168.1.20", "", "192.168.1.150") is None
    assert du.ip_in_range("fe80::1", "192.168.1.10", "192.168.1.150") is None
    assert du.ip_in_range("pas une ip", "192.168.1.10", "192.168.1.150") is None


def test_device_ip_source():
    reserved = {"AA:BB:CC:DD:EE:01"}
    dev = lambda src: {"IPAddress": "192.168.1.20", "IPAddressSource": src}
    # Réservation prioritaire, MAC comparée sans casse.
    assert du.device_ip_source("aa:bb:cc:dd:ee:01", dev("DHCP"), reserved) == "reserved"
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", dev("DHCP"), reserved) == "dhcp"
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", dev("Static"), reserved) == "manual"
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", dev("self"), reserved) == ""
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", dev(""), reserved) == ""
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", {}, reserved) == ""
    # Pas d'IP : rien à qualifier, même si la box garde une source.
    assert du.device_ip_source("AA:BB:CC:DD:EE:02", {"IPAddressSource": "DHCP"}, reserved) == ""


def test_manual_ip_conflict():
    pool = du.pool_summary(POOL)
    # IP manuelle dans la plage DHCP : la box peut la distribuer à un autre.
    assert du.manual_ip_in_pool("manual", "192.168.1.20", pool) is True
    assert du.manual_ip_in_pool("manual", "192.168.1.200", pool) is False
    assert du.manual_ip_in_pool("dhcp", "192.168.1.20", pool) is False
    assert du.manual_ip_in_pool("reserved", "192.168.1.20", pool) is False
    # Serveur DHCP coupé : aucun risque de doublon venant de la box.
    off = {**pool, "enabled": False}
    assert du.manual_ip_in_pool("manual", "192.168.1.20", off) is False
