"""Button for Livebox router."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Final, cast

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import LiveboxConfigEntry
from .const import CLEARCALLS_ICON, DOMAIN, RESTART_ICON, RING_ICON
from .coordinator import LiveboxDataUpdateCoordinator
from .entity import LiveboxEntity

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, kw_only=True)
class LiveboxButtonEntityDescription(ButtonEntityDescription):
    """Class describing Livebox button entities."""

    value_fn: Callable[..., Any]


BUTTON_TYPES: Final[tuple[LiveboxButtonEntityDescription, ...]] = (
    LiveboxButtonEntityDescription(
        key="restart",
        name="Livebox restart",
        icon=RESTART_ICON,
        translation_key="restart_btn",
        value_fn=lambda x: x.nmc.async_reboot,
    ),
    LiveboxButtonEntityDescription(
        key="ring",
        name="Ring your phone",
        icon=RING_ICON,
        translation_key="ring_btn",
        value_fn=lambda x: x.voiceservice.async_ring,
    ),
    LiveboxButtonEntityDescription(
        key="clear_calls",
        name="Clear calls",
        icon=CLEARCALLS_ICON,
        translation_key="cmissed_clear_btn",
        value_fn=lambda x: x.voiceservice.async_clear_calllist,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LiveboxConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the button platform."""
    coordinator = entry.runtime_data
    entities = [Button(coordinator, description) for description in BUTTON_TYPES]
    async_add_entities(entities)

    # Per-device Wake-on-LAN buttons — dynamically added as devices are discovered
    wol_tracked: set[str] = set()

    @callback
    def async_add_wol_buttons() -> None:
        new_entities = []
        for mac, device in coordinator.data.get("devices", {}).items():
            if mac in wol_tracked:
                continue
            device_key = device.get("Key") or mac
            device_name = device.get("Name") or mac
            new_entities.append(
                LiveboxDeviceWolButton(coordinator, device_key, device_name, mac)
            )
            wol_tracked.add(mac)
        if new_entities:
            async_add_entities(new_entities)

    entry.async_on_unload(
        async_dispatcher_connect(
            hass, coordinator.signal_device_new, async_add_wol_buttons
        )
    )
    async_add_wol_buttons()


class Button(LiveboxEntity, ButtonEntity):  # pyrefly: ignore[inconsistent-inheritance]
    """Representation of a livebox button."""

    _attr_should_poll = False

    def __init__(
        self,
        coordinator: LiveboxDataUpdateCoordinator,
        description: LiveboxButtonEntityDescription,
    ) -> None:
        """Initialize."""
        super().__init__(coordinator, description)

    async def async_press(self) -> None:
        """Triggers the button press service."""
        description = cast(LiveboxButtonEntityDescription, self.entity_description)
        await description.value_fn(self.coordinator.api)()


class LiveboxDeviceWolButton(  # pyrefly: ignore[inconsistent-inheritance]
    CoordinatorEntity[LiveboxDataUpdateCoordinator], ButtonEntity
):
    """Wake-on-LAN button for a tracked device.

    Available only when the device is offline — sending WoL to an already-active
    device is harmless but pointless, so HA marks it as unavailable then.
    """

    _attr_has_entity_name = True
    _attr_name = "Wake on LAN"
    _attr_icon = "mdi:power"

    def __init__(
        self,
        coordinator: LiveboxDataUpdateCoordinator,
        device_key: str,
        device_name: str,
        mac: str,
    ) -> None:
        """Initialise the per-device WoL button."""
        super().__init__(coordinator)
        self._device_key = device_key
        self._mac = mac
        self._attr_unique_id = (
            f"{coordinator.unique_id or DOMAIN}_device_{device_key}_wol"
        )
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_key)},
            name=device_name,
        )

    @property
    def available(self) -> bool:
        """Usable only when the device is offline (needs waking)."""
        device = self.coordinator.data.get("devices", {}).get(self._mac, {})
        return not bool(device.get("Active", False))

    async def async_press(self) -> None:
        """Send a Wake-on-LAN magic packet via the Livebox WOL service."""
        try:
            await self.coordinator.api.devices._auth.post(
                "WOL", "sendWakeOnLan", {"hostID": self._mac}
            )
        except Exception as err:
            _LOGGER.error("Wake-on-LAN failed for %s: %s", self._mac, err)
