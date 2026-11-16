"""Fusion et sous-échantillonnage des séries de débit (onglet « Graphiques »).

Module sans dépendance Home Assistant (testable seul) : il reçoit les états
des capteurs « Débit ↓ » / « Débit ↑ » d'un appareil, lus dans le recorder de
HA, et produit les points `{time, rate_rx, rate_tx}` attendus par le panel.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

Series = Iterable[tuple[datetime, float | None]]


def merge_rate_series(rx: Series, tx: Series) -> list[dict]:
    """Fusionne deux séries horodatées en points communs.

    À chaque horodatage présent dans l'une ou l'autre série, on reporte la
    dernière valeur connue de l'autre (les deux capteurs ne changent pas
    forcément d'état au même instant).
    """
    events: list[tuple[datetime, str, float | None]] = [
        (when, "rx", value) for when, value in rx
    ] + [(when, "tx", value) for when, value in tx]
    events.sort(key=lambda e: e[0])

    points: list[dict] = []
    last = {"rx": None, "tx": None}
    for when, key, value in events:
        last[key] = value
        point = {"time": when.isoformat(), "rate_rx": last["rx"], "rate_tx": last["tx"]}
        if points and points[-1]["time"] == point["time"]:
            points[-1] = point
        else:
            points.append(point)
    return points


def downsample(points: list[dict], max_points: int) -> list[dict]:
    """Réduit à `max_points` en moyennant des paquets consécutifs (pic conservé à part)."""
    if max_points <= 0 or len(points) <= max_points:
        return points
    size = -(-len(points) // max_points)  # division entière arrondie au-dessus
    result = []
    for start in range(0, len(points), size):
        chunk = points[start:start + size]
        out = {"time": chunk[-1]["time"]}
        for key in ("rate_rx", "rate_tx"):
            values = [p[key] for p in chunk if isinstance(p.get(key), (int, float))]
            out[key] = round(sum(values) / len(values), 3) if values else None
            out[f"{key}_max"] = max(values) if values else None
        result.append(out)
    return result


def parse_float(state: str | None) -> float | None:
    """État HA → float (None pour unknown/unavailable/vide)."""
    try:
        return float(state)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
