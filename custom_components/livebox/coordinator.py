"""Coordinator for Livebox."""

from __future__ import annotations

import logging
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any, cast

from aiosysbus import AIOSysbus
from aiosysbus.exceptions import AiosysbusException
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util.dt import DEFAULT_TIME_ZONE, UTC

from .const import (
    CONF_DISPLAY_DEVICES,
    CONF_LAN_TRACKING,
    CONF_USE_TLS,
    CONF_WIFI_TRACKING,
    DEFAULT_DISPLAY_DEVICES,
    DEFAULT_LAN_TRACKING,
    DEFAULT_WIFI_TRACKING,
    DOMAIN,
)
from .helpers import find_item
from .repeater_store import RepeaterStore
from .topology_store import TopologyStore
from .traffic_history_store import TrafficHistoryStore
from .tv_decoder_store import TvDecoderStore

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(minutes=1)
TOPOLOGY_SCAN_INTERVAL = timedelta(minutes=15)
TOPOLOGY_BUILD_TIMEOUT = 30


class LiveboxDataUpdateCoordinator(DataUpdateCoordinator):
    """Define an object to fetch data."""

    def __init__(
        self,
        hass: HomeAssistant,
        config_entry: ConfigEntry,
    ) -> None:
        """Class to manage fetching data API."""
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=SCAN_INTERVAL)
        self.config_entry: Any = config_entry
        self.api: Any

        self.unique_id: str | None = None
        self.model: int | float | None = None
        self._topology_cache: tuple[dict[str, str], dict[str, str]] = ({}, {})
        self._topology_cache_at: datetime | None = None
        self._topology_last_update: str | None = None

        # Rolling in-memory history for the "Graphiques" tab (~12h at 1 update/min)
        self._traffic_history: deque[dict[str, Any]] = deque(maxlen=720)
        # Rolling connection/disconnection log for the "Événements" tab
        self._event_log: deque[dict[str, Any]] = deque(maxlen=300)

        self.repeater_store = RepeaterStore(hass, config_entry.entry_id)
        self.topology_store = TopologyStore(hass, config_entry.entry_id)
        self.tv_decoder_store = TvDecoderStore(hass, config_entry.entry_id)
        self.traffic_history_store = TrafficHistoryStore(hass, config_entry.entry_id)

    async def _async_setup(self) -> None:
        """Coordinator setup."""
        self.api = AIOSysbus(
            username=self.config_entry.data[CONF_USERNAME],
            password=self.config_entry.data[CONF_PASSWORD],
            session=async_create_clientsession(self.hass),
            host=self.config_entry.data[CONF_HOST],
            port=self.config_entry.data[CONF_PORT],
            use_tls=self.config_entry.data.get(CONF_USE_TLS, False),
        )
        await self.repeater_store.async_load()
        await self.topology_store.async_load()
        await self.tv_decoder_store.async_load()
        for point in await self.traffic_history_store.async_load():
            self._traffic_history.append(point)

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data."""
        try:
            # Mandatory information
            infos = await self.async_get_infos()
            self.unique_id = infos["SerialNumber"]
            match infos["ProductClass"]:
                case "Livebox 3":
                    self.model = 3
                case "Livebox 4":
                    self.model = 4
                case "Livebox Fibre":
                    self.model = 5
                case "Livebox 6":
                    self.model = 6
                case "Livebox 7":
                    self.model = 7
                case "Livebox W7":
                    self.model = 7.1
                case "SMBSLBFIBRA":
                    self.model = 5656  # Sagemcom f@st 5656
                case "Livebox Nautilus":
                    self.model = 7.2
            # Optionals
            wifi_tracking = self.config_entry.options.get(
                CONF_WIFI_TRACKING, DEFAULT_WIFI_TRACKING
            )
            lan_tracking = self.config_entry.options.get(
                CONF_LAN_TRACKING, DEFAULT_LAN_TRACKING
            )
            previous_devices = (self.data or {}).get("devices", {})

            topology_via_device, topology_repeaters = await self.async_get_topology()
            devices, device_counters = await self.async_get_devices(
                lan_tracking, wifi_tracking, set(topology_repeaters)
            )
            callers, cmissed = await self.async_get_callers()

            await self.async_detect_new_dvices(devices)
            self._record_device_events(previous_devices, devices)

            device_traffic = await self.async_get_device_traffic()
            stats = await self.async_get_results()
            wan_counters = await self.async_get_wan_counters()
            await self._record_traffic_history(device_traffic, wan_counters)

            return {
                "cmissed": cmissed,
                "callers": callers,
                "devices": devices,
                "dsl_status": await self.async_get_dsl_status(),
                "infos": infos,
                "nmc": await self.async_get_nmc(),
                "wan_status": await self.async_get_wan_status(),
                "wifi": await self.async_is_wifi(),
                "guest_wifi": await self.async_is_guest_wifi(),
                "count_wired_devices": device_counters["wired"],
                "count_wireless_devices": device_counters["wireless"],
                "devices_wan_access": {
                    key: await self.async_get_device_schedule(key) for key in devices
                },
                "ddns": await self.async_get_ddns(),
                "wifi_stats": await self.async_get_wifi_stats(),
                "fiber_status": await self.async_get_fiber_status(),
                "fiber_stats": await self.async_get_fiber_stats(),
                "remote_access": await self.async_is_remote_access(),
                "topology_via_device": topology_via_device,
                "topology_repeaters": topology_repeaters,
                "lan": await self.async_get_lan(devices),
                "upnp": await self.async_get_port_forwarding(),
                "upnp_igd": await self.async_get_upnp_igd(),
                "dhcp_leases": await self.async_get_dhcp_leases(),
                "guest_dhcp_leases": await self.async_get_dhcp_leases("guest"),
                "dhcp_static_leases": await self.async_get_dhcp_static_leases(),
                "stats": stats,
                "wan_counters": wan_counters,
                "device_traffic": device_traffic,
                "firewall_level": await self.async_get_firewall_level(),
                "reboot_history": await self.async_get_reboot_history(),
                "ping_response": await self.async_get_ping_response(),
                "contacts": await self.async_get_contacts(),
            }
        except AiosysbusException as error:
            _LOGGER.error("Error while fetch data information: %s", error)
            raise UpdateFailed(error) from error

    async def async_get_infos(self) -> dict[str, Any]:
        """Get router infos."""
        return (await self.api.deviceinfo.async_get_deviceinfo()).get("status", {})

    async def async_get_devices(
        self,
        lan_tracking: bool = False,
        wifi_tracking: bool = True,
        repeater_keys: set[str] | None = None,
    ) -> tuple[dict[str, Any], dict[str, int]]:
        """Get all devices."""
        devices_tracker = {}
        device_counters = {"wireless": 0, "wired": 0}
        mode = self.config_entry.options.get(
            CONF_DISPLAY_DEVICES, DEFAULT_DISPLAY_DEVICES
        )
        if mode == "All":
            parameters = {
                "expression": {
                    "wifi": 'wifi && (edev || hnid) and .PhysAddress!=""',
                    "eth": 'eth && (edev || hnid) and .PhysAddress!=""',
                }
            }
        else:
            parameters = {
                "expression": {
                    "wifi": (
                        '.Active==true && wifi && (edev || hnid) and .PhysAddress!=""'
                    ),
                    "eth": (
                        '.Active==true && eth && (edev || hnid) and .PhysAddress!=""'
                    ),
                }
            }
        devices = (
            await self._make_request(self.api.devices.async_get_devices, parameters)
        ).get("status", {})
        _LOGGER.debug("Fetch Devices: %s", devices)
        if wifi_tracking:
            device_counters["wireless"] = len(devices.get("wifi", {}))
            for device in devices.get("wifi", {}):
                if device.get("Key"):
                    tracked_device = devices_tracker.setdefault(device.get("Key"), {})
                    if isinstance(tracked_device, dict):
                        tracked_device.update(device)

        if lan_tracking:
            device_counters["wired"] = len(devices.get("eth", {}))
            for device in devices.get("eth", {}):
                if device.get("Key"):
                    tracked_device = devices_tracker.setdefault(device.get("Key"), {})
                    if isinstance(tracked_device, dict):
                        tracked_device.update(device)
        elif wifi_tracking:
            for device in devices.get("eth", {}):
                device_key = device.get("Key")
                if not isinstance(device_key, str) or device_key not in (
                    repeater_keys or set()
                ):
                    continue
                # Repeaters are needed for Home Assistant's via_device topology even
                # when generic LAN tracking is disabled, so we keep only the
                # Ethernet devices that buildTopology identified as repeaters.
                tracked_device = devices_tracker.setdefault(device_key, {})
                if isinstance(tracked_device, dict):
                    tracked_device.update(device)

        return devices_tracker, device_counters

    async def async_get_topology(self) -> tuple[dict[str, str], dict[str, str]]:
        """Build a device-to-repeater map from topology diagnostics."""
        now = datetime.now(tz=UTC)
        topo_status = (
            await self._make_request(self.api.topologydiagnostics.async_get_topodiags)
        ).get("status", {})
        if not isinstance(topo_status, dict):
            return self._topology_cache

        last_update = topo_status.get("LastUpdate")
        if (
            isinstance(last_update, str)
            and self._topology_last_update is not None
            and last_update == self._topology_last_update
        ):
            return self._topology_cache
        if (
            self._topology_cache_at is not None
            and now - self._topology_cache_at < TOPOLOGY_SCAN_INTERVAL
            and not isinstance(last_update, str)
        ):
            return self._topology_cache

        data = (
            await self._make_request(
                self.api.topologydiagnostics.async_set_topodiags_build,
                {
                    "Timeout": TOPOLOGY_BUILD_TIMEOUT,
                    "LLTDIcon": False,
                    "SendXmlFile": False,
                },
            )
        ).get("status", [])
        if not data or not isinstance(data, list) or not isinstance(data[0], dict):
            return self._topology_cache

        topology_via_device: dict[str, str] = {}
        topology_repeaters: dict[str, str] = {}

        def _is_repeater(node: dict[str, Any]) -> bool:
            ssw = node.get("SSW", {})
            return isinstance(ssw, dict) and ssw.get("CurrentMode") == "Slave"

        def _walk(node: dict[str, Any], repeater_key: str | None = None) -> None:
            key = node.get("Key")
            current_repeater = repeater_key

            if isinstance(key, str) and _is_repeater(node):
                current_repeater = key
                topology_repeaters[key] = node.get("Name", key)
            elif repeater_key and isinstance(key, str) and node.get("PhysAddress"):
                topology_via_device[key] = repeater_key

            for child in node.get("Children", []) or []:
                if isinstance(child, dict):
                    _walk(child, current_repeater)

        _walk(data[0])
        self._topology_cache = (topology_via_device, topology_repeaters)
        self._topology_cache_at = now
        self._topology_last_update = cast(str | None, data[0].get("LastUpdate")) or (
            last_update if isinstance(last_update, str) else None
        )
        return self._topology_cache

    def get_parent_device_identifier(self, device_key: str | None) -> tuple[str, str]:
        """Return the parent device identifier for a tracked device."""
        unique_id = self.unique_id or DOMAIN
        data = self.data or {}
        if isinstance(device_key, str):
            parent_key = data.get("topology_via_device", {}).get(device_key)
            if isinstance(parent_key, str):
                return (DOMAIN, parent_key)
        return (DOMAIN, unique_id)

    def get_repeater_name(self, device_key: str | None) -> str | None:
        """Return the repeater name for a tracked device, if any."""
        data = self.data or {}
        if not isinstance(device_key, str):
            return None
        parent_key = data.get("topology_via_device", {}).get(device_key)
        if not isinstance(parent_key, str):
            return None
        return data.get("topology_repeaters", {}).get(parent_key)

    async def async_get_callers(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Get caller missed."""
        callers = []
        cmisseds = []
        calls = (
            await self._make_request(self.api.voiceservice.async_get_calllist)
        ).get("status", {})
        for call in calls:
            utc_dt = datetime.strptime(call["startTime"], "%Y-%m-%dT%H:%M:%SZ")
            local_dt = utc_dt.replace(tzinfo=UTC).astimezone(tz=DEFAULT_TIME_ZONE)
            caller = {
                "phone_number": call.get("remoteNumber"),
                "date": str(local_dt),
                "status": call.get("callType"),
                "duration": call.get("duration"),
                "id": call.get("callId"),
                "origin": call.get("callOrigin"),
            }
            callers.append(caller)
            if call["callType"] == "missed":
                cmisseds.append(caller)

        return callers, cmisseds

    async def async_get_contacts(self) -> list[dict[str, Any]]:
        """Get phonebook contacts (carnet d'adresses de la Livebox)."""
        raw = (await self._make_request(self.api.phonebook.async_get_contacts)).get(
            "status", []
        )
        if not isinstance(raw, list):
            return []
        contacts = []
        for c in raw:
            numbers = c.get("telephoneNumbers") or []
            by_type = {n.get("type"): n.get("name") for n in numbers if isinstance(n, dict)}
            contacts.append({
                "id": c.get("uniqueID", ""),
                "name": c.get("formattedName", ""),
                "cell": by_type.get("CELL", ""),
                "home": by_type.get("HOME", ""),
                "work": by_type.get("WORK", ""),
            })
        return contacts

    async def async_get_dsl_status(self) -> dict[str, Any]:
        """Get dsl status."""
        parameters = {"mibs": "dsl", "flag": "", "traverse": "down"}
        dsl0 = (
            await self._make_request(self.api.nemo.async_get_MIBs, "data", parameters)
        ).get("status", {})
        return find_item(dsl0, "dsl.dsl0", {})

    async def async_get_fiber_status(self):
        """Get fiber status."""
        if self.model in [4, 3]:
            return {}
        if self.model == 5656:
            optical = (
                await self._make_request(self.api.sgcomci.async_get_optical)
            ).get("status", {})
            return {
                "SignalTxPower": float(optical.get("PowerTx", 0)) * 1000,
                "SignalRxPower": float(optical.get("PowerRx", 0)) * 1000,
                "Temperature": float(optical.get("Temperature", 0)),
                "Voltage": float(optical.get("Vcc", 0)),
                "Bias": float(optical.get("BiasCurrent", 0)),
            }

        parameters = {"mibs": "gpon"}
        veip0 = (
            await self._make_request(self.api.nemo.async_get_MIBs, "veip0", parameters)
        ).get("status", {})
        return find_item(veip0, "gpon.veip0", {})

    async def async_get_lan(self, lan_devices):
        """Get lan status."""
        self_devices = (
            await self._make_request(
                self.api.devices.async_get_devices,
                {"expression": {"wifi": "vap && lan", "eth": "eth && lan"}},
            )
        ).get("status", {})

        wlanvap_data = (
            await self._make_request(
                self.api.nemo.async_get_MIBs, "lan", {"mibs": "wlanvap"}
            )
        ).get("status", {})

        devices = []
        for mode, items in self_devices.items():
            for item in items:
                if mode == "wifi":
                    intf = item.get("Name", "Unknown")
                    band = item.get("OperatingFrequencyBand", intf)
                    ess_identifier = item.get("EssIdentifier", "guest").lower()
                    wlanvap = wlanvap_data.get(intf, {})
                    devices.append(
                        {
                            "name": f"{band} ({ess_identifier})",
                            "status": item.get("Active"),
                            "type": "Wireless",
                            "extra_attributes": {
                                "last_change": item.get("LastChanged"),
                                "channel": item.get("Channel"),
                                "ssid": item.get("SSID"),
                                "associated_devices": wlanvap.get("AssociatedDevice"),
                            },
                        }
                    )
                if mode == "eth":
                    devices.append(
                        {
                            "name": item.get("Name", "Unknown"),
                            "status": item.get("Active"),
                            "type": "Ethernet",
                            "extra_attributes": {
                                "current_bitrate": item.get("CurrentBitRate"),
                                "last_change": item.get("LastChanged"),
                                "port_state": item.get("PortState"),
                            },
                        }
                    )
        return devices

    async def async_get_wifi_stats(self) -> bool:
        """Get wifi stats."""
        return (await self._make_request(self.api.nmc.async_get_wifi_stats)).get(
            "data", {}
        )

    async def async_get_fiber_stats(self) -> bool:
        """Get fiber stats."""
        if self.model == 4:
            intf = "eth0"
        elif self.model == 3:
            intf = "bridge_vmulti"
        elif self.model == 5656:
            intf = "bridge"
        else:
            intf = "veip0"
        return (
            await self._make_request(self.api.nemo.async_get_net_dev_stats, intf)
        ).get("status", {})

    async def async_get_wan_status(self) -> dict[str, Any]:
        """Get status."""
        return (await self._make_request(self.api.nmc.async_get_wan_status)).get(
            "data", {}
        )

    async def async_get_nmc(self) -> dict[str, Any]:
        """Get dsl status."""
        return (await self._make_request(self.api.nmc.async_get)).get("status", {})

    async def async_get_upnp_igd(self) -> dict[str, Any]:
        """Get UPnP-IGD status (the actual Enable flag, not NMC's)."""
        return (await self._make_request(self.api.upnpigd.async_get)).get("status", {})

    async def async_is_wifi(self) -> bool:
        """Get wireless status."""
        wifi = (await self._make_request(self.api.nmc.async_get_wifi)).get("status", {})
        return wifi.get("Enable") is True

    async def async_is_guest_wifi(self) -> bool:
        """Get Guest Wifi status."""
        guest_wifi = (await self._make_request(self.api.nmc.async_get_guest_wifi)).get(
            "status", {}
        )
        return guest_wifi.get("Enable") is True

    async def async_get_ddns(self) -> list[Any]:
        """Get DDNS status."""
        ddns = (await self._make_request(self.api.dyndns.async_get_hosts)).get(
            "status", {}
        )
        if isinstance(ddns, list):
            return ddns
        if isinstance(ddns, dict):
            # Single entry returned as a plain dict
            if ddns.get("service") or ddns.get("Service") or ddns.get("hostname") or ddns.get("Hostname"):
                return [ddns]
            # Dict keyed by index ({"0": {...}, "1": {...}})
            return [v for v in ddns.values() if isinstance(v, dict)]
        return []

    async def async_get_device_schedule(self, device_key):
        """Get device schedule."""
        parameters = {"type": "ToD", "ID": device_key}
        data = (
            await self._make_request(self.api.schedule.async_get_schedule, parameters)
        ).get("data", {})
        return data.get("scheduleInfo", {})

    async def async_is_remote_access(self) -> bool:
        """Get Remote access status."""
        ra = (await self._make_request(self.api.remoteaccess.async_get)).get(
            "status", {}
        )
        return ra.get("Enable", False) is True

    async def async_detect_new_dvices(self, devices) -> None:
        """New devices detected."""
        if self.data and self.data.get("devices"):
            for key in devices:
                if key not in self.data.get("devices", {}):
                    self.data["devices"] = devices
                    async_dispatcher_send(self.hass, self.signal_device_new)
                    async_dispatcher_send(self.hass, self.signal_wan_access_new)
                    break

    def _record_device_events(
        self, previous_devices: dict[str, Any], devices: dict[str, Any]
    ) -> None:
        """Append connection/disconnection events detected since the last poll."""
        if not previous_devices:
            return
        now = str(datetime.now(tz=DEFAULT_TIME_ZONE))
        for mac, device in devices.items():
            was_active = previous_devices.get(mac, {}).get("Active")
            is_active = device.get("Active", False)
            if was_active is None or was_active == is_active:
                continue
            self._event_log.appendleft({
                "time": now,
                "mac": mac,
                "name": device.get("Name", mac),
                "event": "connected" if is_active else "disconnected",
            })

    async def _record_traffic_history(
        self, device_traffic: dict[str, Any], wan_counters: dict[str, Any]
    ) -> None:
        """Append an aggregate traffic sample for the "Graphiques" tab."""
        rate_rx = round(sum(t.get("rate_rx", 0) for t in device_traffic.values()), 3)
        rate_tx = round(sum(t.get("rate_tx", 0) for t in device_traffic.values()), 3)
        self._traffic_history.append({
            "time": str(datetime.now(tz=DEFAULT_TIME_ZONE)),
            "rate_rx": rate_rx,
            "rate_tx": rate_tx,
            "wan_rx_bytes": wan_counters.get("BytesReceived") if isinstance(wan_counters, dict) else None,
            "wan_tx_bytes": wan_counters.get("BytesSent") if isinstance(wan_counters, dict) else None,
        })
        # Persisté pour survivre aux redémarrages/rechargements — sinon le
        # graphe reste perpétuellement "en cours de constitution" pour qui
        # redémarre Home Assistant régulièrement (cf. retour utilisateur).
        await self.traffic_history_store.async_save(list(self._traffic_history))

    @property
    def event_log(self) -> list[dict[str, Any]]:
        """Recent connection/disconnection events (most recent first)."""
        return list(self._event_log)

    @property
    def traffic_history(self) -> list[dict[str, Any]]:
        """Aggregate traffic samples collected over time (oldest first)."""
        return list(self._traffic_history)

    async def async_get_port_forwarding(self) -> list[dict[str, Any]]:
        """Get port forwarding."""
        port_forwarding = (
            await self._make_request(self.api.firewall.async_get_port_forwarding)
        ).get("status", {})
        ports = []
        for port in port_forwarding.values():
            ports.append(
                {
                    "id": port.get("Id"),
                    "name": port.get("Description") or port.get("Id", ""),
                    "enable": port.get("Enable", False),
                    "protocol": port.get("Protocol", ""),
                    "external_port": port.get("ExternalPort", ""),
                    "internal_port": port.get("InternalPort", ""),
                    "destination_ip": port.get("DestinationIPAddress", ""),
                    "source_prefix": port.get("SourcePrefix", ""),
                    # Legacy keys kept for existing sensor attrs
                    "WAN Ip": port.get("DestinationIPAddress"),
                    "WAN Port": port.get("ExternalPort"),
                    "Port": port.get("InternalPort"),
                }
            )

        return ports

    async def async_get_dhcp_leases(
        self, domain: str = "default"
    ) -> list[dict[str, Any]]:
        """Get dhcp leases."""
        if self.model == 5656:
            return []

        data = (await self._make_request(self.api.dhcp.async_get_dhcp_pool)).get(
            "status", {}
        )
        if data.get(domain, {}).get("Enable", False) is False:
            return []

        data = (
            await self._make_request(self.api.dhcp.async_get_dhcp_leases, None, domain)
        ).get("status", {})
        return [
            {
                "IP Address": item.get("IPAddress"),
                "Mac Address": item.get("MACAddress"),
                "Name": item.get("FriendlyName", "No name"),
                "Time (s)": item.get("LeaseTime"),
                "Enable": item.get("Active"),
                "Reserved": item.get("Reserved"),
            }
            for item in data.get(domain, {}).values()
        ]

    async def async_get_results(self) -> dict[str, Any]:
        """Get interfaces."""
        results = {}

        raw = (await self._make_request(self.api.homelan.async_get_interface)).get(
            "status", {}
        )

        # Key by actual Name so the lookup against getResults response works.
        # FriendlyName ("2.4GHz-Private_SSID") was used before but getResults
        # returns data keyed by the real interface name (e.g. "vap2g0priv0").
        # FriendlyName est absent sur certains modèles/firmwares — on retombe
        # alors sur le nom technique plutôt que d'écarter complètement
        # l'interface (ce qui laissait la carte "Interfaces" vide).
        interfaces = {
            item["Name"]: item
            for item in raw.values()
            if "Name" in item and "vlan" not in item["Name"]
        }

        data = (
            await self._make_request(
                self.api.homelan.async_get_results,
                {"InterfaceName": list(interfaces.keys()), "NumberOfReadings": 1},
            )
        ).get("status", {})

        for name, item in interfaces.items():
            # Result is keyed by actual interface name — same as the request key.
            # Pas de Traffic sur certains modèles/firmwares — on garde quand
            # même l'interface dans la liste (débit à 0) plutôt que de la
            # faire disparaître entièrement de la carte "Interfaces".
            traffic = data.get(name, {}).get("Traffic", [])
            stats = traffic[0] if traffic else {}

            # Rx_Counter and Tx_Counter are collected over a 30-second window.
            # Convert them to Mbit/s to match the sensor unit declaration.
            results[name] = {
                "friendly_name": item.get("FriendlyName") or item["Name"],
                "alias": item.get("alias"),
                "rate_rx": round(stats.get("Rx_Counter", 0) / 30 / 1_000_000, 2),
                "rate_tx": round(stats.get("Tx_Counter", 0) / 30 / 1_000_000, 2),
            }
        return results

    async def async_get_wan_counters(self) -> dict[str, Any]:
        """Get WAN total traffic counters (bytes received/sent since last reset)."""
        return (
            await self._make_request(self.api.homelan.async_get_wan_counters)
        ).get("status", {})

    async def async_get_device_traffic(self) -> dict[str, Any]:
        """Get per-device traffic rates (Mbit/s over last 30s window)."""
        data = (
            await self._make_request(
                self.api.homelan.async_get_devices_results,
                {"NumberOfReadings": 1},
            )
        ).get("status", {})
        result = {}
        for mac, device_data in data.items():
            traffic = device_data.get("Traffic", [])
            if traffic:
                t = traffic[0]
                result[mac] = {
                    "rate_rx": round(t.get("Rx_Counter", 0) / 30 / 1_000_000, 3),
                    "rate_tx": round(t.get("Tx_Counter", 0) / 30 / 1_000_000, 3),
                }
        return result

    async def async_get_dhcp_static_leases(self) -> list[dict[str, Any]]:
        """Get DHCP static (reserved) leases."""
        data = (
            await self._make_request(self.api.dhcp.async_get_dhcp_staticleases)
        ).get("status", [])
        if not isinstance(data, list):
            return []
        return [
            {
                "IP Address": item.get("IPAddress"),
                "Mac Address": item.get("MACAddress"),
                "Name": item.get("FriendlyName") or item.get("Name") or "",
            }
            for item in data
        ]

    async def async_get_reboot_history(self) -> list[dict[str, Any]]:
        """Get reboot history from NMC.Reboot.Reboot."""
        try:
            data = (await self.api.nmc._auth.post("NMC.Reboot.Reboot", "get")).get("status", {})
        except Exception as err:
            _LOGGER.debug("Could not fetch reboot history: %s", err)
            return []
        if not isinstance(data, dict):
            return []
        return sorted(
            [
                {
                    "boot_date": v.get("BootDate"),
                    "boot_reason": v.get("BootReason", "Unknown"),
                    "shutdown_date": v.get("ShutdownDate"),
                    "shutdown_reason": v.get("ShutdownReason", "Unknown"),
                }
                for v in data.values()
                if isinstance(v, dict)
            ],
            key=lambda x: x.get("boot_date") or "",
            reverse=True,
        )

    async def async_get_ping_response(self) -> dict[str, bool]:
        """Get ping response settings (IPv4 + IPv6)."""
        data = (
            await self._make_request(
                self.api.firewall.async_get_respond_ping,
                {"sourceInterface": "data"},
            )
        ).get("status", {})
        if not isinstance(data, dict):
            return {"ipv4": False, "ipv6": False}
        return {
            "ipv4": bool(data.get("enableIPv4", False)),
            "ipv6": bool(data.get("enableIPv6", False)),
        }

    async def async_get_firewall_level(self) -> str:
        """Get IPv4 firewall security level."""
        return (
            await self._make_request(
                self.api.firewall.async_get_firewall_Level, {"conf": "IPv4"}
            )
        ).get("status", "Medium")

    async def async_set_firewall_level(self, level: str) -> None:
        """Set IPv4 firewall security level."""
        await self._make_request(
            self.api.firewall.async_set_firewall_Level,
            {"conf": "IPv4", "level": level},
        )
        await self._make_request(self.api.firewall.async_commit)

    async def _make_request(
        self, func: Callable[..., Any], *args: Any
    ) -> dict[str, Any]:
        """Execute request."""
        try:
            return await func(*args)
        except AiosysbusException as error:
            _LOGGER.error("Error while execute: %s (%s)", func.__name__, error)
        return {}

    @property
    def signal_device_new(self) -> str:
        """Event specific per Livebox entry to signal new device."""
        return f"{DOMAIN}-{self.unique_id}-device-new"

    @property
    def signal_wan_access_new(self) -> str:
        """Event specific per Livebox entry to signal new device."""
        return f"{DOMAIN}-{self.unique_id}-wan-accessnew"
