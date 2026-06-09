"""Livebox custom panel — WebSocket API commands."""

from __future__ import annotations

import asyncio
import time
from uuid import uuid4

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from . import tv_decoder_api
from .const import DOMAIN


def async_setup_panel(hass: HomeAssistant) -> None:
    """Register all WebSocket commands."""
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_get_dhcp)
    websocket_api.async_register_command(hass, ws_get_nat)
    websocket_api.async_register_command(hass, ws_get_network)
    websocket_api.async_register_command(hass, ws_get_topology)
    websocket_api.async_register_command(hass, ws_get_topology_positions)
    websocket_api.async_register_command(hass, ws_set_topology_position)
    websocket_api.async_register_command(hass, ws_reset_topology_positions)
    websocket_api.async_register_command(hass, ws_get_topology_switches)
    websocket_api.async_register_command(hass, ws_set_topology_switch)
    websocket_api.async_register_command(hass, ws_remove_topology_switch)
    websocket_api.async_register_command(hass, ws_get_topology_parents)
    websocket_api.async_register_command(hass, ws_set_topology_parent)
    websocket_api.async_register_command(hass, ws_get_advanced)
    websocket_api.async_register_command(hass, ws_refresh)
    # NAT mutations
    websocket_api.async_register_command(hass, ws_nat_delete)
    websocket_api.async_register_command(hass, ws_nat_add)
    # DHCP mutations
    websocket_api.async_register_command(hass, ws_dhcp_static_add)
    websocket_api.async_register_command(hass, ws_dhcp_static_delete)
    websocket_api.async_register_command(hass, ws_dhcp_params_set)
    # Advanced read
    websocket_api.async_register_command(hass, ws_get_dns)
    websocket_api.async_register_command(hass, ws_get_upnp_rules)
    # Advanced mutations
    websocket_api.async_register_command(hass, ws_dmz_set)
    websocket_api.async_register_command(hass, ws_upnp_delete)
    websocket_api.async_register_command(hass, ws_upnp_toggle)
    websocket_api.async_register_command(hass, ws_dns_set)
    websocket_api.async_register_command(hass, ws_ddns_add)
    websocket_api.async_register_command(hass, ws_ddns_delete)
    websocket_api.async_register_command(hass, ws_ipv6_toggle)
    websocket_api.async_register_command(hass, ws_ntp_set)
    # Reboot history + ping response
    websocket_api.async_register_command(hass, ws_get_reboot_history)
    websocket_api.async_register_command(hass, ws_get_ping_response)
    websocket_api.async_register_command(hass, ws_set_ping_response)
    # Reboot
    websocket_api.async_register_command(hass, ws_reboot)
    # Device type
    websocket_api.async_register_command(hass, ws_set_device_type)
    # Repeaters (settings: IP + identifiants)
    websocket_api.async_register_command(hass, ws_get_repeaters)
    websocket_api.async_register_command(hass, ws_set_repeater)
    # Système : LEDs, écran, sauvegarde/restauration
    websocket_api.async_register_command(hass, ws_get_system)
    websocket_api.async_register_command(hass, ws_set_led)
    websocket_api.async_register_command(hass, ws_set_show_wifi_password)
    websocket_api.async_register_command(hass, ws_set_auto_backup)
    websocket_api.async_register_command(hass, ws_run_backup)
    websocket_api.async_register_command(hass, ws_run_restore)
    # Téléphone : historique d'appels + carnet de contacts
    websocket_api.async_register_command(hass, ws_get_phone)
    websocket_api.async_register_command(hass, ws_add_contact)
    websocket_api.async_register_command(hass, ws_delete_contact)
    # Graphiques de trafic (historique en mémoire)
    websocket_api.async_register_command(hass, ws_get_graphs)
    websocket_api.async_register_command(hass, ws_get_graphs_device)
    websocket_api.async_register_command(hass, ws_get_graphs_device_list)
    # Journal d'événements (connexions/déconnexions)
    websocket_api.async_register_command(hass, ws_get_events)
    # Décodeurs TV Orange (pilotage HTTP direct)
    websocket_api.async_register_command(hass, ws_get_tv_decoders)
    websocket_api.async_register_command(hass, ws_set_tv_decoder)
    websocket_api.async_register_command(hass, ws_remove_tv_decoder)
    websocket_api.async_register_command(hass, ws_discover_tv_decoders)
    websocket_api.async_register_command(hass, ws_tv_decoder_key)
    # SpeedTest
    websocket_api.async_register_command(hass, ws_speedtest_results)
    # Wake-on-LAN
    websocket_api.async_register_command(hass, ws_device_wake)
    # Time / NTP
    websocket_api.async_register_command(hass, ws_get_time)
    websocket_api.async_register_command(hass, ws_set_timezone)
    # USB / Stockage
    websocket_api.async_register_command(hass, ws_get_usb)
    websocket_api.async_register_command(hass, ws_usb3_toggle)
    # Gestion de l'énergie
    websocket_api.async_register_command(hass, ws_get_power)
    websocket_api.async_register_command(hass, ws_set_power)
    # Wifi détaillé (radios, VAP, stations)
    websocket_api.async_register_command(hass, ws_get_wifi_detail)
    websocket_api.async_register_command(hass, ws_set_wifi_radio)
    websocket_api.async_register_command(hass, ws_set_wifi_vap)
    websocket_api.async_register_command(hass, ws_kickstation)
    # Planificateur Wifi
    websocket_api.async_register_command(hass, ws_get_wifi_schedule)
    websocket_api.async_register_command(hass, ws_set_wifi_schedule)
    # WAN reconnect (PPPoE)
    websocket_api.async_register_command(hass, ws_wan_reconnect)
    # Accès distant Orange
    websocket_api.async_register_command(hass, ws_get_remote_access)
    websocket_api.async_register_command(hass, ws_set_remote_access)
    # Niveaux de pare-feu
    websocket_api.async_register_command(hass, ws_get_firewall_levels)
    websocket_api.async_register_command(hass, ws_set_firewall_level)
    # Stats interfaces live (NeMo.Intf, 3 s)
    websocket_api.async_register_command(hass, ws_get_interfaces_live)


def _get_coordinator(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        if hasattr(entry, "runtime_data"):
            return entry.runtime_data
    return None


_LIVE_IFACE_STATS_KEY = f"{DOMAIN}_live_iface_stats"
_LIVE_IFACE_LIST_KEY = f"{DOMAIN}_live_iface_list"


# ── Read commands ─────────────────────────────────────────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/devices"})
def ws_get_devices(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    devices = coordinator.data.get("devices", {})
    traffic = coordinator.data.get("device_traffic", {})

    result = []
    for mac, d in devices.items():
        t = traffic.get(mac, {})
        result.append({
            "mac": mac,
            "name": d.get("Name", mac),
            "ip": d.get("IPAddress", ""),
            "active": d.get("Active", False),
            "type": d.get("DeviceType", ""),
            "manufacturer": d.get("Manufacturer", ""),
            "interface": d.get("InterfaceName", ""),
            "band": d.get("OperatingFrequencyBand", ""),
            "signal": d.get("SignalStrength") or None,  # 0 = not measured
            "vendor": d.get("VendorClassID", ""),
            "first_seen": d.get("FirstSeen", ""),
            "last_connection": d.get("LastConnection", ""),
            "rate_rx": t.get("rate_rx"),
            "rate_tx": t.get("rate_tx"),
        })

    result.sort(key=lambda d: (not d["active"], d["name"].lower()))
    connection.send_result(msg["id"], result)


def _normalize_lease(lease: dict) -> dict:
    """Normalize a coordinator lease dict (display-style keys with spaces) for the panel."""
    return {
        "name": lease.get("Name") or "",
        "ip": lease.get("IP Address") or "",
        "mac": lease.get("Mac Address") or "",
        "reserved": lease.get("Reserved", False),
        "active": lease.get("Enable", False),
    }


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/dhcp"})
def ws_get_dhcp(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    data = coordinator.data
    # MAC → nom connu, pour remplir les baux statiques qui n'ont pas de nom
    # côté Livebox (DHCPv4.getLeases ne retourne pas le FriendlyName pour eux).
    mac_to_name: dict[str, str] = {
        mac.lower(): d.get("Name", "")
        for mac, d in data.get("devices", {}).items()
        if d.get("Name")
    }

    def _normalize_with_fallback(lease: dict) -> dict:
        name = lease.get("Name") or ""
        mac = (lease.get("Mac Address") or "").lower()
        if not name and mac:
            name = mac_to_name.get(mac, "")
        return {
            "name": name,
            "ip": lease.get("IP Address") or "",
            "mac": lease.get("Mac Address") or "",
            "reserved": lease.get("Reserved", False),
            "active": lease.get("Enable", False),
        }

    connection.send_result(msg["id"], {
        "active": [_normalize_lease(l) for l in data.get("dhcp_leases", [])],
        "guest": [_normalize_lease(l) for l in data.get("guest_dhcp_leases", [])],
        "static": [_normalize_with_fallback(l) for l in data.get("dhcp_static_leases", [])],
    })


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/nat"})
def ws_get_nat(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    all_rules = coordinator.data.get("upnp", [])
    # Only manual (webui-created) rules for the NAT tab
    webui = [r for r in all_rules if str(r.get("id", "")).startswith("webui_")]
    connection.send_result(msg["id"], webui if webui else all_rules)


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/network"})
@websocket_api.async_response
async def ws_get_network(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    data = coordinator.data
    fiber = data.get("fiber_status", {})
    wan = data.get("wan_status", {})
    counters = data.get("wan_counters", {})
    infos = data.get("infos", {}) or {}

    # Memory: DeviceInfo.MemoryStatus:get — values in kB
    mem_raw = await _safe_post(coordinator, "DeviceInfo.MemoryStatus", "get")
    mem = mem_raw if isinstance(mem_raw, dict) else {}
    memory = {
        "total_mb": round(mem["Total"] / 1024, 0) if mem.get("Total") else None,
        "free_mb": round(mem["Free"] / 1024, 0) if mem.get("Free") else None,
        "cached_mb": round(mem["Cached"] / 1024, 0) if mem.get("Cached") else None,
        "buffered_mb": round(mem["Buffered"] / 1024, 0) if mem.get("Buffered") else None,
    }

    # Service active flags: Devices.Device.<mac>:get
    base_mac = infos.get("BaseMAC", "")
    dev_config = {}
    if base_mac:
        raw = await _safe_post(coordinator, f"Devices.Device.{base_mac}", "get")
        if isinstance(raw, dict):
            dev_config = raw

    connection.send_result(msg["id"], {
        "interfaces": [
            {"name": v.get("friendly_name", k), "rate_rx": v.get("rate_rx", 0), "rate_tx": v.get("rate_tx", 0)}
            for k, v in data.get("stats", {}).items()
        ],
        "fiber": {
            "power_rx": round(fiber["SignalRxPower"] / 1000, 2) if fiber.get("SignalRxPower") else None,
            "power_tx": round(fiber["SignalTxPower"] / 1000, 2) if fiber.get("SignalTxPower") else None,
            "temperature": fiber.get("Temperature"),
            "onu_state": fiber.get("OnuState"),
            "downstream_max": round(fiber["DownstreamMaxRate"] / 1000, 0) if fiber.get("DownstreamMaxRate") else None,
            "upstream_max": round(fiber["UpstreamMaxRate"] / 1000, 0) if fiber.get("UpstreamMaxRate") else None,
        },
        "wan": {
            "state": wan.get("WanState"),
            "link_type": wan.get("LinkType"),
            "ip": wan.get("IPAddress"),
            "ipv6": wan.get("IPv6Address"),
            "gateway": wan.get("RemoteGateway"),
            "dns": wan.get("DNSServers"),
            "total_rx_gb": round(counters["BytesReceived"] / 1e9, 2) if counters.get("BytesReceived") else None,
            "total_tx_gb": round(counters["BytesSent"] / 1e9, 2) if counters.get("BytesSent") else None,
        },
        "box": {
            "model": infos.get("ProductClass"),
            "model_name": infos.get("ModelName"),
            "manufacturer": infos.get("Manufacturer"),
            "hardware_version": infos.get("HardwareVersion"),
            "firmware": infos.get("SoftwareVersion"),
            "firmware_orange": infos.get("AdditionalSoftwareVersion"),
            "serial": infos.get("SerialNumber"),
            "base_mac": infos.get("BaseMAC"),
            "country": infos.get("Country"),
            "uptime_days": round(infos.get("UpTime", 0) / 86400, 1),
            "reboots": infos.get("NumberOfReboots"),
            "first_use": infos.get("FirstUseDate"),
            "external_ip": infos.get("ExternalIPAddress"),
            "device_status": infos.get("DeviceStatus"),
            "rescue_version": infos.get("RescueVersion"),
            "wired_devices": data.get("count_wired_devices", 0),
            "wireless_devices": data.get("count_wireless_devices", 0),
        },
        "memory": memory,
        "services": {
            "internet": dev_config.get("Internet"),
            "iptv": dev_config.get("IPTV"),
            "telephony": dev_config.get("Telephony"),
        },
    })


@websocket_api.websocket_command({vol.Required("type"): "livebox/interfaces/live"})
@websocket_api.async_response
async def ws_get_interfaces_live(hass, connection, msg):
    """Live per-interface stats: rates every 3 s via NeMo.Intf.<key>:getNetDevStats."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    now = time.monotonic()

    # Interface list from HomeLan.Interface:get — cached 5 min
    iface_cache = hass.data.get(_LIVE_IFACE_LIST_KEY)
    if iface_cache is None or (now - iface_cache["ts"]) > 300:
        raw_list = await _safe_post(coordinator, "HomeLan.Interface", "get")
        ifaces: dict[str, dict] = {}
        ifaces["bridge"] = {"name": "LAN", "type": "lan"}
        if isinstance(raw_list, dict):
            for k, v in raw_list.items():
                if not isinstance(v, dict):
                    continue
                alias = v.get("Alias", "")
                fname = v.get("FriendlyName", k)
                if alias == "Eth":
                    ifaces[k] = {"name": fname, "type": "eth"}
                elif alias == "WiFi":
                    ifaces[k] = {"name": fname, "type": "wig" if "Guest" in fname else "wif"}
                elif fname in ("WAN_GPON", "WAN_XGSPON"):
                    ifaces[k] = {"name": fname, "type": "ont"}
                elif fname == "WAN_Ethernet":
                    ifaces[k] = {"name": fname, "type": "wan"}
        iface_cache = {"ts": now, "ifaces": ifaces}
        hass.data[_LIVE_IFACE_LIST_KEY] = iface_cache

    ifaces = iface_cache["ifaces"]
    prev_all = hass.data.get(_LIVE_IFACE_STATS_KEY, {})
    new_prev: dict[str, dict] = {}
    results = []

    # Fetch all interfaces concurrently
    async def _fetch(key: str):
        return key, await _safe_post(coordinator, f"NeMo.Intf.{key}", "getNetDevStats")

    raw_stats = await asyncio.gather(*[_fetch(k) for k in ifaces])

    for key, stats in raw_stats:
        meta = ifaces[key]
        if not isinstance(stats, dict):
            new_prev[key] = prev_all.get(key, {})
            continue

        rx = stats.get("RxBytes") or stats.get("BytesReceived") or 0
        tx = stats.get("TxBytes") or stats.get("BytesSent") or 0

        rate_rx = rate_tx = None
        p = prev_all.get(key, {})
        if p.get("ts") is not None:
            dt = now - p["ts"]
            if dt >= 0.5:
                drx = rx - p.get("rx", 0)
                dtx = tx - p.get("tx", 0)
                # 32-bit counters wrap at 2^32 bytes
                if drx < 0:
                    drx += 2**32
                if dtx < 0:
                    dtx += 2**32
                rate_rx = round(drx / dt / 125000, 3)  # bytes/s → Mbit/s
                rate_tx = round(dtx / dt / 125000, 3)

        new_prev[key] = {"rx": rx, "tx": tx, "ts": now}

        entry: dict = {
            "key": key,
            "name": meta["name"],
            "type": meta["type"],
            "rx_bytes": rx,
            "tx_bytes": tx,
        }
        if rate_rx is not None:
            entry["rate_rx"] = rate_rx
            entry["rate_tx"] = rate_tx
        results.append(entry)

    hass.data[_LIVE_IFACE_STATS_KEY] = new_prev
    connection.send_result(msg["id"], results)


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/topology"})
def ws_get_topology(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    data = coordinator.data
    connection.send_result(msg["id"], {
        "repeaters": [{"key": k, "name": v} for k, v in data.get("topology_repeaters", {}).items()],
        "device_map": [{"device": k, "via": v} for k, v in data.get("topology_via_device", {}).items()],
    })


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/topology/positions"})
def ws_get_topology_positions(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.topology_store.positions)


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/topology/positions/set",
    vol.Required("node_id"): str,
    vol.Required("x"): vol.Coerce(float),
    vol.Required("y"): vol.Coerce(float),
})
@websocket_api.async_response
async def ws_set_topology_position(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    await coordinator.topology_store.async_set_position(msg["node_id"], msg["x"], msg["y"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "livebox/topology/positions/reset"})
@websocket_api.async_response
async def ws_reset_topology_positions(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    await coordinator.topology_store.async_reset_positions()
    connection.send_result(msg["id"])


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/topology/switches"})
def ws_get_topology_switches(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.topology_store.switches)


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/topology/switches/set",
    vol.Optional("switch_id"): str,
    vol.Required("name"): str,
    vol.Optional("parent"): vol.Any(str, None),
    vol.Required("devices"): [str],
})
@websocket_api.async_response
async def ws_set_topology_switch(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    switch_id = msg.get("switch_id") or f"custom-switch-{uuid4().hex[:10]}"
    await coordinator.topology_store.async_set_switch(
        switch_id, name=msg["name"], parent=msg.get("parent") or None, devices=msg["devices"]
    )
    connection.send_result(msg["id"], {"switch_id": switch_id})


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/topology/switches/remove",
    vol.Required("switch_id"): str,
})
@websocket_api.async_response
async def ws_remove_topology_switch(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    await coordinator.topology_store.async_remove_switch(msg["switch_id"])
    connection.send_result(msg["id"])


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/topology/parents"})
def ws_get_topology_parents(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.topology_store.parent_overrides)


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/topology/parent/set",
    vol.Required("mac"): str,
    vol.Optional("parent"): vol.Any(str, None),
})
@websocket_api.async_response
async def ws_set_topology_parent(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    await coordinator.topology_store.async_set_parent(msg["mac"], msg.get("parent") or None)
    connection.send_result(msg["id"])


# ── Refresh ───────────────────────────────────────────────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/refresh"})
def ws_refresh(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator:
        hass.async_create_task(coordinator.async_request_refresh())
    connection.send_result(msg["id"], {"status": "refreshing"})


# ── NAT mutations ─────────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    vol.Required("type"): "livebox/nat/delete",
    vol.Required("rule_id"): str,
})
@websocket_api.async_response
async def ws_nat_delete(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    rule_id = msg["rule_id"]
    # Rule IDs are formatted as "{origin}_{description}" e.g. "webui_WOLPC"
    origin, _, name = rule_id.partition("_")
    try:
        await coordinator._make_request(
            coordinator.api.firewall.async_delete_port_forwarding,
            {"origin": origin or "webui", "id": name or rule_id},
        )
        await coordinator._make_request(coordinator.api.firewall.async_commit)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "deleted"})
    except Exception as err:
        connection.send_error(msg["id"], "delete_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/nat/add",
    vol.Required("name"): str,
    vol.Required("protocol"): str,
    vol.Required("external_port"): str,
    vol.Required("internal_port"): str,
    vol.Required("destination_ip"): str,
})
@websocket_api.async_response
async def ws_nat_add(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.firewall.async_set_port_forwarding,
            {
                "origin": "webui",
                "sourceInterface": "data",
                "protocol": msg["protocol"],
                "externalPort": msg["external_port"],
                "internalPort": msg["internal_port"],
                "destinationIPAddress": msg["destination_ip"],
                "destinationMACAddress": "",
                "description": msg["name"],
                "enable": True,
                "persistent": True,
            },
        )
        await coordinator._make_request(coordinator.api.firewall.async_commit)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "added"})
    except Exception as err:
        connection.send_error(msg["id"], "add_failed", str(err))


# ── DHCP static lease mutations ───────────────────────────────────────────────

@websocket_api.websocket_command({
    vol.Required("type"): "livebox/dhcp_static/add",
    vol.Required("ip"): str,
    vol.Required("mac"): str,
    vol.Optional("name", default=""): str,
})
@websocket_api.async_response
async def ws_dhcp_static_add(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        # Normalize MAC: uppercase, colons (Livebox rejects lowercase/dashes)
        mac = msg["mac"].upper().replace("-", ":").strip()
        params = {"MACAddress": mac, "IPAddress": msg["ip"].strip()}
        await coordinator.api.dhcp._auth.post(
            "DHCPv4.Server.Pool.default", "addStaticLease", params
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "added"})
    except Exception as err:
        connection.send_error(msg["id"], "add_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/dhcp_static/delete",
    vol.Required("mac"): str,
})
@websocket_api.async_response
async def ws_dhcp_static_delete(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.dhcp.async_del_dhcp_staticlease,
            {"MACAddress": msg["mac"]},
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "deleted"})
    except Exception as err:
        connection.send_error(msg["id"], "delete_failed", str(err))


# ── Advanced / extra config ────────────────────────────────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/advanced"})
def ws_get_advanced(hass, connection, msg):
    """Return advanced network config from coordinator cache."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    data = coordinator.data
    wan  = data.get("wan_status", {})
    nmc  = data.get("nmc", {})
    # ddns is a list of host entries — normalize field names
    raw_ddns = data.get("ddns", [])
    ddns_list = [
        {
            "service":     h.get("service") or h.get("Service", ""),
            "hostname":    h.get("hostname") or h.get("Hostname", ""),
            "username":    h.get("username") or h.get("Login") or h.get("Username", ""),
            "status":      h.get("status") or h.get("Status", ""),
            "last_update": h.get("last_update") or h.get("LastUpdate") or h.get("UpdateTime", ""),
        }
        for h in raw_ddns
    ]
    infos = data.get("infos", {})

    # Separate webui NAT rules from auto-created UPnP rules
    all_rules = data.get("upnp", [])
    upnp_rules = [r for r in all_rules if not str(r.get("id", "")).startswith("webui_")]

    connection.send_result(msg["id"], {
        "dns": {
            "servers":      wan.get("DNSServers", ""),
            "ipv6_servers": wan.get("IPv6DNSServers", ""),
        },
        "ddns": {
            "hosts": ddns_list,
        },
        "dmz": {
            "enabled": nmc.get("DMZEnable", False),
            "ip":      nmc.get("DMZAddress", ""),
        },
        "upnp": {
            "enabled": data.get("upnp_igd", {}).get("Enable", False),
            "rules":   upnp_rules,
        },
        "ipv6": {
            "address": wan.get("IPv6Address", ""),
            "prefix":  wan.get("IPv6Prefix", ""),
            "gateway": wan.get("IPv6Gateway", ""),
            "enabled": bool(wan.get("IPv6Address")),
        },
        "ntp": {
            "timezone":    nmc.get("TimeZone", ""),
            "current_time": "",  # set by frontend if needed
        },
        "dhcp_params": {
            "enabled":   nmc.get("DHCPEnable", True),
            "server_ip": nmc.get("IPAddress", "192.168.1.1"),
            "subnet":    nmc.get("SubnetMask", "255.255.255.0"),
            "start_ip":  nmc.get("DHCPStartIPAddress", ""),
            "end_ip":    nmc.get("DHCPEndIPAddress", ""),
        },
        "box": {
            "model":    infos.get("ProductClass", ""),
            "firmware": infos.get("SoftwareVersion", ""),
            "serial":   infos.get("SerialNumber", ""),
        },
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/dmz/set",
    vol.Required("ip"): str,
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_dmz_set(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.firewall.async_set_dmz,
            {"sourceInterface": "data", "destinationIPAddress": msg["ip"], "enable": msg["enabled"]},
        )
        await coordinator._make_request(coordinator.api.firewall.async_commit)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "dmz_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/upnp/delete",
    vol.Required("rule_id"): str,
})
@websocket_api.async_response
async def ws_upnp_delete(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        rule_id = msg["rule_id"]
        origin, _, name = rule_id.partition("_")
        await coordinator._make_request(
            coordinator.api.firewall.async_delete_port_forwarding,
            {"origin": origin or "upnp", "id": name or rule_id},
        )
        await coordinator._make_request(coordinator.api.firewall.async_commit)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "deleted"})
    except Exception as err:
        connection.send_error(msg["id"], "upnp_delete_failed", str(err))


# ── Advanced read commands ─────────────────────────────────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/dns"})
def ws_get_dns(hass, connection, msg):
    """Return per-device DNS hostname assignments from coordinator cache."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    devices = coordinator.data.get("devices", {})
    result = []
    for mac, d in devices.items():
        result.append({
            "mac": mac,
            "name": d.get("Name", mac),
            "ip": d.get("IPAddress", ""),
            "dns_name": d.get("HostName") or d.get("DNSName") or d.get("UserFriendlyName") or "",
        })
    result.sort(key=lambda x: x["name"].lower())
    connection.send_result(msg["id"], result)


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/upnp/rules"})
def ws_get_upnp_rules(hass, connection, msg):
    """Return auto-created UPnP IGD rules (not webui/manual rules)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    all_rules = coordinator.data.get("upnp", [])
    upnp = [r for r in all_rules if not str(r.get("id", "")).startswith("webui_")]
    connection.send_result(msg["id"], upnp)


# ── Advanced write commands ────────────────────────────────────────────────────

@websocket_api.websocket_command({
    vol.Required("type"): "livebox/dns/set",
    vol.Required("mac"): str,
    vol.Required("hostname"): str,
})
@websocket_api.async_response
async def ws_dns_set(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        mac = msg["mac"]
        name = msg["hostname"]
        # setName with no source sets the "webui" label, visible everywhere in Oralink
        await coordinator.api.devices._auth.post(
            f"Devices.Device.{mac}", "setName", {"name": name}
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "dns_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/upnp/toggle",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_upnp_toggle(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.upnpigd.async_set({"Enable": msg["enabled"]})
        # Relire l'état confirmé immédiatement après le set (sans attendre
        # le cycle coordinator) pour que le frontend puisse se mettre à jour
        # sans dépendre du timing de async_request_refresh.
        confirmed = (await coordinator.api.upnpigd.async_get()).get("status", {}).get(
            "Enable", msg["enabled"]
        )
        hass.async_create_task(coordinator.async_request_refresh())
        connection.send_result(msg["id"], {"enabled": confirmed})
    except Exception as err:
        connection.send_error(msg["id"], "upnp_toggle_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/ddns/add",
    vol.Required("service"): str,
    vol.Required("hostname"): str,
    vol.Required("username"): str,
    vol.Required("password"): str,
})
@websocket_api.async_response
async def ws_ddns_add(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.dyndns.async_add_host,
            {
                "service": msg["service"],
                "hostname": msg["hostname"],
                "username": msg["username"],
                "password": msg["password"],
            },
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "added"})
    except Exception as err:
        connection.send_error(msg["id"], "ddns_add_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/ddns/delete",
    vol.Required("service"): str,
    vol.Required("hostname"): str,
})
@websocket_api.async_response
async def ws_ddns_delete(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.dyndns.async_del_host,
            {"hostname": msg["hostname"]},
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "deleted"})
    except Exception as err:
        connection.send_error(msg["id"], "ddns_delete_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/ipv6/toggle",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_ipv6_toggle(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.nmc.async_set_IPv6,
            {"Enable": msg["enabled"]},
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "ipv6_toggle_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/ntp/set",
    vol.Required("timezone"): str,
})
@websocket_api.async_response
async def ws_ntp_set(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.nmc.async_set,
            {"TimeZone": msg["timezone"]},
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "ntp_set_failed", str(err))


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/reboot_history"})
def ws_get_reboot_history(hass, connection, msg):
    """Return cached reboot history."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.data.get("reboot_history", []))


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/ping_response"})
def ws_get_ping_response(hass, connection, msg):
    """Return cached ping response settings."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.data.get("ping_response", {"ipv4": False, "ipv6": False}))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/ping_response/set",
    vol.Required("ipv4"): bool,
    vol.Required("ipv6"): bool,
})
@websocket_api.async_response
async def ws_set_ping_response(hass, connection, msg):
    """Enable or disable ping responses (IPv4/IPv6)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.firewall.async_set_respond_ping,
            {
                "sourceInterface": "data",
                "service_enable": {"enableIPv4": msg["ipv4"], "enableIPv6": msg["ipv6"]},
            },
        )
        await coordinator._make_request(coordinator.api.firewall.async_commit)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "ping_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/device/type/set",
    vol.Required("mac"): str,
    vol.Required("device_type"): str,
})
@websocket_api.async_response
async def ws_set_device_type(hass, connection, msg):
    """Change a device type on the Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        mac = msg["mac"]
        device_type = msg["device_type"]
        await coordinator.api.devices._auth.post(
            f"Devices.Device.{mac}", "setType", {"type": device_type}
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "device_type_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): "livebox/reboot"})
@websocket_api.async_response
async def ws_reboot(hass, connection, msg):
    """Reboot the Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator._make_request(
            coordinator.api.nmc.async_reboot,
            {"reason": "GUI_Reboot"},
        )
        connection.send_result(msg["id"], {"status": "rebooting"})
    except Exception as err:
        connection.send_error(msg["id"], "reboot_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/dhcp/params/set",
    vol.Optional("start_ip"): str,
    vol.Optional("end_ip"): str,
    vol.Optional("enabled"): bool,
})
@websocket_api.async_response
async def ws_dhcp_params_set(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        params = {}
        if "start_ip" in msg:
            params["DHCPStartIPAddress"] = msg["start_ip"]
        if "end_ip" in msg:
            params["DHCPEndIPAddress"] = msg["end_ip"]
        if "enabled" in msg:
            params["DHCPEnable"] = msg["enabled"]
        if params:
            await coordinator._make_request(coordinator.api.nmc.async_set, params)
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "dhcp_params_failed", str(err))


# ── Repeaters (settings: IP + identifiants de connexion) ──────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/repeaters"})
def ws_get_repeaters(hass, connection, msg):
    """Liste les répéteurs détectés (topologie) avec leurs paramètres connus."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    repeaters = coordinator.data.get("topology_repeaters", {})
    store = coordinator.repeater_store
    result = [
        {
            "key": key,
            "name": name,
            "ip": store.get(key).get("ip", ""),
            "username": store.get(key).get("username", ""),
            "has_password": bool(store.get(key).get("password")),
        }
        for key, name in repeaters.items()
    ]
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/repeaters/set",
    vol.Required("key"): str,
    vol.Optional("ip"): str,
    vol.Optional("username"): str,
    vol.Optional("password"): str,
})
@websocket_api.async_response
async def ws_set_repeater(hass, connection, msg):
    """Enregistre l'IP et/ou les identifiants de connexion d'un répéteur (JSON persistant)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.repeater_store.async_set(
            msg["key"],
            ip=msg.get("ip"),
            username=msg.get("username"),
            password=msg.get("password"),
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "repeater_set_failed", str(err))


# ── Système : LEDs, écran, sauvegarde/restauration ────────────────────────────

async def _safe_post(coordinator, obj, fn, conf=None):
    """Appel direct à l'API sysbus, tolérant aux objets absents sur certains modèles."""
    try:
        if conf is not None:
            raw = await coordinator.api.devices._auth.post(obj, fn, conf)
        else:
            raw = await coordinator.api.devices._auth.post(obj, fn)
        return raw.get("status") if isinstance(raw, dict) else raw
    except Exception:
        return None


@websocket_api.websocket_command({vol.Required("type"): "livebox/system"})
@websocket_api.async_response
async def ws_get_system(hass, connection, msg):
    """État des LEDs, de l'affichage du mot de passe Wifi et de la sauvegarde réseau."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    led_orange = await _safe_post(coordinator, "LEDs.LED.Orange", "get")
    led_white = await _safe_post(coordinator, "LEDs.LED.White", "get")
    show_wifi_password = await _safe_post(coordinator, "Screen", "getShowWifiPassword")
    backup = (await coordinator._make_request(coordinator.api.nmc.async_get_network)).get("status", {})
    if not isinstance(backup, dict):
        backup = {}

    connection.send_result(msg["id"], {
        "led_orange": led_orange.get("Brightness") if isinstance(led_orange, dict) else None,
        "led_white": led_white.get("Brightness") if isinstance(led_white, dict) else None,
        "show_wifi_password": (
            show_wifi_password.get("Enable") if isinstance(show_wifi_password, dict) else show_wifi_password
        ),
        "backup": {
            "auto_enabled": backup.get("Enable", False),
            "status": backup.get("Status", ""),
            "last_backup": backup.get("ConfigDate", ""),
        },
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/led/set",
    vol.Required("led"): vol.In(["orange", "white"]),
    vol.Required("brightness"): vol.All(int, vol.Range(min=0, max=100)),
})
@websocket_api.async_response
async def ws_set_led(hass, connection, msg):
    """Règle la luminosité d'une LED de la Livebox (0-100)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    obj = "LEDs.LED.Orange" if msg["led"] == "orange" else "LEDs.LED.White"
    try:
        await coordinator.api.devices._auth.post(obj, "set", {"Brightness": msg["brightness"]})
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "led_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/show_wifi_password/set",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_set_show_wifi_password(hass, connection, msg):
    """Active/désactive l'affichage du mot de passe Wifi sur l'écran de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.screen.async_set_show_wifi_password({"Enable": msg["enabled"]})
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "show_wifi_password_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/backup/auto/set",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_set_auto_backup(hass, connection, msg):
    """Active/désactive la sauvegarde automatique de la configuration réseau."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.nmc.async_enable_network_bridge({"state": msg["enabled"]})
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "auto_backup_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): "livebox/system/backup/run"})
@websocket_api.async_response
async def ws_run_backup(hass, connection, msg):
    """Lance une sauvegarde immédiate de la configuration réseau."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.nmc.async_backup_network({"delay": True})
        connection.send_result(msg["id"], {"status": "requested"})
    except Exception as err:
        connection.send_error(msg["id"], "backup_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): "livebox/system/restore/run"})
@websocket_api.async_response
async def ws_run_restore(hass, connection, msg):
    """Lance la restauration de la configuration réseau depuis la dernière sauvegarde."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.nmc.async_restore_network()
        connection.send_result(msg["id"], {"status": "requested"})
    except Exception as err:
        connection.send_error(msg["id"], "restore_failed", str(err))


# ── Téléphone : historique d'appels + carnet de contacts ─────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/phone"})
def ws_get_phone(hass, connection, msg):
    """Historique d'appels (cache coordinator) + carnet de contacts (cache coordinator)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], {
        "callers": coordinator.data.get("callers", []),
        "missed": coordinator.data.get("cmissed", []),
        "contacts": coordinator.data.get("contacts", []),
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/phone/contacts/add",
    vol.Required("name"): str,
    vol.Optional("first_name", default=""): str,
    vol.Optional("cell"): str,
    vol.Optional("home"): str,
    vol.Optional("work"): str,
})
@websocket_api.async_response
async def ws_add_contact(hass, connection, msg):
    """Ajoute un contact au carnet d'adresses de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    numbers = []
    for number, kind in (
        (msg.get("cell"), "CELL"),
        (msg.get("home"), "HOME"),
        (msg.get("work"), "WORK"),
    ):
        if number:
            numbers.append({"name": number, "type": kind, "preferred": False})
    contact = {
        "name": f"N:{msg['name']};{msg.get('first_name', '')};",
        "formattedName": f"{msg.get('first_name', '')} {msg['name']}".strip(),
        "telephoneNumbers": numbers,
    }
    try:
        await coordinator.api.phonebook.async_add_contact_uuid({"contact": contact})
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "contact_add_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/phone/contacts/delete",
    vol.Required("unique_id"): str,
})
@websocket_api.async_response
async def ws_delete_contact(hass, connection, msg):
    """Supprime un contact du carnet d'adresses de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.phonebook.async_del_contact_uid({"uniqueID": msg["unique_id"]})
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "contact_delete_failed", str(err))


# ── Graphiques de trafic (historique en mémoire) ─────────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/graphs"})
def ws_get_graphs(hass, connection, msg):
    """Historique de trafic agrégé collecté en mémoire (~12h, un point par minute)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.traffic_history)


@callback
@websocket_api.websocket_command({
    vol.Required("type"): "livebox/graphs/device",
    vol.Required("mac"): str,
})
def ws_get_graphs_device(hass, connection, msg):
    """Historique de trafic par appareil (keyed by MAC, oldest first)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.get_device_history(msg["mac"]))


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/graphs/devices"})
def ws_get_graphs_device_list(hass, connection, msg):
    """Liste des appareils pour lesquels un historique de trafic est disponible."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    devices = coordinator.data.get("devices", {})
    result = []
    for mac in coordinator.device_history_keys:
        d = devices.get(mac, {})
        result.append({
            "mac": mac,
            "name": d.get("Name", mac),
        })
    result.sort(key=lambda x: x["name"].lower())
    connection.send_result(msg["id"], result)


# ── Journal d'événements (connexions/déconnexions) ───────────────────────────

@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/events"})
def ws_get_events(hass, connection, msg):
    """Journal des connexions/déconnexions d'appareils détectées en mémoire."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    connection.send_result(msg["id"], coordinator.event_log)


# ── Décodeurs TV Orange (pilotage HTTP direct, hors API sysbus) ─────────────
#
# Le décodeur n'apparaît dans aucune API Livebox : on ne connaît son IP que si
# l'utilisateur la saisit, ou si on la retrouve en sondant les appareils LAN
# actifs déjà connus du coordinator (cf. `ws_discover_tv_decoders`).

TV_DECODER_STATUS_TIMEOUT = 3


async def _probe_tv_decoder(session, mac, name, ip):
    """Sonde un décodeur connu et renvoie sa fiche enrichie de son statut courant."""
    entry = {"mac": mac, "name": name, "ip": ip, "online": False, "status": None}
    try:
        data = await tv_decoder_api.async_get_status(session, ip)
        entry["online"] = True
        entry["status"] = {
            "channel": data.get("osdContext"),
            "media_type": data.get("playedMediaType"),
            "media_state": data.get("playedMediaState"),
        }
    except tv_decoder_api.TvDecoderError:
        pass
    return entry


@websocket_api.websocket_command({vol.Required("type"): "livebox/tvdecoders"})
@websocket_api.async_response
async def ws_get_tv_decoders(hass, connection, msg):
    """Liste les décodeurs TV configurés, avec leur statut courant (sondage HTTP)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    session = async_get_clientsession(hass)
    decoders = coordinator.tv_decoder_store.data
    results = await asyncio.gather(*(
        _probe_tv_decoder(session, mac, entry.get("name", mac), entry.get("ip", ""))
        for mac, entry in decoders.items()
    ))
    connection.send_result(msg["id"], results)


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/tvdecoders/set",
    vol.Required("mac"): str,
    vol.Required("name"): str,
    vol.Required("ip"): str,
})
@websocket_api.async_response
async def ws_set_tv_decoder(hass, connection, msg):
    """Ajoute ou met à jour un décodeur TV (nom + IP, persistés en JSON)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.tv_decoder_store.async_set(
            msg["mac"], name=msg["name"].strip(), ip=msg["ip"].strip()
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "tv_decoder_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/tvdecoders/remove",
    vol.Required("mac"): str,
})
@websocket_api.async_response
async def ws_remove_tv_decoder(hass, connection, msg):
    """Oublie un décodeur TV configuré."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.tv_decoder_store.async_remove(msg["mac"])
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "tv_decoder_remove_failed", str(err))


@websocket_api.websocket_command({vol.Required("type"): "livebox/tvdecoders/discover"})
@websocket_api.async_response
async def ws_discover_tv_decoders(hass, connection, msg):
    """Sonde les appareils LAN actifs connus pour repérer des décodeurs TV.

    ⚠️ Le décodeur doit être allumé (hors veille) pour répondre — un appareil
    qui ne répond pas n'est donc pas forcément exclu, juste injoignable au
    moment du sondage.
    """
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    session = async_get_clientsession(hass)
    known_macs = set(coordinator.tv_decoder_store.data)
    candidates = [
        (mac, device.get("Name") or mac, device.get("IPAddress"))
        for mac, device in coordinator.data.get("devices", {}).items()
        if device.get("Active") and device.get("IPAddress") and mac not in known_macs
    ]

    async def _check(mac, name, ip):
        if await tv_decoder_api.async_probe(session, ip) is not None:
            return {"mac": mac, "name": name, "ip": ip}
        return None

    results = await asyncio.gather(*(_check(mac, name, ip) for mac, name, ip in candidates))
    connection.send_result(msg["id"], [r for r in results if r is not None])


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/tvdecoders/key",
    vol.Required("mac"): str,
    vol.Required("key"): vol.In(tv_decoder_api.KEYS),
})
@websocket_api.async_response
async def ws_tv_decoder_key(hass, connection, msg):
    """Envoie un appui de touche de télécommande virtuelle à un décodeur TV."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    decoder = coordinator.tv_decoder_store.data.get(msg["mac"])
    if decoder is None or not decoder.get("ip"):
        connection.send_error(msg["id"], "not_found", "Décodeur inconnu")
        return
    try:
        session = async_get_clientsession(hass)
        await tv_decoder_api.async_key_press(session, decoder["ip"], tv_decoder_api.KEYS[msg["key"]])
        connection.send_result(msg["id"], {"status": "ok"})
    except tv_decoder_api.TvDecoderError as err:
        connection.send_error(msg["id"], "tv_decoder_key_failed", str(err))


# ── SpeedTest ─────────────────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/speedtest/results"})
@websocket_api.async_response
async def ws_speedtest_results(hass, connection, msg):
    """Retourne les derniers résultats de speedtest mémorisés par la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    raw = await _safe_post(coordinator, "SpeedTest", "getWANResults")
    if not isinstance(raw, dict):
        connection.send_result(msg["id"], {"no_data": True})
        return

    def _clean_direction(d: dict) -> dict | None:
        if not isinstance(d, dict):
            return None
        rate = d.get("rate") or 0
        start = d.get("start") or ""
        if rate == 0 and start in ("", "0001-01-01T00:00:00Z"):
            return None
        return {
            "rate_mbit": round(rate / 1_000_000, 2) if rate > 1_000_000 else round(rate / 1000, 2),
            "latency_ms": d.get("latency"),
            "start": start,
            "end": d.get("end"),
        }

    ds = _clean_direction(raw.get("Downstream") or raw.get("downstream"))
    us = _clean_direction(raw.get("Upstream") or raw.get("upstream"))
    if ds is None and us is None:
        connection.send_result(msg["id"], {"no_data": True})
        return
    connection.send_result(msg["id"], {"downstream": ds, "upstream": us})


# ── Wake-on-LAN ───────────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    vol.Required("type"): "livebox/device/wake",
    vol.Required("mac"): str,
})
@websocket_api.async_response
async def ws_device_wake(hass, connection, msg):
    """Envoie un paquet Wake-on-LAN à un appareil via la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "WOL", "sendWakeOnLan", {"hostID": msg["mac"]}
        )
        connection.send_result(msg["id"], {"status": "sent"})
    except Exception as err:
        connection.send_error(msg["id"], "wol_failed", str(err))


# ── Heure / NTP ───────────────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/system/time"})
@websocket_api.async_response
async def ws_get_time(hass, connection, msg):
    """Retourne l'heure locale, le fuseau horaire et les serveurs NTP de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    time_raw = await _safe_post(coordinator, "Time", "getTime")
    ntp_raw = await _safe_post(coordinator, "Time", "getNTPServers")
    status_raw = await _safe_post(coordinator, "Time", "getStatus")
    connection.send_result(msg["id"], {
        "local_time": time_raw.get("LocalTime") if isinstance(time_raw, dict) else None,
        "utc_time": time_raw.get("UTCTime") if isinstance(time_raw, dict) else None,
        "timezone": time_raw.get("LocalTimeZoneName") if isinstance(time_raw, dict) else None,
        "ntp_servers": ntp_raw if isinstance(ntp_raw, (list, dict)) else [],
        "ntp_status": status_raw.get("Status") if isinstance(status_raw, dict) else None,
        "ntp_synced": status_raw.get("NTPSync") if isinstance(status_raw, dict) else None,
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/time/set",
    vol.Required("timezone"): str,
})
@websocket_api.async_response
async def ws_set_timezone(hass, connection, msg):
    """Change le fuseau horaire de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "Time", "setLocalTimeZoneName", {"timezone": msg["timezone"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "timezone_set_failed", str(err))


# ── USB / Stockage ────────────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/system/usb"})
@websocket_api.async_response
async def ws_get_usb(hass, connection, msg):
    """Retourne les périphériques USB et les volumes de stockage connectés."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    mediums = await _safe_post(coordinator, "StorageService", "getPhysicalMediums")
    hosts = await _safe_post(coordinator, "USBHosts", "getDevices")
    connection.send_result(msg["id"], {
        "mediums": mediums if isinstance(mediums, list) else [],
        "hosts": hosts if isinstance(hosts, list) else [],
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/usb3/toggle",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_usb3_toggle(hass, connection, msg):
    """Active ou désactive le port USB 3.0 de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "USBHosts", "enableUSB3", {"enable": msg["enabled"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "usb3_toggle_failed", str(err))


# ── Gestion de l'énergie ──────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/system/power"})
@websocket_api.async_response
async def ws_get_power(hass, connection, msg):
    """Retourne l'état du gestionnaire d'énergie (mode éco, consommation)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    pm = await _safe_post(coordinator, "PowerManagement", "get")
    profiles = await _safe_post(coordinator, "PowerManagement", "getProfiles")
    connection.send_result(msg["id"], {
        "enabled": pm.get("Enable") if isinstance(pm, dict) else None,
        "status": pm.get("Status") if isinstance(pm, dict) else None,
        "mode": pm.get("ConfigurationMode") if isinstance(pm, dict) else None,
        "power_watts": pm.get("Power") if isinstance(pm, dict) else None,
        "profiles": profiles if isinstance(profiles, list) else [],
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/system/power/set",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_set_power(hass, connection, msg):
    """Active ou désactive le mode économie d'énergie de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "PowerManagement", "set", {"Enable": msg["enabled"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "power_set_failed", str(err))


# ── Wifi détaillé (radios, VAP, stations associées) ───────────────────────────

_RADIO_IFACES = ["rad2g0", "rad5g0", "rad6g0"]
_VAP_IFACES = [
    "vap2g0priv0", "vap5g0priv0", "vap6g0priv0",
    "vap2g0guest0", "vap5g0guest0",
]


async def _get_radio_info(coordinator, iface: str) -> dict | None:
    """Lit les paramètres d'une radio Wifi via NeMo.Intf.<iface>:get."""
    raw = await _safe_post(coordinator, f"NeMo.Intf.{iface}", "get")
    if not isinstance(raw, dict):
        return None
    return {
        "iface": iface,
        "band": raw.get("OperatingFrequencyBand"),
        "channel": raw.get("Channel"),
        "auto_channel": raw.get("AutoChannelEnable"),
        "bandwidth": raw.get("CurrentOperatingChannelBandwidth"),
        "standards": raw.get("OperatingStandards"),
        "enabled": raw.get("Enable"),
        "status": raw.get("RadioStatus"),
        "tx_power": raw.get("TransmitPower"),
        "possible_channels": raw.get("PossibleChannels"),
    }


async def _get_vap_info(coordinator, iface: str) -> dict | None:
    """Lit les paramètres d'un VAP Wifi + stations associées."""
    raw = await _safe_post(coordinator, f"NeMo.Intf.{iface}", "get")
    if not isinstance(raw, dict):
        return None
    stations_raw = await _safe_post(
        coordinator, f"NeMo.Intf.{iface}.AssociatedDevice", "get"
    )
    stations = []
    if isinstance(stations_raw, list):
        for s in stations_raw:
            if isinstance(s, dict):
                stations.append({
                    "mac": s.get("MACAddress"),
                    "ip": s.get("IPAddress"),
                    "rssi": s.get("LastDataUplinkRate") or s.get("SignalStrength"),
                    "noise": s.get("Noise"),
                    "tx_rate": s.get("LastDataDownlinkRate"),
                    "rx_rate": s.get("LastDataUplinkRate"),
                    "active": s.get("Active"),
                    "authenticated": s.get("AuthenticationState"),
                })
    elif isinstance(stations_raw, dict):
        for s in stations_raw.values():
            if isinstance(s, dict):
                stations.append({
                    "mac": s.get("MACAddress"),
                    "ip": s.get("IPAddress"),
                    "rssi": s.get("LastDataUplinkRate") or s.get("SignalStrength"),
                    "noise": s.get("Noise"),
                    "tx_rate": s.get("LastDataDownlinkRate"),
                    "rx_rate": s.get("LastDataUplinkRate"),
                    "active": s.get("Active"),
                    "authenticated": s.get("AuthenticationState"),
                })
    return {
        "iface": iface,
        "ssid": raw.get("SSID"),
        "bssid": raw.get("BSSID"),
        "enabled": raw.get("Enable"),
        "status": raw.get("VAPStatus"),
        "hidden": not raw.get("SSIDAdvertisementEnabled", True),
        "mac_filter": raw.get("MACFilterAddressList"),
        "max_assoc": raw.get("MaxAssociatedDevices"),
        "station_count": raw.get("ActiveAssociatedDeviceNumberOfEntries", 0),
        "stations": stations,
    }


@websocket_api.websocket_command({vol.Required("type"): "livebox/wifi/detail"})
@websocket_api.async_response
async def ws_get_wifi_detail(hass, connection, msg):
    """Retourne les radios, VAPs et stations associées Wifi de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    radios_raw = await asyncio.gather(*(_get_radio_info(coordinator, r) for r in _RADIO_IFACES))
    vaps_raw = await asyncio.gather(*(_get_vap_info(coordinator, v) for v in _VAP_IFACES))
    connection.send_result(msg["id"], {
        "radios": [r for r in radios_raw if r is not None],
        "vaps": [v for v in vaps_raw if v is not None],
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/wifi/radio/set",
    vol.Required("iface"): str,
    vol.Optional("channel"): int,
    vol.Optional("auto_channel"): bool,
    vol.Optional("bandwidth"): str,
    vol.Optional("standards"): str,
    vol.Optional("tx_power"): int,
})
@websocket_api.async_response
async def ws_set_wifi_radio(hass, connection, msg):
    """Modifie les paramètres d'une radio Wifi (canal, largeur de bande, etc.)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    iface = msg["iface"]
    if iface not in _RADIO_IFACES:
        connection.send_error(msg["id"], "invalid_iface", f"Unknown radio interface: {iface}")
        return
    params = {}
    if "channel" in msg:
        params["Channel"] = msg["channel"]
    if "auto_channel" in msg:
        params["AutoChannelEnable"] = msg["auto_channel"]
    if "bandwidth" in msg:
        params["MaxChannelBandwidth"] = msg["bandwidth"]
    if "standards" in msg:
        params["OperatingStandards"] = msg["standards"]
    if "tx_power" in msg:
        params["TransmitPower"] = msg["tx_power"]
    if not params:
        connection.send_result(msg["id"], {"status": "noop"})
        return
    try:
        await coordinator.api.devices._auth.post(f"NeMo.Intf.{iface}", "set", params)
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "radio_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/wifi/vap/set",
    vol.Required("iface"): str,
    vol.Optional("ssid"): str,
    vol.Optional("hidden"): bool,
    vol.Optional("enabled"): bool,
})
@websocket_api.async_response
async def ws_set_wifi_vap(hass, connection, msg):
    """Modifie les paramètres d'un VAP Wifi (SSID, diffusion, activation)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    iface = msg["iface"]
    if iface not in _VAP_IFACES:
        connection.send_error(msg["id"], "invalid_iface", f"Unknown VAP interface: {iface}")
        return
    params = {}
    if "ssid" in msg:
        params["SSID"] = msg["ssid"]
    if "hidden" in msg:
        params["SSIDAdvertisementEnabled"] = not msg["hidden"]
    if "enabled" in msg:
        params["Enable"] = msg["enabled"]
    if not params:
        connection.send_result(msg["id"], {"status": "noop"})
        return
    try:
        await coordinator.api.devices._auth.post(f"NeMo.Intf.{iface}", "set", params)
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "vap_set_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/wifi/kickstation",
    vol.Required("vap"): str,
    vol.Required("mac"): str,
})
@websocket_api.async_response
async def ws_kickstation(hass, connection, msg):
    """Déconnecte un client Wifi associé à un VAP."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    vap = msg["vap"]
    if vap not in _VAP_IFACES:
        connection.send_error(msg["id"], "invalid_vap", f"Unknown VAP: {vap}")
        return
    try:
        await coordinator.api.devices._auth.post(
            f"NeMo.Intf.{vap}", "kickStation", {"MACAddress": msg["mac"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "kickstation_failed", str(err))


# ── Planificateur Wifi (WLanScheduler) ────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/wifi/schedule"})
@websocket_api.async_response
async def ws_get_wifi_schedule(hass, connection, msg):
    """Retourne les plannings Wifi (horaires d'activation/désactivation)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    raw = await _safe_post(coordinator, "WLanScheduler", "get")
    schedules_raw = await _safe_post(coordinator, "WLanScheduler.Schedules", "get")
    connection.send_result(msg["id"], {
        "schedules": schedules_raw if isinstance(schedules_raw, (list, dict)) else [],
        "raw": raw if isinstance(raw, dict) else {},
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/wifi/schedule/set",
    vol.Required("id"): str,
    vol.Required("state"): str,
})
@websocket_api.async_response
async def ws_set_wifi_schedule(hass, connection, msg):
    """Modifie l'état d'un planning Wifi (Active/Inactive/Override)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "WLanScheduler", "setState", {"ID": msg["id"], "state": msg["state"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "wifi_schedule_set_failed", str(err))


# ── WAN reconnect (PPPoE) ─────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/network/wan/reconnect"})
@websocket_api.async_response
async def ws_wan_reconnect(hass, connection, msg):
    """Force une reconnexion WAN (PPPoE) via NMC.TPPP:force."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post("NMC.TPPP", "force")
        connection.send_result(msg["id"], {"status": "reconnecting"})
    except Exception as err:
        connection.send_error(msg["id"], "wan_reconnect_failed", str(err))


# ── Accès distant Orange ──────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/remote_access"})
@websocket_api.async_response
async def ws_get_remote_access(hass, connection, msg):
    """Retourne l'état de l'accès distant Orange (OrangeRemoteAccess)."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    raw = await _safe_post(coordinator, "OrangeRemoteAccess", "get")
    connection.send_result(msg["id"], {
        "enabled": raw.get("Enable") if isinstance(raw, dict) else None,
        "active": raw.get("Activate") if isinstance(raw, dict) else None,
        "status": raw.get("Status") if isinstance(raw, dict) else None,
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/remote_access/set",
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def ws_set_remote_access(hass, connection, msg):
    """Active ou désactive l'accès distant Orange."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.devices._auth.post(
            "OrangeRemoteAccess", "set", {"Enable": msg["enabled"]}
        )
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "remote_access_set_failed", str(err))


# ── Niveaux de pare-feu ───────────────────────────────────────────────────────

@websocket_api.websocket_command({vol.Required("type"): "livebox/firewall/levels"})
@websocket_api.async_response
async def ws_get_firewall_levels(hass, connection, msg):
    """Retourne le niveau de pare-feu actuel et les niveaux disponibles."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    current = coordinator.data.get("firewall_level", "")
    levels_raw = await _safe_post(coordinator, "Firewall.Level", "get")
    connection.send_result(msg["id"], {
        "current": current,
        "levels": levels_raw if isinstance(levels_raw, (list, dict)) else [],
    })


@websocket_api.websocket_command({
    vol.Required("type"): "livebox/firewall/level/set",
    vol.Required("level"): str,
})
@websocket_api.async_response
async def ws_set_firewall_level(hass, connection, msg):
    """Change le niveau de pare-feu de la Livebox."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    try:
        await coordinator.api.firewall.async_set_firewall_level({"level": msg["level"]})
        await coordinator.api.firewall.async_commit()
        hass.async_create_task(coordinator.async_request_refresh())
        connection.send_result(msg["id"], {"status": "ok"})
    except Exception as err:
        connection.send_error(msg["id"], "firewall_level_set_failed", str(err))
