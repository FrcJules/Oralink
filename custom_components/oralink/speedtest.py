"""Test de débit lancé par Oralink (serveurs de test Cloudflare).

La Livebox 6 n'expose aucun moyen de lancer un test (`SpeedTest` n'a que
`getWANResults`, vide, et `SpeedTest.ServerConfig` est refusé même en
admin). On mesure donc depuis la machine Home Assistant, vers
`speed.cloudflare.com` (mêmes points d'accès que speed.cloudflare.com) :

- latence : médiane de 5 requêtes vides (temps jusqu'aux en-têtes) ;
- descendant : 4 téléchargements parallèles, débit = octets / durée ;
- montant : 4 envois parallèles.

⚠ Le résultat est borné par le lien de la machine HA (souvent 1 Gbit/s en
Ethernet, moins en Wi-Fi) : utile pour repérer une chute, pas pour mesurer
une fibre à plus de 1 Gbit/s.
"""

from __future__ import annotations

import asyncio
import statistics
import time
from typing import Any

import aiohttp

BASE = "https://speed.cloudflare.com"
STREAMS = 4
DOWN_BYTES = 25_000_000  # par flux (100 Mo au total)
UP_BYTES = 10_000_000  # par flux (40 Mo au total)
TIMEOUT = aiohttp.ClientTimeout(total=60)


class SpeedtestError(Exception):
    """Test impossible (pas d'accès Internet, serveur injoignable…)."""


async def _latency(session: aiohttp.ClientSession) -> float:
    samples = []
    for _ in range(5):
        start = time.perf_counter()
        async with session.get(f"{BASE}/__down?bytes=0", timeout=TIMEOUT) as resp:
            await resp.read()
        samples.append((time.perf_counter() - start) * 1000)
    return round(statistics.median(samples), 1)


async def _download(session: aiohttp.ClientSession) -> float:
    async def one() -> int:
        total = 0
        async with session.get(f"{BASE}/__down?bytes={DOWN_BYTES}", timeout=TIMEOUT) as resp:
            resp.raise_for_status()
            async for chunk in resp.content.iter_chunked(1 << 16):
                total += len(chunk)
        return total

    start = time.perf_counter()
    sizes = await asyncio.gather(*(one() for _ in range(STREAMS)))
    return sum(sizes) * 8 / (time.perf_counter() - start) / 1e6


async def _upload(session: aiohttp.ClientSession) -> float:
    payload = b"\0" * UP_BYTES

    async def one() -> None:
        async with session.post(f"{BASE}/__up", data=payload, timeout=TIMEOUT) as resp:
            resp.raise_for_status()
            await resp.read()

    start = time.perf_counter()
    await asyncio.gather(*(one() for _ in range(STREAMS)))
    return UP_BYTES * STREAMS * 8 / (time.perf_counter() - start) / 1e6


async def async_run(session: aiohttp.ClientSession) -> dict[str, Any]:
    """Lance un test complet ; retourne {down, up, latency} (Mbit/s, ms)."""
    try:
        latency = await _latency(session)
        down = await _download(session)
        up = await _upload(session)
    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        raise SpeedtestError(f"test de débit impossible : {err}") from err
    return {"down": round(down, 1), "up": round(up, 1), "latency": latency}
