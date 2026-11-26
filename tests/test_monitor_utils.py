"""Tests des règles de surveillance (monitor_utils) et des sessions de présence."""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "custom_components/oralink"
spec = importlib.util.spec_from_file_location("monitor_utils", ROOT / "monitor_utils.py")
mu = importlib.util.module_from_spec(spec)
sys.modules["monitor_utils"] = mu
spec.loader.exec_module(mu)

HIST = [{"down": v} for v in (900, 920, 880, 910, 905)]


def test_speed_drop_against_baseline():
    assert mu.speed_baseline(HIST) == 905
    assert mu.speed_drop({"down": 300}, HIST, 0).startswith("300 Mbit/s au lieu")
    assert mu.speed_drop({"down": 700}, HIST, 0) is None
    # Pas assez d'historique : pas d'alerte automatique.
    assert mu.speed_drop({"down": 1}, HIST[:2], 0) is None


def test_speed_drop_fixed_threshold():
    assert mu.speed_drop({"down": 400}, [], 500) is not None
    assert mu.speed_drop({"down": 600}, [], 500) is None


def test_fiber_levels():
    assert mu.fiber_level(None, [])[0] == "unknown"
    assert mu.fiber_level(-19.2, [])[0] == "ok"
    assert mu.fiber_level(-27.5, [])[0] == "warn"
    assert mu.fiber_level(-29, [])[0] == "bad"
    usual = [{"rx": -18.0}] * 30
    level, text = mu.fiber_level(-22.0, usual)
    assert level == "warn" and "Baisse de 4.0 dB" in text
    assert mu.fiber_level(-19.0, usual)[0] == "ok"


def test_wifi_advice():
    devices = {
        "A": {"Active": True, "Name": "Loin", "OperatingFrequencyBand": "5GHz", "SignalStrength": -84},
        "B": {"Active": True, "Name": "Près", "OperatingFrequencyBand": "5GHz", "SignalStrength": -50},
        "C": {"Active": True, "Name": "Filaire", "SignalStrength": -90},
        "D": {"Active": False, "Name": "Off", "OperatingFrequencyBand": "2.4GHz", "SignalStrength": -90},
    }
    advice = mu.wifi_advice(devices, {"B": 8}, has_repeater=True)
    kinds = [(a["mac"], a["kind"], a["level"]) for a in advice]
    assert kinds == [("A", "weak_signal", "bad"), ("B", "unstable", "warn")]
    assert "répéteur" in advice[0]["text"]
