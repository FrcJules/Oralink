"""Tests de la fusion / du sous-échantillonnage des séries de débit."""

from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "history_utils", Path(__file__).resolve().parents[1] / "custom_components/oralink/history_utils.py"
)
hu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hu)

T0 = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


def at(minutes):
    return T0 + timedelta(minutes=minutes)


def test_merge_carries_last_value_of_other_series():
    rx = [(at(0), 1.0), (at(2), 3.0)]
    tx = [(at(1), 0.5)]
    pts = hu.merge_rate_series(rx, tx)
    assert [(p["rate_rx"], p["rate_tx"]) for p in pts] == [(1.0, None), (1.0, 0.5), (3.0, 0.5)]


def test_merge_same_timestamp_single_point():
    pts = hu.merge_rate_series([(at(0), 2.0)], [(at(0), 1.0)])
    assert pts == [{"time": at(0).isoformat(), "rate_rx": 2.0, "rate_tx": 1.0}]


def test_downsample_averages_and_keeps_peak():
    pts = [{"time": at(i).isoformat(), "rate_rx": float(i), "rate_tx": None} for i in range(10)]
    out = hu.downsample(pts, 5)
    assert len(out) == 5
    assert out[0]["rate_rx"] == 0.5 and out[0]["rate_rx_max"] == 1.0
    assert out[0]["rate_tx"] is None
    assert hu.downsample(pts, 20) is pts


def test_parse_float():
    assert hu.parse_float("1.5") == 1.5
    assert hu.parse_float("unknown") is None
    assert hu.parse_float(None) is None
