"""Client HTTP minimal pour piloter un décodeur TV Orange (UHD/4K) en local.

Contrairement au reste de l'intégration (API sysbus de la Livebox via
`aiosysbus`), le décodeur TV ne s'interroge pas via la box : il expose sur le
réseau local sa propre API HTTP non documentée (port 8080 — télécommande
virtuelle, statut). Cf. `LiveboxMonitor.api.LmTvDecoderApi` et les projets
qu'il cite (AkA57/liveboxtvuhd, etc.) comme référence de ces endpoints.

⚠️ Le décodeur doit être allumé (hors veille) pour répondre à ces requêtes —
une absence de réponse ne signifie donc pas forcément une mauvaise IP.
"""

from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout

TIMEOUT = ClientTimeout(total=3)

# Sous-ensemble des touches de télécommande utiles dans un panel web (cf.
# `LmTvDecoderApi.Key` pour la liste complète des codes).
KEYS: dict[str, int] = {
    "power": 116,
    "mute": 113,
    "vol_down": 114,
    "vol_up": 115,
    "chan_down": 403,
    "chan_up": 402,
    "up": 103,
    "down": 108,
    "left": 105,
    "right": 106,
    "ok": 352,
    "back": 158,
    "menu": 139,
    "rec": 167,
    "fbwd": 168,
    "play": 164,
    "ffwd": 159,
    "0": 512,
    "1": 513,
    "2": 514,
    "3": 515,
    "4": 516,
    "5": 517,
    "6": 518,
    "7": 519,
    "8": 520,
    "9": 521,
}


class TvDecoderError(Exception):
    """Erreur de communication avec un décodeur TV."""


async def async_get_status(session: ClientSession, ip: str) -> dict[str, Any]:
    """Récupère l'état courant du décodeur (chaîne, type/état du média en cours)."""
    try:
        async with session.get(
            f"http://{ip}:8080/remoteControl/cmd?operation=10", timeout=TIMEOUT
        ) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)
    except (ClientError, TimeoutError, ValueError) as err:
        raise TvDecoderError(f"Décodeur {ip} injoignable : {err}") from err

    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict) or result.get("message") != "ok":
        raise TvDecoderError(f"Décodeur {ip} : réponse inattendue")
    return result.get("data") or {}


async def async_key_press(session: ClientSession, ip: str, key: int, mode: int = 0) -> None:
    """Envoie un appui de touche de télécommande virtuelle au décodeur."""
    try:
        async with session.get(
            f"http://{ip}:8080/remoteControl/cmd?operation=01&key={key}&mode={mode}",
            timeout=TIMEOUT,
        ) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)
    except (ClientError, TimeoutError, ValueError) as err:
        raise TvDecoderError(f"Décodeur {ip} injoignable : {err}") from err

    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict) or result.get("message") != "ok":
        msg = result.get("message") if isinstance(result, dict) else None
        raise TvDecoderError(f"Décodeur {ip} : {msg or 'réponse inattendue'}")


async def async_probe(session: ClientSession, ip: str) -> dict[str, Any] | None:
    """Teste si une IP héberge un décodeur TV actif (utilisé par la découverte réseau)."""
    try:
        return await async_get_status(session, ip)
    except TvDecoderError:
        return None
