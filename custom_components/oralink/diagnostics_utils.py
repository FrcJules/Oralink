"""Pseudonymisation des adresses MAC dans les diagnostics (sans dépendance HA).

`async_redact_data` ne masque que des *valeurs* associées à des clés connues ;
or les MAC des appareils servent aussi de clés de dictionnaire (listes
d'appareils, topologie, trafic…) et apparaissent dans des chaînes. On les
remplace partout par des pseudonymes stables (« MAC_001 »…) : un même appareil
garde le même pseudonyme dans tout le fichier, ce qui laisse les diagnostics
exploitables pour déboguer sans identifier les équipements du réseau.
"""

from __future__ import annotations

import re
from typing import Any

# Pas de \b : une MAC peut être collée à « _ » (ex. "_2C:93:FB:BB:55:90_eth0").
# Avant : seul un chiffre hexa est exclu — un « : » doit rester possible pour
# les identifiants client DHCP « 01:<MAC> ». Après : ni hexa ni « : », pour ne
# pas découper une adresse IPv6 ou un identifiant plus long.
MAC_RE = re.compile(r"(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:])")


def pseudonymize_macs(data: Any) -> Any:
    """Copie de `data` où chaque MAC (clés et valeurs) est remplacée par un pseudonyme."""
    mapping: dict[str, str] = {}

    def alias(match: re.Match[str]) -> str:
        mac = match.group(0).upper().replace("-", ":")
        if mac not in mapping:
            mapping[mac] = f"MAC_{len(mapping) + 1:03d}"
        return mapping[mac]

    def walk(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {
                (MAC_RE.sub(alias, k) if isinstance(k, str) else k): walk(v)
                for k, v in obj.items()
            }
        if isinstance(obj, list):
            return [walk(v) for v in obj]
        if isinstance(obj, tuple):
            return tuple(walk(v) for v in obj)
        if isinstance(obj, str):
            return MAC_RE.sub(alias, obj)
        return obj

    return walk(data)
