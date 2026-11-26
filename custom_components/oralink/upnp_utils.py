"""Détection des redirections ouvertes/fermées par UPnP (logique pure)."""

from __future__ import annotations

from typing import Any

PROTOCOL_NAMES = {"6": "TCP", "17": "UDP", "6,17": "TCP/UDP"}


def upnp_rule_key(rule: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(rule.get("id", "")),
        str(rule.get("external_port", "")),
        str(rule.get("protocol", "")),
        str(rule.get("destination_ip", "")),
    )


def is_upnp_rule(rule: dict[str, Any]) -> bool:
    """Règle créée automatiquement (UPnP), par opposition aux règles manuelles."""
    return not str(rule.get("id", "")).startswith("webui_")


def diff_upnp(
    previous: list[dict[str, Any]], current: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(règles UPnP apparues, règles UPnP disparues) entre deux lectures."""
    before = {upnp_rule_key(r): r for r in previous if is_upnp_rule(r)}
    after = {upnp_rule_key(r): r for r in current if is_upnp_rule(r)}
    opened = [r for k, r in after.items() if k not in before]
    closed = [r for k, r in before.items() if k not in after]
    return opened, closed
