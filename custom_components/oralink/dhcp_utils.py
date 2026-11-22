"""État du serveur DHCP et origine des IP des appareils (sans dépendance HA).

`DHCPv4.Server:getDHCPServerPool` renvoie un dict par pool (`default`,
`guest`) avec `Enable`, `Status`, `MinAddress`/`MaxAddress`, `LeaseTime`…
`Devices.get` donne pour chaque appareil `IPAddressSource` : « DHCP » (bail de
la box), « Static » (IP réglée à la main sur l'appareil), « self » (la box
elle-même) ou vide.
"""

from __future__ import annotations

import ipaddress
from typing import Any


def pool_summary(pool: Any, domain: str = "default") -> dict[str, Any]:
    """Résumé d'un pool DHCP ; `enabled` vaut None si l'état est inconnu."""
    item = pool.get(domain) if isinstance(pool, dict) else None
    if not isinstance(item, dict):
        item = {}
    enable = item.get("Enable")
    return {
        "enabled": enable if isinstance(enable, bool) else None,
        "status": item.get("Status"),
        "server": item.get("Server"),
        "netmask": item.get("SubnetMask"),
        "start": item.get("MinAddress"),
        "end": item.get("MaxAddress"),
        "lease_time": item.get("LeaseTime"),
    }


def ip_in_range(ip: Any, start: Any, end: Any) -> bool | None:
    """`ip` dans [start, end] (IPv4) ; None si une des valeurs est inexploitable."""
    try:
        addr = ipaddress.IPv4Address(str(ip))
        low = ipaddress.IPv4Address(str(start))
        high = ipaddress.IPv4Address(str(end))
    except ValueError:
        return None
    return low <= addr <= high


def device_ip_source(mac: str, device: dict[str, Any], reserved_macs: set[str]) -> str:
    """« reserved » (bail statique), « dhcp », « manual » (IP fixée sur l'appareil) ou ""."""
    if not device.get("IPAddress"):
        return ""
    if (mac or "").upper() in reserved_macs:
        return "reserved"
    source = str(device.get("IPAddressSource") or "").lower()
    if source == "dhcp":
        return "dhcp"
    if source == "static":
        return "manual"
    return ""


def manual_ip_in_pool(source: str, ip: Any, pool: dict[str, Any]) -> bool:
    """IP réglée à la main mais dans la plage que la box distribue (risque de doublon)."""
    if source != "manual" or pool.get("enabled") is not True:
        return False
    return ip_in_range(ip, pool.get("start"), pool.get("end")) is True
