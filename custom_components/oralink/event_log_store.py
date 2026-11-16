"""Stockage persistant du journal d'événements (onglet « Événements »).

Conserve, dans `.storage/oralink_event_log_<entry_id>` (helper `Store` de HA) :

- `events` : les derniers événements (connexion, déconnexion, nouvel appareil),
  du plus récent au plus ancien — sans persistance, le journal était vidé à
  chaque redémarrage de Home Assistant ;
- `known` : les adresses MAC déjà vues au moins une fois (avec nom et date de
  première apparition), pour détecter les appareils jamais vus auparavant ;
- `active` : les MAC actives au dernier rafraîchissement, pour détecter les
  (dé)connexions survenues pendant un redémarrage de HA.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1
SAVE_DELAY = 60  # secondes
MAX_EVENTS = 300


class EventLogStore:
    """Charge/sauvegarde le journal d'événements et les appareils connus."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_event_log_{entry_id}"
        )
        self.events: list[dict[str, Any]] = []
        self.known: dict[str, dict[str, Any]] = {}
        self.active: set[str] = set()

    async def async_load(self) -> None:
        """Charge les données sauvegardées (vides si aucune)."""
        data = await self._store.async_load()
        if not isinstance(data, dict):
            return
        events = data.get("events")
        known = data.get("known")
        active = data.get("active")
        self.events = events[:MAX_EVENTS] if isinstance(events, list) else []
        self.known = known if isinstance(known, dict) else {}
        self.active = set(active) if isinstance(active, list) else set()

    def async_schedule_save(self) -> None:
        """Planifie une écriture différée (regroupée, forcée à l'arrêt de HA)."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "events": self.events[:MAX_EVENTS],
            "known": self.known,
            "active": sorted(self.active),
        }
