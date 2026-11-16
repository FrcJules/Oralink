"""Tests de la pseudonymisation des MAC dans les diagnostics."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "diagnostics_utils", Path(__file__).resolve().parents[1] / "custom_components/oralink/diagnostics_utils.py"
)
du = importlib.util.module_from_spec(spec)
spec.loader.exec_module(du)


def test_keys_values_and_strings_consistent():
    data = {
        "AA:BB:CC:DD:EE:01": {"Key": "aa:bb:cc:dd:ee:01", "Master": "AA:BB:CC:DD:EE:02"},
        "list": ["via AA-BB-CC-DD-EE-02", 3, None],
        "Devices.Device.AA:BB:CC:DD:EE:01": True,
    }
    out = du.pseudonymize_macs(data)
    assert out == {
        "MAC_001": {"Key": "MAC_001", "Master": "MAC_002"},
        "list": ["via MAC_002", 3, None],
        "Devices.Device.MAC_001": True,
    }


def test_mac_glued_to_underscore():
    assert du.pseudonymize_macs({"x": "_2C:93:FB:BB:55:90_eth0"}) == {"x": "_MAC_001_eth0"}


def test_dhcp_client_id_prefix():
    # ClientID DHCP = type matériel (01) + MAC : la MAC doit être masquée,
    # et pseudonymisée comme la même MAC ailleurs.
    out = du.pseudonymize_macs({"01:2c:93:fb:bb:55:90": {"MACAddress": "2C:93:FB:BB:55:90"}})
    assert out == {"01:MAC_001": {"MACAddress": "MAC_001"}}


def test_non_mac_untouched():
    data = {"ip": "192.168.1.10", "ipv6": "2a01:db8::5", "ipv6b": "fe80::aa:bb:cc:dd:ee:ff:1",
            "time": "12:00:00", "n": 1.5}
    assert du.pseudonymize_macs(data) == data
