"""Règles de surveillance (débit, fibre, Wi-Fi) — logique pure, testable."""

from __future__ import annotations

import statistics
from typing import Any

# Débit : chute = moins de DROP_RATIO × la médiane des derniers tests.
DROP_RATIO = 0.5
BASELINE_RUNS = 7
MIN_BASELINE = 3

# Fibre GPON (classe B+) : sensibilité du récepteur vers -28 dBm. Au-delà de
# -27 dBm la marge devient faible ; une baisse de 3 dB par rapport à
# l'habitude signale une dégradation (connecteur sale, fibre pliée…).
FIBER_WARN_DBM = -27.0
FIBER_BAD_DBM = -28.0
FIBER_DRIFT_DB = 3.0

# Wi-Fi : en dessous de -75 dBm la connexion devient lente et instable.
WEAK_SIGNAL_DBM = -75
UNSTABLE_DISCONNECTS_24H = 6


def speed_baseline(history: list[dict[str, Any]], key: str = "down") -> float | None:
    """Médiane des BASELINE_RUNS derniers tests réussis (None si trop peu)."""
    values = [h[key] for h in history[-BASELINE_RUNS:] if isinstance(h.get(key), (int, float))]
    return statistics.median(values) if len(values) >= MIN_BASELINE else None


def speed_drop(result: dict[str, Any], history: list[dict[str, Any]], min_down: float) -> str | None:
    """Raison de l'alerte si le débit descendant est anormalement bas, sinon None.

    `history` = tests précédents (sans `result`). `min_down` > 0 : seuil fixe
    choisi par l'utilisateur ; sinon comparaison avec la médiane habituelle.
    """
    down = result.get("down")
    if not isinstance(down, (int, float)):
        return None
    if min_down > 0:
        if down < min_down:
            return f"{down:g} Mbit/s, sous le seuil de {min_down:g} Mbit/s"
        return None
    baseline = speed_baseline(history)
    if baseline and down < DROP_RATIO * baseline:
        return f"{down:g} Mbit/s au lieu d'environ {baseline:g} Mbit/s habituellement"
    return None


def fiber_level(rx_dbm: float | None, history: list[dict[str, Any]]) -> tuple[str, str]:
    """(niveau ok|warn|bad|unknown, explication) pour la puissance reçue."""
    if not isinstance(rx_dbm, (int, float)) or rx_dbm == 0:
        return "unknown", "Puissance optique indisponible"
    if rx_dbm <= FIBER_BAD_DBM:
        return "bad", f"Signal très faible ({rx_dbm:g} dBm) : coupures probables"
    if rx_dbm <= FIBER_WARN_DBM:
        return "warn", f"Signal faible ({rx_dbm:g} dBm) : marge réduite"
    past = [h["rx"] for h in history if isinstance(h.get("rx"), (int, float)) and h["rx"] != 0]
    if len(past) >= 24:
        usual = statistics.median(past)
        if rx_dbm <= usual - FIBER_DRIFT_DB:
            return "warn", (f"Baisse de {usual - rx_dbm:.1f} dB par rapport à l'habitude "
                            f"({usual:g} dBm) : connecteur ou fibre à vérifier")
    return "ok", f"Signal correct ({rx_dbm:g} dBm)"


def wifi_advice(
    devices: dict[str, Any], disconnects_24h: dict[str, int], has_repeater: bool
) -> list[dict[str, Any]]:
    """Conseils par appareil Wi-Fi actif : signal faible, connexions instables."""
    advice = []
    for mac, d in devices.items():
        if not d.get("Active") or not d.get("OperatingFrequencyBand"):
            continue
        name = d.get("Name") or mac
        signal = d.get("SignalStrength")
        drops = disconnects_24h.get(mac, 0)
        if isinstance(signal, (int, float)) and signal and signal <= WEAK_SIGNAL_DBM:
            tip = ("rapprocher l'appareil d'un répéteur, ou ajouter un répéteur dans cette pièce"
                   if has_repeater else
                   "rapprocher l'appareil de la box, ou ajouter un répéteur Wi-Fi")
            advice.append({"mac": mac, "name": name, "kind": "weak_signal",
                           "level": "bad" if signal <= WEAK_SIGNAL_DBM - 7 else "warn",
                           "signal": signal, "band": d.get("OperatingFrequencyBand"),
                           "text": f"Signal faible ({signal} dBm) : {tip}."})
        if drops >= UNSTABLE_DISCONNECTS_24H:
            advice.append({"mac": mac, "name": name, "kind": "unstable", "level": "warn",
                           "drops": drops,
                           "text": f"{drops} déconnexions en 24 h : connexion instable "
                                   "(portée, interférences ou mise en veille agressive)."})
    advice.sort(key=lambda a: (a["level"] != "bad", a["name"].lower()))
    return advice
