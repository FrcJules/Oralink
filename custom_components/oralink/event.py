"""Entité `event` : connexions, déconnexions et nouveaux appareils du réseau.

Le coordinator publie déjà `oralink_device_event` sur le bus HA ; cette entité
relaie ces événements sous une forme exploitable directement dans l'éditeur
d'automatisations (déclencheur « Entité » → `event.<livebox>_evenements_reseau`,
attribut `event_type` = new / connected / disconnected).
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.event import EventEntity, EventEntityDescription
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import LiveboxConfigEntry
from .coordinator import EVENT_DEVICE, LiveboxDataUpdateCoordinator
from .entity import LiveboxEntity

EVENT_TYPES = ["new", "connected", "disconnected"]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LiveboxConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the device events entity."""
    async_add_entities([LiveboxDeviceEvents(entry.runtime_data)])


class LiveboxDeviceEvents(LiveboxEntity, EventEntity):  # pyrefly: ignore[inconsistent-inheritance]
    """Relaie `oralink_device_event` pour cette Livebox."""

    _attr_event_types = EVENT_TYPES
    _attr_icon = "mdi:lan-connect"

    def __init__(self, coordinator: LiveboxDataUpdateCoordinator) -> None:
        """Initialize the entity."""
        super().__init__(
            coordinator,
            EventEntityDescription(key="device_events", translation_key="device_events"),
        )

    async def async_added_to_hass(self) -> None:
        """Écoute les événements du coordinator de cette entrée."""
        await super().async_added_to_hass()
        entry_id = self.coordinator.config_entry.entry_id

        @callback
        def _handle(event: Event[dict[str, Any]]) -> None:
            data = event.data
            if data.get("entry_id") != entry_id or data.get("event") not in EVENT_TYPES:
                return
            self._trigger_event(
                data["event"],
                {k: data.get(k) for k in ("mac", "name", "ip", "time")},
            )
            self.async_write_ha_state()

        self.async_on_remove(self.hass.bus.async_listen(EVENT_DEVICE, _handle))

    @callback
    def _handle_coordinator_update(self) -> None:
        """L'état ne dépend que des événements reçus, pas des données du coordinator."""
