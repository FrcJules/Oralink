"""Orange Livebox."""

import logging
import json
from pathlib import Path

import voluptuous as vol
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr

from .const import CALLID, DOMAIN, PLATFORMS
from .coordinator import LiveboxDataUpdateCoordinator
from .panel import async_setup_panel

type LiveboxConfigEntry = ConfigEntry[LiveboxDataUpdateCoordinator]

CALLMISSED_SCHEMA = vol.Schema({vol.Optional(CALLID): str})
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_LOGGER = logging.getLogger(__name__)


_PANEL_BUILD = "b36"  # bump whenever the JS bundle changes


def _panel_module_url() -> str:
    """Return cache-busted React panel module URL."""
    try:
        manifest = Path(__file__).parent / "manifest.json"
        version = json.loads(manifest.read_text(encoding="utf-8")).get("version", "dev")
    except Exception:
        version = "dev"
    return f"/livebox_panel/react-panel/livebox-panel-react.js?v={version}-{_PANEL_BUILD}"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Livebox integration."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: LiveboxConfigEntry) -> bool:
    """Set up Livebox as config entry."""
    coordinator = LiveboxDataUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register custom panel (once, not per entry)
    if not hass.data.get(f"{DOMAIN}_panel_registered"):
        hass.data[f"{DOMAIN}_panel_registered"] = True
        www_path = str(Path(__file__).parent / "www")
        await hass.http.async_register_static_paths(
            [StaticPathConfig("/livebox_panel", www_path, False)]
        )
        async_register_built_in_panel(
            hass,
            "custom",
            "Livebox",
            "mdi:router-network",
            frontend_url_path="livebox",
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "livebox-panel",
                    "module_url": _panel_module_url(),
                }
            },
        )
        async_setup_panel(hass)

    async def async_remove_cmissed(call) -> None:
        await coordinator.api.voiceservice.async_clear_calllist(
            {CALLID: call.data.get(CALLID)}
        )
        await coordinator.async_refresh()

    hass.services.async_register(
        DOMAIN, "remove_call_missed", async_remove_cmissed, schema=CALLMISSED_SCHEMA
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: LiveboxConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok and not hass.config_entries.async_entries(DOMAIN):
        if hass.data.pop(f"{DOMAIN}_panel_registered", None):
            async_remove_panel(hass, "livebox")
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: LiveboxConfigEntry):
    """Reload device tracker if change option."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_remove_config_entry_device(
    hass: HomeAssistant, config_entry: ConfigEntry, device_entry: dr.DeviceEntry
) -> bool:
    """Remove config entry from a device."""
    return True
