"""Présence des appareils visés par une règle (NAT, DMZ, bail statique…).

La Livebox ne fournit aucun compteur d'utilisation par règle (ni sur les
redirections de ports, ni sur le pare-feu ; `Conntrack` répond « Permission
denied » même en admin). On ne peut donc pas dire qu'un port n'a « pas été
appelé » ; en revanche on peut dire si **l'appareil de destination** existe
encore : en ligne, hors ligne depuis N jours, ou inconnu.

Sources combinées (logique pure, testable sans Home Assistant) :

- `current` : appareils renvoyés par la box au dernier rafraîchissement
  (actifs, plus les inactifs en mode « All ») ;
- `offline` : appareils inactifs que la box garde en mémoire (lus
  périodiquement) — `LastConnection`/`LastChanged` donnent une date
  approximative de dernière présence ;
- `seen` : mémoire propre d'Oralink (dernière fois vu actif + dernières IP),
  indispensable car la box efface l'`IPAddress` d'un appareil déconnecté.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

MAX_IPV6_PER_DEVICE = 8


def parse_time(value: Any) -> datetime | None:
    """ISO 8601 (`2026-11-02T15:48:12Z`, `str(datetime)`) → datetime aware."""
    if not value or not isinstance(value, str) or value.startswith("0001-01-01"):
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def _norm_ip(value: Any) -> str:
    return str(value or "").strip().lower()


def device_addresses(device: dict[str, Any]) -> tuple[set[str], set[str], set[str]]:
    """(IPv4 actuelles, IPv6 actuelles, anciennes adresses) d'un appareil box.

    « Actuelle » = `IPAddress` ou entrée `IPv4Address`/`IPv6Address` joignable ;
    les entrées « not reachable » que la box conserve sont des anciennes
    adresses (utiles pour retrouver le dernier occupant d'une IP).
    """
    v4: set[str] = set()
    v6: set[str] = set()
    old: set[str] = set()
    if device.get("IPAddress"):
        v4.add(_norm_ip(device["IPAddress"]))
    for key, target in (("IPv4Address", v4), ("IPv6Address", v6)):
        for addr in device.get(key) or []:
            if not isinstance(addr, dict) or not addr.get("Address"):
                continue
            ip = _norm_ip(addr["Address"])
            if addr.get("Status") in (None, "", "reachable") and device.get("Active"):
                target.add(ip)
            else:
                old.add(ip)
    return v4, v6, old - v4 - v6


def seen_record(device: dict[str, Any], previous: dict[str, Any] | None, now: str) -> dict[str, Any]:
    """Met à jour l'entrée « vu pour la dernière fois » d'un appareil actif."""
    v4, v6, _ = device_addresses(device)
    ipv6 = [ip for ip in sorted(v6) if not ip.startswith("fe80:")]
    for ip in (previous or {}).get("ipv6", []):
        if ip not in ipv6:
            ipv6.append(ip)
    return {
        "name": device.get("Name") or (previous or {}).get("name") or "",
        "last_seen": now,
        "ip": _norm_ip(device.get("IPAddress")) or next(iter(sorted(v4)), "")
        or (previous or {}).get("ip", ""),
        "ipv6": ipv6[:MAX_IPV6_PER_DEVICE],
    }


@dataclass
class _Device:
    mac: str
    name: str = ""
    active: bool = False
    last_seen: datetime | None = None
    current_ip: str = ""
    current: set[str] = field(default_factory=set)  # adresses tenues maintenant
    history: set[str] = field(default_factory=set)  # adresses déjà tenues


class PresenceIndex:
    """Résout une IP (v4/v6) ou une MAC vers l'état de l'appareil visé."""

    def __init__(
        self,
        current: dict[str, Any] | None,
        offline: dict[str, Any] | None,
        seen: dict[str, Any] | None,
        now: datetime,
    ) -> None:
        self._now = now
        self._devices: dict[str, _Device] = {}

        def _get(mac: str) -> _Device:
            key = mac.upper()
            return self._devices.setdefault(key, _Device(mac=key))

        def _bump(dev: _Device, when: datetime | None) -> None:
            if when and (dev.last_seen is None or when > dev.last_seen):
                dev.last_seen = when

        for mac, rec in (seen or {}).items():
            if not isinstance(rec, dict):
                continue
            dev = _get(mac)
            dev.name = rec.get("name") or dev.name
            _bump(dev, parse_time(rec.get("last_seen")))
            if rec.get("ip"):
                dev.history.add(_norm_ip(rec["ip"]))
            dev.history.update(_norm_ip(ip) for ip in rec.get("ipv6") or [])

        # Box : inactifs mémorisés puis appareils courants (priorité au plus frais).
        for source in (offline or {}, current or {}):
            for mac, device in source.items():
                if not isinstance(device, dict):
                    continue
                dev = _get(mac)
                dev.name = device.get("Name") or dev.name
                v4, v6, old = device_addresses(device)
                dev.history |= old
                if device.get("Active"):
                    dev.active = True
                    dev.last_seen = now
                    dev.current = v4 | v6
                    dev.current_ip = _norm_ip(device.get("IPAddress")) or next(iter(sorted(v4)), "")
                else:
                    dev.history |= v4 | v6
                    # LastConnection = heure de *connexion* : seule, elle
                    # surestimerait l'absence. LastChanged bouge aussi à la
                    # déconnexion (et aux redémarrages de la box) : le plus
                    # récent des deux sous-estime plutôt — plus prudent avant
                    # de suggérer de supprimer une règle.
                    _bump(dev, parse_time(device.get("LastConnection")))
                    _bump(dev, parse_time(device.get("LastChanged")))
        for dev in self._devices.values():
            dev.history -= dev.current

    def _result(self, state: str, dev: _Device | None = None) -> dict[str, Any]:
        out: dict[str, Any] = {"state": state, "name": "", "mac": "", "last_seen": None,
                               "offline_days": None, "current_ip": ""}
        if dev is None:
            return out
        out.update(name=dev.name or dev.mac, mac=dev.mac, current_ip=dev.current_ip)
        if dev.last_seen:
            out["last_seen"] = dev.last_seen.isoformat()
            if state == "offline":
                out["offline_days"] = round(
                    max(0.0, (self._now - dev.last_seen).total_seconds()) / 86400, 2
                )
        return out

    def by_mac(self, mac: str | None) -> dict[str, Any]:
        dev = self._devices.get(str(mac or "").upper())
        if dev is None:
            return self._result("unknown")
        return self._result("online" if dev.active else "offline", dev)

    def by_ip(self, ip: str | None) -> dict[str, Any] | None:
        """État de l'appareil à cette IP (None si pas d'IP à résoudre).

        - `online` : un appareil actif tient l'adresse maintenant ;
        - `moved` : son dernier occupant connu est en ligne avec une autre
          adresse (bail DHCP changé, IPv6 temporaire renouvelée) ;
        - `offline` : son dernier occupant est hors ligne ;
        - `unknown` : aucune trace d'un appareil à cette adresse.
        """
        target = _norm_ip(ip)
        if not target or target in ("0.0.0.0", "::"):
            return None
        for dev in self._devices.values():
            if dev.active and target in dev.current:
                return self._result("online", dev)
        holders = [d for d in self._devices.values() if target in d.history]
        if not holders:
            return self._result("unknown")
        epoch = datetime.min.replace(tzinfo=self._now.tzinfo)
        last = max(holders, key=lambda d: d.last_seen or epoch)
        return self._result("moved" if last.active else "offline", last)
