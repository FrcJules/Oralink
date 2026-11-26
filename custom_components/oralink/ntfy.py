"""Envoi de notifications ntfy (https://ntfy.sh ou serveur auto-hébergé).

Publication JSON sur la racine du serveur (`POST <serveur>` avec `topic` dans
le corps), ce qui permet titre, tags, priorité, lien au clic et boutons
d'action sans encodage d'en-têtes. Les boutons « http » appellent le webhook
HA d'Oralink avec un jeton à usage unique (cf. `settings_store`).
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

TIMEOUT = aiohttp.ClientTimeout(total=10)


class NtfyError(Exception):
    """Échec de publication (réseau, refus du serveur…)."""


def build_message(
    topic: str,
    title: str,
    message: str,
    *,
    tags: list[str] | None = None,
    priority: int = 3,
    click: str | None = None,
    actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Corps JSON d'une publication ntfy."""
    body: dict[str, Any] = {"topic": topic, "title": title, "message": message,
                            "priority": priority}
    if tags:
        body["tags"] = tags
    if click:
        body["click"] = click
    if actions:
        body["actions"] = actions[:3]  # ntfy accepte 3 boutons au maximum
    return body


def http_action(label: str, url: str, body: str, *, clear: bool = True) -> dict[str, Any]:
    """Bouton ntfy qui fait un POST (ici : vers le webhook HA d'Oralink)."""
    return {"action": "http", "label": label, "url": url, "method": "POST",
            "headers": {"Content-Type": "application/json"}, "body": body,
            "clear": clear}


def view_action(label: str, url: str) -> dict[str, Any]:
    return {"action": "view", "label": label, "url": url}


async def async_publish(
    session: aiohttp.ClientSession, server: str, token: str, body: dict[str, Any]
) -> None:
    """Publie `body` sur le serveur ntfy ; lève NtfyError en cas d'échec."""
    url = (server or "").strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise NtfyError("adresse du serveur ntfy invalide")
    if not body.get("topic"):
        raise NtfyError("topic ntfy manquant")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with session.post(url, json=body, headers=headers, timeout=TIMEOUT) as resp:
            if resp.status >= 400:
                detail = (await resp.text())[:200]
                raise NtfyError(f"ntfy a refusé la notification ({resp.status}) : {detail}")
    except aiohttp.ClientError as err:
        raise NtfyError(f"serveur ntfy injoignable : {err}") from err
