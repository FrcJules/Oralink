"""Surveillance : test de débit planifié, fibre, présence, règles oubliées.

- Test de débit chaque jour à l'heure choisie (`speedtest.py`). Si le débit
  semble avoir chuté, on refait un test 2 min plus tard et on n'alerte que si
  la chute se confirme (évite l'alerte sur un téléchargement en cours).
- Fibre : un relevé par heure ; alerte ntfy quand le niveau se dégrade
  (`monitor_utils.fiber_level`), et quand il redevient normal.
- Règles oubliées : signalées dans les Réparations de HA (issue registry).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .monitor_store import MonitorStore
from .monitor_utils import fiber_level, speed_drop
from .speedtest import SpeedtestError, async_run

if TYPE_CHECKING:
    from .coordinator import LiveboxDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)

SPEEDTEST_MINUTE = 17  # évite l'heure pile, où beaucoup de tâches tournent
CONFIRM_DELAY = 120
FIBER_SAMPLE_EVERY = timedelta(hours=1)
STALE_ISSUE_ID = "stale_rules"


class Monitor:
    def __init__(self, hass: HomeAssistant, coordinator: LiveboxDataUpdateCoordinator) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.store = MonitorStore(hass, coordinator.config_entry.entry_id)
        self.settings = coordinator.settings_store
        self._unsub_speedtest: Callable[[], None] | None = None
        self._lock = asyncio.Lock()
        self.running = False
        self._sessions_started = False

    async def async_load(self) -> None:
        await self.store.async_load()

    # ── Test de débit ────────────────────────────────────────────────────────

    def async_schedule(self) -> None:
        self.async_shutdown()
        conf = self.settings.monitor
        if not conf.get("speedtest_enabled"):
            return

        @callback
        def _run(_now: datetime) -> None:
            self.hass.async_create_task(self.async_run_speedtest(scheduled=True))

        self._unsub_speedtest = async_track_time_change(
            self.hass, _run, hour=int(conf.get("speedtest_hour", 4)),
            minute=SPEEDTEST_MINUTE, second=0,
        )

    def async_shutdown(self) -> None:
        if self._unsub_speedtest:
            self._unsub_speedtest()
            self._unsub_speedtest = None

    @property
    def latest_speedtest(self) -> dict[str, Any] | None:
        return self.store.speedtests[-1] if self.store.speedtests else None

    async def async_run_speedtest(self, scheduled: bool = False) -> dict[str, Any]:
        if self._lock.locked():
            raise SpeedtestError("un test est déjà en cours")
        async with self._lock:
            self.running = True
            try:
                session = async_get_clientsession(self.hass)
                history = list(self.store.speedtests)
                min_down = float(self.settings.monitor.get("min_down") or 0)
                result = await async_run(session)
                reason = speed_drop(result, history, min_down)
                if reason and scheduled:
                    await asyncio.sleep(CONFIRM_DELAY)
                    result = await async_run(session)
                    reason = speed_drop(result, history, min_down)
                entry = {"time": dt_util.utcnow().isoformat(), **result,
                         "scheduled": scheduled}
                self.store.speedtests.append(entry)
                self.store.async_schedule_save(5)
                self.coordinator.apply_own_speedtest(entry)
                if reason and self.coordinator.alerts is not None:
                    await self.coordinator.alerts.async_notify(
                        "speed_drop", "Débit Internet en baisse",
                        f"Test de débit : {reason}.\n↑ {result['up']:g} Mbit/s · "
                        f"latence {result['latency']:g} ms",
                        tags=["chart_with_downwards_trend"], priority=4,
                    )
                return {**entry, "alert": reason}
            finally:
                self.running = False

    # ── Fibre ────────────────────────────────────────────────────────────────

    def record_fiber(self, fiber_status: dict[str, Any]) -> None:
        if not isinstance(fiber_status, dict) or not fiber_status.get("SignalRxPower"):
            return
        now = dt_util.utcnow()
        samples = self.store.fiber
        last = dt_util.parse_datetime(samples[-1]["t"]) if samples else None
        if last and now - last < FIBER_SAMPLE_EVERY:
            return
        rx = round(fiber_status["SignalRxPower"] / 1000, 2)
        tx = round((fiber_status.get("SignalTxPower") or 0) / 1000, 2)
        history = list(samples)
        samples.append({"t": now.isoformat(), "rx": rx, "tx": tx,
                        "temp": fiber_status.get("Temperature")})
        self.store.async_schedule_save()
        level, text = fiber_level(rx, history)
        previous = self.store.fiber_level
        if level == "unknown" or level == previous:
            return
        self.store.fiber_level = level
        if self.coordinator.alerts is None:
            return
        if level == "ok":
            title, tags = "Fibre : signal revenu à la normale", ["white_check_mark"]
        else:
            title, tags = "Fibre : signal dégradé", ["warning", "electric_plug"]
        self.hass.async_create_task(self.coordinator.alerts.async_notify(
            "fiber", title, text, tags=tags, priority=4 if level != "ok" else 3,
        ))

    def fiber_state(self) -> dict[str, Any]:
        samples = self.store.fiber
        current = samples[-1] if samples else None
        level, text = fiber_level(current["rx"] if current else None, samples[:-1])
        return {"level": level, "text": text, "current": current, "history": samples}

    # ── Présence ─────────────────────────────────────────────────────────────

    def record_presence(self, devices: dict[str, Any]) -> None:
        active = {mac for mac, d in devices.items() if d.get("Active")}
        if not devices:
            return  # échec de lecture probable : on ne ferme rien
        seen = {mac: rec.get("last_seen") for mac, rec in
                self.coordinator.event_log_store.seen.items() if rec.get("last_seen")}
        first = not self._sessions_started
        self._sessions_started = True
        if self.store.update_sessions(active, dt_util.utcnow(), first, seen):
            self.store.async_schedule_save()

    def disconnects_24h(self) -> dict[str, int]:
        return self.store.disconnects_since(dt_util.utcnow() - timedelta(hours=24))

    # ── Réparations : règles visant un appareil disparu ──────────────────────

    def update_stale_issue(self, stale: list[str]) -> None:
        if not stale:
            ir.async_delete_issue(self.hass, DOMAIN, STALE_ISSUE_ID)
            return
        ir.async_create_issue(
            self.hass, DOMAIN, STALE_ISSUE_ID, is_fixable=False, is_persistent=False,
            severity=ir.IssueSeverity.WARNING, translation_key=STALE_ISSUE_ID,
            translation_placeholders={"count": str(len(stale)),
                                      "rules": "\n".join(f"- {s}" for s in stale[:15])},
        )
