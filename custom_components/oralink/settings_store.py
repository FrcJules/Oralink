"""Réglages persistants d'Oralink hors config entry.

Dans `.storage/oralink_settings_<entry_id>` (helper `Store` de HA) :

- `ntfy` : serveur, topic, jeton (facultatif), alertes activées, boutons
  d'action ;
- `webhook_id` : identifiant secret du webhook HA qui reçoit les clics sur
  les boutons des notifications ;
- `action_tokens` : jetons à usage unique des boutons envoyés (un jeton =
  une action sur un appareil, valable `ACTION_TOKEN_TTL`) ;
- `groups` / `pauses` : groupes d'appareils et pauses Internet en cours
  (fin ISO, ou None = jusqu'à reprise manuelle) ;
- `upnp_macs` : appareils ayant déjà ouvert un port UPnP (l'alerte n'est
  envoyée qu'à la première ouverture d'un appareil, sauf réglage contraire) ;
- `monitor` : test de débit planifié (activé, heure, seuil d'alerte).
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1
ACTION_TOKEN_TTL = timedelta(hours=24)

# Alertes proposées, activées par défaut à la première configuration.
NTFY_ALERTS = {
    "new_device": True,  # appareil jamais vu sur le réseau
    "upnp": True,  # un appareil ouvre un port sur Internet (UPnP)
    "upnp_all": False,  # … à chaque ouverture, pas seulement la première
    "guest_off": False,  # le Wi-Fi invité minuté s'est éteint
    "pause_end": True,  # fin d'une pause Internet de groupe
    "speed_drop": True,  # test de débit anormalement bas
    "fiber": True,  # signal fibre dégradé / revenu à la normale
}

# Surveillance : test de débit quotidien (heure locale) ; min_down = seuil
# d'alerte fixe en Mbit/s (0 = comparaison avec les tests habituels).
DEFAULT_MONITOR: dict[str, Any] = {
    "speedtest_enabled": True,
    "speedtest_hour": 4,
    "min_down": 0,
}

DEFAULT_NTFY: dict[str, Any] = {
    "enabled": False,
    "server": "https://ntfy.sh",
    "topic": "",
    "token": "",
    "alerts": dict(NTFY_ALERTS),
    "actions": True,
}


class SettingsStore:
    """Charge/sauvegarde les réglages (ntfy, groupes, pauses…)."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_settings_{entry_id}"
        )
        self.ntfy: dict[str, Any] = {**DEFAULT_NTFY, "alerts": dict(NTFY_ALERTS)}
        self.webhook_id: str = ""
        self.action_tokens: dict[str, dict[str, Any]] = {}
        self.groups: dict[str, dict[str, Any]] = {}
        self.pauses: dict[str, str | None] = {}
        self.upnp_macs: set[str] = set()
        self.monitor: dict[str, Any] = dict(DEFAULT_MONITOR)

    async def async_load(self) -> None:
        data = await self._store.async_load()
        data = data if isinstance(data, dict) else {}
        ntfy = data.get("ntfy") if isinstance(data.get("ntfy"), dict) else {}
        self.ntfy = {**DEFAULT_NTFY, **ntfy}
        self.ntfy["alerts"] = {**NTFY_ALERTS, **(ntfy.get("alerts") or {})}
        self.webhook_id = data.get("webhook_id") or secrets.token_urlsafe(24)
        self.action_tokens = data.get("action_tokens") or {}
        self.groups = data.get("groups") or {}
        self.pauses = data.get("pauses") or {}
        self.upnp_macs = set(data.get("upnp_macs") or [])
        self.monitor = {**DEFAULT_MONITOR, **(data.get("monitor") or {})}
        if not data.get("webhook_id"):
            self.async_schedule_save()

    def async_schedule_save(self) -> None:
        self._store.async_delay_save(self._data_to_save, 5)

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "ntfy": self.ntfy,
            "webhook_id": self.webhook_id,
            "action_tokens": self.action_tokens,
            "groups": self.groups,
            "pauses": self.pauses,
            "upnp_macs": sorted(self.upnp_macs),
            "monitor": self.monitor,
        }

    # ── Jetons des boutons d'action ──────────────────────────────────────────

    def new_action_token(self, action: str, mac: str, now: datetime) -> str:
        """Crée un jeton à usage unique pour `action` sur `mac`."""
        self._purge_tokens(now)
        token = secrets.token_urlsafe(18)
        self.action_tokens[token] = {
            "action": action,
            "mac": mac,
            "expires": (now + ACTION_TOKEN_TTL).isoformat(),
        }
        self.async_schedule_save()
        return token

    def consume_action_token(self, token: str, now: datetime) -> dict[str, Any] | None:
        """Retourne et invalide le jeton s'il est valide (sinon None)."""
        self._purge_tokens(now)
        entry = self.action_tokens.pop(str(token or ""), None)
        if entry is not None:
            self.async_schedule_save()
        return entry

    def _purge_tokens(self, now: datetime) -> None:
        expired = [
            t for t, e in self.action_tokens.items()
            if str(e.get("expires", "")) < now.isoformat()
        ]
        for token in expired:
            del self.action_tokens[token]
