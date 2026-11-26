"""Groupes d'appareils et pause Internet minutée.

Un groupe = un nom + des MAC. « Pause » coupe l'accès Internet de chaque
appareil du groupe (planificateur ToD de la box, comme le bouton
« Couper Internet » d'un appareil) jusqu'à une heure donnée ou jusqu'à
reprise manuelle. La box n'a pas d'expiration sur ce blocage : la reprise
est programmée côté HA (`async_track_point_in_utc_time`) et reprogrammée au
démarrage ; une pause échue pendant un arrêt de HA est levée au démarrage.

Seuls les appareils que la pause a réellement coupés sont rétablis à la
fin : un appareil déjà bloqué à la main avant la pause le reste.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

if TYPE_CHECKING:
    from .coordinator import LiveboxDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)


class GroupManager:
    """Groupes (persistés dans SettingsStore) et minuteries de pause."""

    def __init__(self, hass: HomeAssistant, coordinator: LiveboxDataUpdateCoordinator) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.settings = coordinator.settings_store
        self._timers: dict[str, Callable[[], None]] = {}

    # ── Groupes ──────────────────────────────────────────────────────────────

    def save_group(self, group_id: str | None, name: str, macs: list[str]) -> str:
        group_id = group_id or secrets.token_hex(4)
        self.settings.groups[group_id] = {
            "name": name.strip(),
            "macs": sorted({m.upper() for m in macs if m}),
        }
        self.settings.async_schedule_save()
        return group_id

    async def async_delete_group(self, group_id: str) -> None:
        if group_id in self.settings.pauses:
            await self.async_resume(group_id, notify=False)
        self.settings.groups.pop(group_id, None)
        self.settings.async_schedule_save()

    def pause_info(self, group_id: str) -> dict[str, Any] | None:
        pause = self.settings.pauses.get(group_id)
        return pause if isinstance(pause, dict) else None

    # ── Pause / reprise ──────────────────────────────────────────────────────

    async def async_pause(self, group_id: str, minutes: int | None) -> dict[str, Any]:
        group = self.settings.groups.get(group_id)
        if group is None:
            raise ValueError("groupe inconnu")
        previous = self.pause_info(group_id) or {}
        already_ours = set(previous.get("macs", []))
        blocked_by_us: list[str] = sorted(already_ours)
        errors: list[str] = []
        for mac in group["macs"]:
            if mac in already_ours:
                continue
            try:
                if await self.coordinator.async_is_wan_blocked(mac):
                    continue  # bloqué à la main : on n'y touchera pas à la reprise
                await self.coordinator.async_set_wan_blocked(mac, True, refresh=False)
                blocked_by_us.append(mac)
            except Exception as err:  # noqa: BLE001
                errors.append(f"{mac} : {err}")
        until = (dt_util.utcnow() + timedelta(minutes=minutes)).isoformat() if minutes else None
        self.settings.pauses[group_id] = {"until": until, "macs": sorted(blocked_by_us)}
        self.settings.async_schedule_save()
        self._schedule(group_id)
        await self.coordinator.async_request_refresh()
        return {"until": until, "blocked": len(blocked_by_us), "errors": errors}

    async def async_resume(self, group_id: str, *, notify: bool = False) -> list[str]:
        self._cancel(group_id)
        pause = self.settings.pauses.pop(group_id, None)
        self.settings.async_schedule_save()
        errors: list[str] = []
        for mac in (pause or {}).get("macs", []) if isinstance(pause, dict) else []:
            try:
                await self.coordinator.async_set_wan_blocked(mac, False, refresh=False)
            except Exception as err:  # noqa: BLE001
                errors.append(f"{mac} : {err}")
        await self.coordinator.async_request_refresh()
        if notify and self.coordinator.alerts is not None:
            name = self.settings.groups.get(group_id, {}).get("name", group_id)
            message = f"Les appareils du groupe « {name} » ont de nouveau accès à Internet."
            if errors:
                message += f"\nÉchecs : {', '.join(errors)}"
            await self.coordinator.alerts.async_notify(
                "pause_end", "Fin de la pause Internet", message, tags=["hourglass"],
            )
        return errors

    # ── Minuteries ───────────────────────────────────────────────────────────

    async def async_restore(self) -> None:
        """Au démarrage : reprogramme les pauses, lève celles déjà échues."""
        now = dt_util.utcnow()
        for group_id in list(self.settings.pauses):
            until = _parse(self.pause_info(group_id), "until")
            if until is not None and until <= now:
                await self.async_resume(group_id, notify=True)
            else:
                self._schedule(group_id)

    def _schedule(self, group_id: str) -> None:
        self._cancel(group_id)
        until = _parse(self.pause_info(group_id), "until")
        if until is None:
            return

        @callback
        def _expired(_now: datetime) -> None:
            self._timers.pop(group_id, None)
            self.hass.async_create_task(self.async_resume(group_id, notify=True))

        self._timers[group_id] = async_track_point_in_utc_time(self.hass, _expired, until)

    def _cancel(self, group_id: str) -> None:
        unsub = self._timers.pop(group_id, None)
        if unsub:
            unsub()

    def async_shutdown(self) -> None:
        for group_id in list(self._timers):
            self._cancel(group_id)


def _parse(pause: dict[str, Any] | None, key: str) -> datetime | None:
    value = (pause or {}).get(key)
    return dt_util.parse_datetime(value) if isinstance(value, str) else None
