"""Persistent storage for the interactive topology graph (Oralink).

L'ancien panel mémorisait tout côté navigateur (localStorage) : positions des
nœuds, viewport, switchs personnalisés, rattachements forcés ("parent
override"). On reproduit ces fonctionnalités ici via le helper `Store` de Home
Assistant, dans `.storage/livebox_topology_positions_<entry_id>` — ce qui les
persiste côté serveur et les rend visibles à tous les utilisateurs/onglets,
contrairement à l'ancien stockage local au navigateur.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1


class TopologyStore:
    """Charge/sauvegarde l'état persistant du graphe de topologie."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_topology_positions_{entry_id}"
        )
        self._data: dict[str, Any] = {"positions": {}, "switches": [], "parent_overrides": {}}

    async def async_load(self) -> dict[str, Any]:
        """Charge l'état depuis le fichier JSON (appelé au setup).

        Migre l'ancien format (un simple dict de positions à plat) vers le
        nouveau, qui regroupe aussi les switchs personnalisés et les
        rattachements forcés.
        """
        raw = await self._store.async_load() or {}
        if "positions" in raw or "switches" in raw or "parent_overrides" in raw:
            self._data = {
                "positions": raw.get("positions") or {},
                "switches": raw.get("switches") or [],
                "parent_overrides": raw.get("parent_overrides") or {},
            }
        else:
            self._data = {"positions": raw, "switches": [], "parent_overrides": {}}
        return self._data

    @property
    def positions(self) -> dict[str, dict[str, float]]:
        """Positions mémorisées des nœuds, par identifiant."""
        return self._data["positions"]

    @property
    def switches(self) -> list[dict[str, Any]]:
        """Switchs personnalisés ajoutés manuellement au graphe."""
        return self._data["switches"]

    @property
    def parent_overrides(self) -> dict[str, str]:
        """Rattachements forcés (mac → mac du relais parent), par appareil."""
        return self._data["parent_overrides"]

    async def _async_save(self) -> None:
        await self._store.async_save(self._data)

    async def async_set_position(self, node_id: str, x: float, y: float) -> None:
        """Mémorise (et persiste) la position d'un nœud après un glisser-déposer."""
        self._data["positions"][node_id] = {"x": x, "y": y}
        await self._async_save()

    async def async_reset_positions(self) -> None:
        """Oublie toutes les positions enregistrées (revient au layout automatique)."""
        if self._data["positions"]:
            self._data["positions"] = {}
            await self._async_save()

    async def async_set_switch(
        self, switch_id: str, *, name: str, parent: str | None, devices: list[str]
    ) -> None:
        """Crée ou met à jour un switch personnalisé."""
        switches = [sw for sw in self._data["switches"] if sw["id"] != switch_id]
        switches.append({"id": switch_id, "name": name, "parent": parent, "devices": devices})
        self._data["switches"] = switches
        await self._async_save()

    async def async_remove_switch(self, switch_id: str) -> None:
        """Supprime un switch personnalisé."""
        switches = [sw for sw in self._data["switches"] if sw["id"] != switch_id]
        if len(switches) != len(self._data["switches"]):
            self._data["switches"] = switches
            await self._async_save()

    async def async_set_parent(self, mac: str, parent: str | None) -> None:
        """Force (ou efface, si `parent` est vide) le relais parent d'un appareil."""
        if parent:
            self._data["parent_overrides"][mac] = parent
        else:
            self._data["parent_overrides"].pop(mac, None)
        await self._async_save()
