"""Persistent storage for the aggregate traffic history (onglet « Graphiques »).

L'historique est volontairement gardé simple — pas de détail par appareil ni
par interface, cf. CLAUDE.md — mais le garder uniquement en mémoire (`deque`
côté coordinator) le vide à chaque redémarrage ou rechargement de
l'intégration, ce qui le laisse perpétuellement « en cours de constitution »
pour qui redémarre Home Assistant régulièrement. Cette classe ne fait que
sauvegarder/recharger l'historique en JSON via le helper `Store` de Home
Assistant, dans `.storage/livebox_traffic_history_<entry_id>`, suivant le
même pattern que `repeater_store`/`topology_store`/`tv_decoder_store`.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1


class TrafficHistoryStore:
    """Charge/sauvegarde l'historique de trafic agrégé (liste de points)."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[list[dict[str, Any]]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_traffic_history_{entry_id}"
        )

    async def async_load(self) -> list[dict[str, Any]]:
        """Charge l'historique sauvegardé (liste vide si aucun)."""
        data = await self._store.async_load()
        return data if isinstance(data, list) else []

    async def async_save(self, history: list[dict[str, Any]]) -> None:
        """Sauvegarde l'historique courant (appelé à chaque nouveau point)."""
        await self._store.async_save(history)
