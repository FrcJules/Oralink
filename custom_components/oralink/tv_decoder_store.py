"""Stockage persistant des décodeurs TV configurés (nom + IP, par adresse MAC).

Contrairement aux répéteurs (détectés automatiquement via la topologie), les
décodeurs TV n'apparaissent dans aucune API Livebox : l'utilisateur doit
indiquer leur IP manuellement, ou laisser la découverte réseau les repérer
parmi les appareils LAN actifs (cf. `panel.ws_discover_tv_decoders`).

Les données sont écrites en JSON via le helper `Store` de Home Assistant,
dans `.storage/livebox_tvdecoders_<entry_id>`.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORAGE_VERSION = 1


class TvDecoderStore:
    """Charge/sauvegarde les décodeurs TV configurés (par adresse MAC)."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, dict[str, str]]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}_tvdecoders_{entry_id}"
        )
        self._data: dict[str, dict[str, str]] = {}

    async def async_load(self) -> dict[str, dict[str, str]]:
        """Charge les données depuis le fichier JSON (appelé au setup)."""
        self._data = await self._store.async_load() or {}
        return self._data

    @property
    def data(self) -> dict[str, dict[str, str]]:
        """Retourne les décodeurs actuellement en mémoire, par adresse MAC."""
        return self._data

    async def async_set(self, mac: str, *, name: str, ip: str) -> None:
        """Ajoute ou met à jour un décodeur (et persiste)."""
        self._data[mac] = {"name": name, "ip": ip}
        await self._store.async_save(self._data)

    async def async_remove(self, mac: str) -> None:
        """Oublie un décodeur configuré."""
        if self._data.pop(mac, None) is not None:
            await self._store.async_save(self._data)
