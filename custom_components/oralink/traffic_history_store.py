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
SAVE_DELAY = 300  # secondes


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

    def async_schedule_save(self, history: list[dict[str, Any]]) -> None:
        """Planifie une sauvegarde différée de l'historique courant.

        Appelé à chaque nouveau point (1/min) : réécrire immédiatement le JSON
        complet (~720 points) à chaque fois sollicite le disque pour rien. Le Store
        regroupe les écritures (au plus une toutes les SAVE_DELAY secondes) et
        force l'écriture finale à l'arrêt de Home Assistant.
        """
        self._store.async_delay_save(lambda: history, SAVE_DELAY)
