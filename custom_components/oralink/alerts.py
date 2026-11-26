"""Alertes Oralink : notifications ntfy et boutons d'action.

Les événements restent publiés sur le bus HA (`oralink_device_event`,
`oralink_port_forward_event`) pour les automatisations ; ce module ajoute un
envoi **direct** vers ntfy, sans passer par une automatisation ni par
l'appli mobile HA. Les boutons « Couper Internet » / « Rétablir » appellent
un webhook HA d'Oralink avec un jeton à usage unique (24 h) : un jeton lu
dans le topic ne permet qu'une seule action, sur un seul appareil.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from aiohttp import web
from homeassistant.components import webhook
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import NoURLAvailableError, get_url
from homeassistant.util import dt as dt_util

from .ntfy import NtfyError, async_publish, build_message, http_action
from .upnp_utils import PROTOCOL_NAMES

if TYPE_CHECKING:
    from .coordinator import LiveboxDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)

PANEL_PATH = "/oralink"


class OralinkAlerts:
    """Envoi des alertes ntfy et traitement des boutons d'action."""

    def __init__(self, hass: HomeAssistant, coordinator: LiveboxDataUpdateCoordinator) -> None:
        self.hass = hass
        self.coordinator = coordinator
        self.settings = coordinator.settings_store

    # ── Envoi ────────────────────────────────────────────────────────────────

    def _base_url(self, external_only: bool) -> str | None:
        try:
            return get_url(
                self.hass, allow_internal=not external_only, prefer_external=True
            )
        except NoURLAvailableError:
            return None

    def alert_enabled(self, alert: str) -> bool:
        ntfy = self.settings.ntfy
        return bool(ntfy.get("enabled") and ntfy.get("topic") and ntfy["alerts"].get(alert))

    async def async_send(self, title: str, message: str, **kwargs: Any) -> None:
        """Publie (lève NtfyError) — utilisé par le bouton « Tester »."""
        ntfy = self.settings.ntfy
        panel = self._base_url(external_only=False)
        kwargs.setdefault("click", f"{panel}{PANEL_PATH}" if panel else None)
        body = build_message(ntfy.get("topic", ""), title, message, **kwargs)
        await async_publish(
            async_get_clientsession(self.hass), ntfy.get("server", ""), ntfy.get("token", ""), body
        )

    async def async_notify(self, alert: str, title: str, message: str, **kwargs: Any) -> None:
        """Publie si l'alerte est activée ; une erreur est journalisée, pas levée."""
        if not self.alert_enabled(alert):
            return
        try:
            await self.async_send(title, message, **kwargs)
        except NtfyError as err:
            _LOGGER.warning("Notification ntfy « %s » non envoyée : %s", title, err)

    def _device_action(self, action: str, label: str, mac: str) -> dict[str, Any] | None:
        """Bouton http vers le webhook (None si HA n'a pas d'URL externe)."""
        if not self.settings.ntfy.get("actions"):
            return None
        base = self._base_url(external_only=True)
        if not base:
            return None
        token = self.settings.new_action_token(action, mac, dt_util.utcnow())
        url = f"{base}/api/webhook/{self.settings.webhook_id}"
        return http_action(label, url, json.dumps({"token": token}))

    # ── Alertes ──────────────────────────────────────────────────────────────

    async def async_new_device(self, event: dict[str, Any]) -> None:
        mac = event.get("mac", "")
        name = event.get("name") or mac
        lines = [f"{name} vient de se connecter pour la première fois."]
        if event.get("ip"):
            lines.append(f"IP : {event['ip']}")
        lines.append(f"MAC : {mac}")
        actions = [a for a in (self._device_action("block", "Couper Internet", mac),) if a]
        await self.async_notify(
            "new_device", "Nouvel appareil sur le réseau", "\n".join(lines),
            tags=["warning", "satellite"], priority=4, actions=actions,
        )

    async def async_upnp_opened(self, rule: dict[str, Any], presence: dict[str, Any] | None) -> None:
        mac = (presence or {}).get("mac", "")
        alerts = self.settings.ntfy.get("alerts", {})
        first = bool(mac) and mac not in self.settings.upnp_macs
        if mac and first:
            self.settings.upnp_macs.add(mac)
            self.settings.async_schedule_save()
        if not (first or alerts.get("upnp_all") or not mac):
            return
        name = (presence or {}).get("name") or rule.get("destination_ip") or "Un appareil"
        proto = PROTOCOL_NAMES.get(str(rule.get("protocol")), str(rule.get("protocol") or ""))
        port = rule.get("external_port")
        message = f"{name} a ouvert le port {port} {proto} sur Internet (UPnP)."
        if rule.get("name") and rule.get("name") != rule.get("id"):
            message += f"\nApplication : {rule['name']}"
        if first:
            message += "\nPremière ouverture de port pour cet appareil."
        await self.async_notify(
            "upnp", "Port ouvert sur Internet", message, tags=["unlock"], priority=4,
        )

    # ── Webhook des boutons ──────────────────────────────────────────────────

    def async_register_webhook(self) -> None:
        webhook.async_register(
            self.hass, "oralink", "Oralink — boutons des notifications",
            self.settings.webhook_id, self._async_handle_webhook,
            local_only=False, allowed_methods=["POST"],
        )

    def async_unregister_webhook(self) -> None:
        webhook.async_unregister(self.hass, self.settings.webhook_id)

    async def _async_handle_webhook(
        self, hass: HomeAssistant, webhook_id: str, request: web.Request
    ) -> web.Response:
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
        entry = self.settings.consume_action_token(
            (payload or {}).get("token", ""), dt_util.utcnow()
        )
        if entry is None:
            return web.json_response({"error": "jeton invalide ou expiré"}, status=403)
        mac = entry["mac"]
        device = self.coordinator.device_info_by_mac(mac)
        name = device.get("Name") or mac
        blocked = entry["action"] == "block"
        try:
            await self.coordinator.async_set_wan_blocked(mac, blocked)
        except Exception as err:  # noqa: BLE001 — renvoyé dans la notification
            await self._confirm(f"Échec pour {name}", str(err), ["x"])
            return web.json_response({"error": str(err)}, status=500)
        if blocked:
            undo = self._device_action("unblock", "Rétablir", mac)
            await self._confirm(
                "Internet coupé", f"{name} n'a plus accès à Internet.",
                ["no_entry"], [undo] if undo else None,
            )
        else:
            await self._confirm("Internet rétabli", f"{name} a de nouveau accès à Internet.",
                                ["white_check_mark"])
        return web.json_response({"status": "ok", "blocked": blocked})

    async def _confirm(self, title: str, message: str, tags: list[str],
                       actions: list[dict[str, Any]] | None = None) -> None:
        try:
            await self.async_send(title, message, tags=tags, actions=actions)
        except NtfyError as err:
            _LOGGER.warning("Confirmation ntfy non envoyée : %s", err)

