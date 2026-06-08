"""Persistent storage for the interactive topology graph node positions.

L'ancien panel mémorisait la position où l'utilisateur faisait glisser chaque
nœud du graphe (Cytoscape) pour ne pas relancer un layout automatique à chaque
ouverture. On reproduit ce comportement ici via le helper `Store` de Home
Assistant, dans `.storage/livebox_topology_positions_<entry_id>`.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1


class TopologyStore:
    """Charge/sauvegarde les positions des nœuds du graphe de topologie."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, dict[str, float]]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_topology_positions_{entry_id}"
        )
        self._data: dict[str, dict[str, float]] = {}

    async def async_load(self) -> dict[str, dict[str, float]]:
        """Charge les positions depuis le fichier JSON (appelé au setup)."""
        self._data = await self._store.async_load() or {}
        return self._data

    @property
    def data(self) -> dict[str, dict[str, float]]:
        """Retourne les positions actuellement en mémoire, par identifiant de nœud."""
        return self._data

    async def async_set(self, node_id: str, x: float, y: float) -> None:
        """Mémorise (et persiste) la position d'un nœud après un glisser-déposer."""
        self._data[node_id] = {"x": x, "y": y}
        await self._store.async_save(self._data)

    async def async_reset(self) -> None:
        """Oublie toutes les positions enregistrées (revient au layout automatique)."""
        if self._data:
            self._data = {}
            await self._store.async_save(self._data)
