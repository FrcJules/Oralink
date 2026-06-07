"""Livebox custom panel — WebSocket API commands."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


def async_setup_panel(hass: HomeAssistant) -> None:
    """Register all WebSocket commands."""
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_get_dhcp)
    websocket_api.async_register_command(hass, ws_get_nat)
    websocket_api.async_register_command(hass, ws_get_network)
    websocket_api.async_register_command(hass, ws_get_topology)
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


def _get_coordinator(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        if hasattr(entry, "runtime_data"):
            return entry.runtime_data
    return None


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


@callback
@websocket_api.websocket_command({vol.Required("type"): "livebox/dhcp"})
def ws_get_dhcp(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    data = coordinator.data
    connection.send_result(msg["id"], {
        "active": data.get("dhcp_leases", []),
        "guest": data.get("guest_dhcp_leases", []),
        "static": data.get("dhcp_static_leases", []),
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
def ws_get_network(hass, connection, msg):
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    data = coordinator.data
    fiber = data.get("fiber_status", {})
    wan = data.get("wan_status", {})
    counters = data.get("wan_counters", {})
    infos = data.get("infos", {})

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
            "firmware": infos.get("SoftwareVersion"),
            "uptime_days": round(infos.get("UpTime", 0) / 86400, 1),
            "reboots": infos.get("NumberOfReboots"),
            "wired_devices": data.get("count_wired_devices", 0),
            "wireless_devices": data.get("count_wireless_devices", 0),
        },
    })


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
            "enabled": nmc.get("UPnPEnable", nmc.get("IGDEnabled", True)),
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
        # Set the device HostName via the devices API
        await coordinator._make_request(
            coordinator.api.devices.async_set_device,
            {"key": msg["mac"], "parameters": {"UserFriendlyName": msg["hostname"]}},
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
        await coordinator._make_request(
            coordinator.api.upnpigd.async_set,
            {"Enable": msg["enabled"]},
        )
        await coordinator.async_request_refresh()
        connection.send_result(msg["id"], {"status": "ok"})
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
