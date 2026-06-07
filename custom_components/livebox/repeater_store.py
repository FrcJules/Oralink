"""Persistent storage for Wifi repeater connection settings (IP, identifiants).

Les répéteurs sont détectés automatiquement via la topologie (cf.
`coordinator.topology_repeaters`, clé = adresse MAC). Cette classe ne fait que
mémoriser, pour chaque répéteur détecté, l'adresse IP et les identifiants à
utiliser pour s'y connecter directement (nécessaire pour les futures
fonctionnalités de pilotage des répéteurs — cf. CLAUDE.md, feuille de route).

Les données sont écrites en JSON via le helper `Store` de Home Assistant,
dans `.storage/livebox_repeaters_<entry_id>`.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1


class RepeaterStore:
    """Charge/sauvegarde les paramètres de connexion des répéteurs (par clé/MAC)."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, dict[str, str]]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_repeaters_{entry_id}"
        )
        self._data: dict[str, dict[str, str]] = {}

    async def async_load(self) -> dict[str, dict[str, str]]:
        """Charge les données depuis le fichier JSON (appelé au setup)."""
        self._data = await self._store.async_load() or {}
        return self._data

    @property
    def data(self) -> dict[str, dict[str, str]]:
        """Retourne les paramètres actuellement en mémoire, par clé de répéteur."""
        return self._data

    def get(self, key: str) -> dict[str, str]:
        """Retourne les paramètres connus d'un répéteur (dict vide si aucun)."""
        return self._data.get(key, {})

    async def async_set(
        self,
        key: str,
        *,
        ip: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        """Met à jour (et persiste) les paramètres d'un répéteur."""
        entry = dict(self._data.get(key, {}))
        if ip is not None:
            entry["ip"] = ip
        if username is not None:
            entry["username"] = username
        if password is not None:
            entry["password"] = password
        self._data[key] = entry
        await self._store.async_save(self._data)

    async def async_remove(self, key: str) -> None:
        """Oublie les paramètres enregistrés pour un répéteur."""
        if self._data.pop(key, None) is not None:
            await self._store.async_save(self._data)
