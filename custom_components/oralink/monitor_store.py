"""Historiques de surveillance, dans `.storage/oralink_monitor_<entry_id>`.

- `speedtests` : résultats des tests de débit d'Oralink (365 au plus) ;
- `fiber` : un relevé par heure de la fibre (rx/tx en dBm, température),
  30 jours ;
- `fiber_level` : dernier niveau signalé (ok/warn/bad), pour n'alerter qu'au
  changement ;
- `sessions` : périodes de connexion par MAC (`[début, fin|None]`, ISO UTC),
  14 jours — frise de présence et détection des connexions instables.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1
MAX_SPEEDTESTS = 365
MAX_FIBER = 30 * 24
SESSION_DAYS = 14
MAX_SESSIONS_PER_DEVICE = 400


class MonitorStore:
    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_monitor_{entry_id}"
        )
        self.speedtests: list[dict[str, Any]] = []
        self.fiber: list[dict[str, Any]] = []
        self.fiber_level: str = "ok"
        self.sessions: dict[str, list[list[str | None]]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load()
        data = data if isinstance(data, dict) else {}
        self.speedtests = list(data.get("speedtests") or [])[-MAX_SPEEDTESTS:]
        self.fiber = list(data.get("fiber") or [])[-MAX_FIBER:]
        self.fiber_level = data.get("fiber_level") or "ok"
        self.sessions = data.get("sessions") or {}

    def async_schedule_save(self, delay: float = 60) -> None:
        self._store.async_delay_save(self._data_to_save, delay)

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "speedtests": self.speedtests[-MAX_SPEEDTESTS:],
            "fiber": self.fiber[-MAX_FIBER:],
            "fiber_level": self.fiber_level,
            "sessions": self.sessions,
        }

    # ── Sessions de présence ─────────────────────────────────────────────────

    def update_sessions(self, active: set[str], now: datetime, first: bool,
                        last_seen: dict[str, str]) -> bool:
        """Ouvre/ferme les sessions selon les MAC actives. True si modifié.

        `first` : premier cycle depuis le démarrage — une session restée
        ouverte pour un appareil désormais absent est close à sa dernière
        présence connue (`last_seen`), pas à l'heure du redémarrage.
        """
        iso = now.isoformat()
        changed = False
        for mac in active:
            sessions = self.sessions.setdefault(mac, [])
            if not sessions or sessions[-1][1] is not None:
                sessions.append([iso, None])
                changed = True
        for mac, sessions in self.sessions.items():
            if mac in active or not sessions or sessions[-1][1] is not None:
                continue
            end = last_seen.get(mac) if first else None
            sessions[-1][1] = max(end or iso, sessions[-1][0]) if first else iso
            changed = True
        if changed:
            self._prune(now)
        return changed

    def _prune(self, now: datetime) -> None:
        cutoff = (now - timedelta(days=SESSION_DAYS)).isoformat()
        for mac in list(self.sessions):
            kept = [s for s in self.sessions[mac] if s[1] is None or s[1] >= cutoff]
            if kept:
                self.sessions[mac] = kept[-MAX_SESSIONS_PER_DEVICE:]
            else:
                del self.sessions[mac]

    def disconnects_since(self, since: datetime) -> dict[str, int]:
        cutoff = since.isoformat()
        return {
            mac: n for mac, sessions in self.sessions.items()
            if (n := sum(1 for s in sessions if s[1] is not None and s[1] >= cutoff))
        }
