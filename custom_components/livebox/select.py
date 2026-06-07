"""Select entities for Livebox."""

from __future__ import annotations

import logging
from typing import Final

from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import LiveboxConfigEntry
from .const import FIREWALL_ICON
from .coordinator import LiveboxDataUpdateCoordinator
from .entity import LiveboxEntity

_LOGGER = logging.getLogger(__name__)

FIREWALL_LEVELS: Final[list[str]] = ["Low", "Medium", "High", "Custom"]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LiveboxConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Livebox select entities."""
    coordinator = entry.runtime_data
    async_add_entities(
        [LiveboxFirewallLevelSelect(coordinator)]
    )


class LiveboxFirewallLevelSelect(LiveboxEntity, SelectEntity):
    """Select entity to control the IPv4 firewall security level."""

    _attr_options = FIREWALL_LEVELS
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = FIREWALL_ICON
    _attr_translation_key = "firewall_level"

    def __init__(self, coordinator: LiveboxDataUpdateCoordinator) -> None:
        """Initialize the select entity."""
        super().__init__(
            coordinator,
            SelectEntityDescription(key="firewall_level", name="Firewall Level"),
        )

    @property
    def current_option(self) -> str | None:
        """Return the current firewall level."""
        level = self.coordinator.data.get("firewall_level", "Medium")
        return level if level in FIREWALL_LEVELS else "Medium"

    async def async_select_option(self, option: str) -> None:
        """Change the firewall level."""
        await self.coordinator.async_set_firewall_level(option)
        await self.coordinator.async_request_refresh()
