"""Coordinator for Livebox."""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict, deque
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any, cast

from aiosysbus import AIOSysbus
from aiosysbus.exceptions import AiosysbusException
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
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
from .event_log_store import MAX_EVENTS, EventLogStore
from .helpers import find_item
from .presence_utils import PresenceIndex, seen_record
from .settings_store import SettingsStore
from .upnp_utils import diff_upnp
from .repeater_store import RepeaterStore
from .topology_store import TopologyStore
from .traffic_history_store import TrafficHistoryStore
from .tv_decoder_store import TvDecoderStore

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(minutes=1)
TOPOLOGY_SCAN_INTERVAL = timedelta(minutes=15)
# Appareils inactifs mémorisés par la box (cible des règles NAT/DMZ…) : ça
# bouge peu, inutile de les relire à chaque cycle.
OFFLINE_DEVICES_SCAN_INTERVAL = timedelta(minutes=15)
# Écriture sur disque du « vu pour la dernière fois » : au plus toutes les
# 10 min (la valeur en mémoire est à jour à chaque cycle, et HA écrit le
# reste à l'arrêt).
LAST_SEEN_SAVE_INTERVAL = timedelta(minutes=10)
# Une règle est « oubliée » si son appareil est inconnu ou absent depuis 30 j
# (même seuil que le bandeau du panel, cf. lib/presence.js).
STALE_RULE_DAYS = 30
TOPOLOGY_BUILD_TIMEOUT = 30
# Événement publié sur le bus HA à chaque connexion/déconnexion/nouvel appareil
EVENT_DEVICE = f"{DOMAIN}_device_event"
# Ouverture/fermeture d'un port par UPnP (event = opened / closed).
EVENT_PORT_FORWARD = f"{DOMAIN}_port_forward_event"
# Écart max entre deux points d'historique pour calculer un débit WAN différentiel
MAX_RATE_GAP = timedelta(minutes=5)
# Requêtes Livebox concurrentes max pour les appels « un par appareil »
DEVICE_REQUEST_CONCURRENCY = 4


def _payload(raw: Any) -> Any:
    """Contenu utile d'une réponse sysbus : "status" s'il est renseigné, sinon "data"."""
    if not isinstance(raw, dict):
        return None
    status = raw.get("status")
    return status if status is not None else raw.get("data")


def _elapsed_seconds(previous: Any, now: datetime) -> float | None:
    """Seconds between an ISO-ish timestamp string (str(datetime)) and now."""
    if not isinstance(previous, str):
        return None
    try:
        prev_dt = datetime.fromisoformat(previous)
    except ValueError:
        return None
    if prev_dt.tzinfo is None:
        prev_dt = prev_dt.replace(tzinfo=DEFAULT_TIME_ZONE)
    return (now - prev_dt).total_seconds()


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
        self._all_devices: dict[str, Any] = {}
        self._active_counts: dict[str, int] = {"wifi": 0, "eth": 0}
        self._offline_devices: dict[str, Any] = {}
        self._offline_devices_at: datetime | None = None
        self._last_seen_saved_at: datetime | None = None
        self._stale_checked_at: datetime | None = None

        # Rolling in-memory history for the "Graphiques" tab (~12h at 1 update/min)
        self._traffic_history: deque[dict[str, Any]] = deque(maxlen=720)
        # Per-device traffic history keyed by MAC address (~12h at 1 update/min)
        # OrderedDict as a bounded LRU cache: keeps history growth in check even
        # when devices churn through randomized/rotating MAC addresses.
        self._device_history: OrderedDict[str, deque[dict[str, Any]]] = OrderedDict()
        self._device_history_max_macs = 200
        # Rolling connection/disconnection log for the "Événements" tab,
        # persisted (with the set of known MACs) by EventLogStore.
        self.event_log_store = EventLogStore(hass, config_entry.entry_id)

        self.repeater_store = RepeaterStore(hass, config_entry.entry_id)
        self.topology_store = TopologyStore(hass, config_entry.entry_id)
        self.tv_decoder_store = TvDecoderStore(hass, config_entry.entry_id)
        self.traffic_history_store = TrafficHistoryStore(hass, config_entry.entry_id)
        # Réglages ntfy, groupes, pauses (settings_store) ; `alerts` et
        # `groups` sont créés au setup (None tant que HA n'est pas prêt, et
        # dans les tests unitaires).
        self.settings_store = SettingsStore(hass, config_entry.entry_id)
        self.alerts: Any = None
        self.groups: Any = None
        self.monitor: Any = None
        self._last_upnp: list[dict[str, Any]] | None = None
        self._guest_status: dict[str, Any] = {}
        self._guest_until_at: datetime | None = None

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
        await self.event_log_store.async_load()
        if not self.event_log_store.known:
            self._seed_known_devices()
        await self.settings_store.async_load()
        from .alerts import OralinkAlerts  # import tardif : dépend de HA (webhook, network)
        from .groups import GroupManager

        from .monitor import Monitor

        self.alerts = OralinkAlerts(self.hass, self)
        self.groups = GroupManager(self.hass, self)
        self.monitor = Monitor(self.hass, self)
        await self.monitor.async_load()

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
            self._record_last_seen(self._all_devices)
            if self.monitor is not None:
                self.monitor.record_presence(self._all_devices)
            await self.async_refresh_offline_devices()

            device_traffic = await self.async_get_device_traffic()
            stats = await self.async_get_results()
            wan_counters = await self.async_get_wan_counters()
            # fiber_stats must be computed before _record_traffic_history so it can
            # serve as fallback byte-counter source when HomeLan.getWANCounters is
            # empty (common on Livebox 6 SG60 firmware).
            fiber_stats = await self.async_get_fiber_stats()
            fiber_status = await self.async_get_fiber_status()
            if self.monitor is not None:
                self.monitor.record_fiber(fiber_status)
            await self._record_traffic_history(device_traffic, wan_counters, fiber_stats)

            dhcp_pool = await self.async_get_dhcp_pool()
            dhcp_leases = await self.async_get_dhcp_leases(pool=dhcp_pool)
            (
                memory_status,
                ntp_synced,
                cgnat_active,
                device_services,
                iptv_status,
                connection_extra,
            ) = await asyncio.gather(
                self.async_get_memory_status(),
                self.async_get_ntp_synced(),
                self.async_get_cgnat_active(),
                self.async_get_device_services(infos.get("BaseMAC", "")),
                self.async_get_iptv_status(),
                self.async_get_connection_extra(),
            )
            result = {
                "cmissed": cmissed,
                "callers": callers,
                "devices": devices,
                "all_devices": self._all_devices,
                "offline_devices": self._offline_devices,
                "dsl_status": await self.async_get_dsl_status(),
                "infos": infos,
                "nmc": await self.async_get_nmc(),
                "wan_status": await self.async_get_wan_status(),
                "wifi": await self.async_is_wifi(),
                "guest_wifi": await self.async_is_guest_wifi(),
                "guest_wifi_until": self._guest_until(),
                "count_wired_devices": self._active_counts["eth"],
                "count_wireless_devices": self._active_counts["wifi"],
                "wan_rate": self._latest_wan_rate(),
                "count_devices_24ghz": sum(
                    1 for d in devices.values()
                    if d.get("Active") and d.get("OperatingFrequencyBand") == "2.4GHz"
                ),
                "count_devices_5ghz": sum(
                    1 for d in devices.values()
                    if d.get("Active") and d.get("OperatingFrequencyBand") == "5GHz"
                ),
                "count_devices_6ghz": sum(
                    1 for d in devices.values()
                    if d.get("Active") and d.get("OperatingFrequencyBand") == "6GHz"
                ),
                "memory_status": memory_status,
                "ntp_synced": ntp_synced,
                "cgnat_active": cgnat_active,
                "device_services": device_services,
                "iptv_status": iptv_status,
                "connection_extra": connection_extra,
                "devices_wan_access": await self.async_get_devices_schedules(devices),
                "ddns": await self.async_get_ddns(),
                "wifi_stats": await self.async_get_wifi_stats(),
                "fiber_status": fiber_status,
                "fiber_stats": fiber_stats,
                "remote_access": await self.async_is_remote_access(),
                "topology_via_device": topology_via_device,
                "topology_repeaters": topology_repeaters,
                "lan": await self.async_get_lan(devices),
                "upnp": await self._async_port_forwarding_with_events(),
                "ptf": await self.async_get_protocol_forwarding(),
                "upnp_igd": await self.async_get_upnp_igd(),
                "dhcp_pool": dhcp_pool,
                "dhcp_leases": dhcp_leases,
                "guest_dhcp_leases": await self.async_get_dhcp_leases(
                    "guest", pool=dhcp_pool
                ),
                "dhcp_static_leases": await self.async_get_dhcp_static_leases(),
                "stats": stats,
                "wan_counters": wan_counters,
                "device_traffic": device_traffic,
                "firewall_level": await self.async_get_firewall_level(),
                "reboot_history": await self.async_get_reboot_history(),
                "ping_response": await self.async_get_ping_response(),
                "contacts": await self.async_get_contacts(),
                "speedtest": await self.async_get_speedtest(),
            }
            self._update_stale_rules(result)
            return result
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
        # Vue complète (Wi-Fi + Ethernet) pour le panel, quelles que soient les
        # options de suivi (qui ne pilotent que les entités device_tracker).
        self._all_devices = {
            device["Key"]: device
            for group in ("wifi", "eth")
            for device in devices.get(group, []) or []
            if isinstance(device, dict) and device.get("Key")
        }
        # Appareils connectés par type, quelles que soient les options de suivi
        # (le capteur « Appareils Ethernet » restait à 0 sans suivi LAN).
        self._active_counts = {
            group: sum(
                1 for d in devices.get(group, []) or [] if isinstance(d, dict) and d.get("Active")
            )
            for group in ("wifi", "eth")
        }
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
            start_time = call.get("startTime")
            if not start_time:
                continue
            utc_dt = datetime.strptime(start_time, "%Y-%m-%dT%H:%M:%SZ")
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
            if call.get("callType") == "missed":
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

    async def async_get_speedtest(self) -> dict[str, Any]:
        """Derniers résultats du test de débit mémorisés par la box (SpeedTest:getWANResults).

        Débits fournis en kbit/s (vérifié sur Livebox 6) → convertis en Mbit/s.
        """
        try:
            raw = _payload(await self.api._auth.post("SpeedTest", "getWANResults", None))
        except Exception as err:  # noqa: BLE001 — objet absent sur certains modèles
            _LOGGER.debug("Could not fetch speedtest results: %s", err)
            return {}
        if not isinstance(raw, dict):
            return {}

        def _direction(key: str) -> dict[str, Any]:
            d = raw.get(key) or raw.get(key.lower()) or {}
            rate = d.get("rate") if isinstance(d, dict) else None
            if not isinstance(rate, (int, float)) or rate <= 0:
                return {}
            return {
                "rate_mbit": round(rate / 1000, 2),
                "latency_ms": d.get("latency"),
                "end": d.get("end"),
            }

        box = {"downstream": _direction("Downstream"), "upstream": _direction("Upstream")}
        if box["downstream"] or self.monitor is None or not self.monitor.latest_speedtest:
            return box
        # La box n'a pas de résultat (cas de la Livebox 6) : capteurs alimentés
        # par le dernier test d'Oralink (speedtest.py).
        return self._own_speedtest_format(self.monitor.latest_speedtest)

    @staticmethod
    def _own_speedtest_format(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "downstream": {"rate_mbit": entry.get("down"), "latency_ms": entry.get("latency"),
                           "end": entry.get("time")},
            "upstream": {"rate_mbit": entry.get("up"), "latency_ms": entry.get("latency"),
                         "end": entry.get("time")},
            "source": "oralink",
        }

    def apply_own_speedtest(self, entry: dict[str, Any]) -> None:
        """Met à jour tout de suite les capteurs Speedtest après un test."""
        if isinstance(self.data, dict) and not (
            self.data.get("speedtest", {}).get("downstream") and
            self.data["speedtest"].get("source") != "oralink"
        ):
            self.data["speedtest"] = self._own_speedtest_format(entry)
            self.async_update_listeners()

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
        """Get Guest Wifi status.

        ⚠ Livebox 6 : avec un minuteur actif, `Enable` repasse à False alors
        que le réseau est allumé — seul `Status` (« Enabled ») est fiable.
        """
        guest_wifi = (await self._make_request(self.api.nmc.async_get_guest_wifi)).get(
            "status", {}
        )
        if not isinstance(guest_wifi, dict) or not guest_wifi:
            return self._guest_on(self._guest_status)  # lecture en échec
        previous_until = self._guest_until_at
        was_on = self._guest_on(self._guest_status)
        self._guest_status = guest_wifi
        is_on = self._guest_on(guest_wifi)
        self._guest_until_at = await self._async_guest_timer_end() if is_on else None
        if (
            was_on
            and not is_on
            and previous_until
            and datetime.now(tz=UTC) >= previous_until - timedelta(minutes=3)
            and self.alerts is not None
        ):
            # Éteint par le minuteur de la box (fin de la durée d'activation).
            self.hass.async_create_task(self.alerts.async_notify(
                "guest_off", "Wi-Fi invité éteint",
                "Le Wi-Fi invité s'est éteint à la fin de sa durée d'activation.",
                tags=["wifi"],
            ))
        return is_on

    @staticmethod
    def _guest_on(status: dict[str, Any]) -> bool:
        if status.get("Status"):
            return status.get("Status") == "Enabled"
        return status.get("Enable") is True

    async def _async_guest_timer_end(self) -> datetime | None:
        """Fin du minuteur du Wi-Fi invité, d'après le temps restant (s).

        On n'utilise pas `NMC.Guest.ValidTime` : la box y écrit l'heure locale
        suffixée « Z » (décalée d'une heure ou deux).
        """
        try:
            raw = await self.api.devices._auth.post(
                "NMC.WlanTimer", "getActivationTimer", {"InterfaceName": "guest"}
            )
            remaining = int((raw or {}).get("status") or 0)
        except (AiosysbusException, TypeError, ValueError):
            return None
        return datetime.now(tz=UTC) + timedelta(seconds=remaining) if remaining > 0 else None

    def _guest_until(self) -> str | None:
        """Heure d'extinction programmée du Wi-Fi invité (ISO), sinon None."""
        return self._guest_until_at.isoformat() if self._guest_until_at else None

    # ── Accès Internet par appareil (planificateur ToD) ──────────────────────

    async def async_is_wan_blocked(self, mac: str) -> bool:
        """Accès Internet coupé (override « Disable » du planning ToD) ?"""
        raw = await self.api.devices._auth.post(
            "Scheduler", "getSchedule", {"type": "ToD", "ID": mac.upper()}
        )
        info = (raw or {}).get("data", {}).get("scheduleInfo") if isinstance(raw, dict) else None
        return isinstance(info, dict) and info.get("override") == "Disable"

    async def async_set_wan_blocked(self, mac: str, blocked: bool, refresh: bool = True) -> None:
        """Coupe ou rétablit l'accès Internet d'un appareil (lève en cas d'échec)."""
        mac = mac.upper()
        auth = self.api.devices._auth
        raw = await auth.post("Scheduler", "getSchedule", {"type": "ToD", "ID": mac})
        has_schedule = isinstance(raw, dict) and bool(raw.get("status"))
        if has_schedule:
            await auth.post(
                "Scheduler", "overrideSchedule",
                {"type": "ToD", "ID": mac, "override": "Disable" if blocked else "Enable"},
            )
        elif blocked:
            await auth.post("Scheduler", "addSchedule", {"type": "ToD", "info": {
                "ID": mac, "base": "Weekly", "def": "Enable", "schedule": [],
                "enable": True, "override": "Disable",
            }})
        # Relit tout de suite le planning de cet appareil : sans ça, l'état
        # affiché restait l'ancien jusqu'au prochain cycle complet.
        try:
            info = await self.async_get_device_schedule(mac)
            if isinstance(self.data, dict):
                cache = self.data.setdefault("devices_wan_access", {})
                key = next((k for k in cache if k.upper() == mac), mac)
                cache[key] = info
        except Exception:  # noqa: BLE001 — le refresh complet prendra le relais
            pass
        if refresh:
            await self.async_request_refresh()

    def device_info_by_mac(self, mac: str) -> dict[str, Any]:
        mac = mac.upper()
        for source in (self._all_devices, self._offline_devices):
            for key, device in source.items():
                if key.upper() == mac:
                    return device
        seen = self.event_log_store.seen.get(mac) or {}
        return {"Name": seen.get("name", "")}

    # ── Redirections UPnP : événements à l'ouverture / fermeture ─────────────

    async def _async_port_forwarding_with_events(self) -> list[dict[str, Any]]:
        rules = await self.async_get_port_forwarding()
        previous = self._last_upnp
        if not rules and previous:
            # Liste vide alors qu'il y avait des règles : très probablement un
            # échec de lecture, pas une fermeture générale.
            return rules
        self._last_upnp = rules
        if previous is None:
            return rules  # premier cycle : référence, rien à signaler
        opened, closed = diff_upnp(previous, rules)
        if not opened and not closed:
            return rules
        index = PresenceIndex(
            self._all_devices, self._offline_devices, self.event_log_store.seen,
            datetime.now(tz=UTC),
        )
        now = str(datetime.now(tz=DEFAULT_TIME_ZONE))
        journal: list[dict[str, Any]] = []
        for kind, items in (("opened", opened), ("closed", closed)):
            for rule in items:
                presence = index.by_ip(rule.get("destination_ip")) or {}
                payload = {
                    "entry_id": self.config_entry.entry_id,
                    "event": kind,
                    "rule_id": rule.get("id"),
                    "description": rule.get("name"),
                    "protocol": rule.get("protocol"),
                    "external_port": rule.get("external_port"),
                    "internal_port": rule.get("internal_port"),
                    "destination_ip": rule.get("destination_ip"),
                    "mac": presence.get("mac", ""),
                    "name": presence.get("name", ""),
                }
                self.hass.bus.async_fire(EVENT_PORT_FORWARD, payload)
                if kind == "opened":
                    journal.append({
                        "time": now, "event": "port_opened",
                        "mac": payload["mac"], "ip": rule.get("destination_ip", ""),
                        "name": payload["name"] or rule.get("destination_ip", ""),
                        "port": rule.get("external_port"), "protocol": rule.get("protocol"),
                        "description": rule.get("name"),
                    })
                    if self.alerts is not None:
                        self.hass.async_create_task(
                            self.alerts.async_upnp_opened(rule, presence or None)
                        )
        if journal:
            store = self.event_log_store
            store.events[:0] = reversed(journal)
            del store.events[MAX_EVENTS:]
            store.async_schedule_save()
        return rules

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

    async def async_get_devices_schedules(
        self, devices: dict[str, Any]
    ) -> dict[str, Any]:
        """Get the ToD schedule of every device, with bounded concurrency.

        Une requête par appareil : en séquentiel (~50 appareils) c'était le
        poste le plus lent de chaque cycle. Le sémaphore évite de saturer le
        serveur web de la Livebox.
        """
        semaphore = asyncio.Semaphore(DEVICE_REQUEST_CONCURRENCY)

        async def _one(key: str) -> Any:
            async with semaphore:
                return await self.async_get_device_schedule(key)

        keys = list(devices)
        results = await asyncio.gather(*(_one(key) for key in keys))
        return dict(zip(keys, results, strict=True))

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

    def _seed_known_devices(self) -> None:
        """Amorce les appareils connus depuis le registre d'appareils HA.

        Au premier lancement de la détection, les appareils hors ligne (absents
        de la liste en mode « Active only ») ne doivent pas être signalés comme
        « nouveaux » à leur prochaine connexion : ceux qui ont déjà un appareil
        HA créé par cette intégration sont donc considérés comme connus.
        """
        registry = dr.async_get(self.hass)
        now = str(datetime.now(tz=DEFAULT_TIME_ZONE))
        for device in dr.async_entries_for_config_entry(
            registry, self.config_entry.entry_id
        ):
            for domain, identifier in device.identifiers:
                if domain == DOMAIN and ":" in identifier:
                    self.event_log_store.known.setdefault(
                        identifier,
                        {"name": device.name_by_user or device.name or identifier,
                         "first_seen": now},
                    )

    def presence_index(self, data: dict[str, Any] | None = None) -> PresenceIndex:
        data = data if data is not None else (self.data or {})
        return PresenceIndex(
            data.get("all_devices") or data.get("devices", {}),
            data.get("offline_devices"),
            self.event_log_store.seen,
            datetime.now(tz=UTC),
        )

    def _update_stale_rules(self, data: dict[str, Any]) -> None:
        """Réparations HA : règles qui visent un appareil disparu (> 30 j).

        Toutes les 15 min. Les règles UPnP sont exclues (elles expirent seules).
        """
        if self.monitor is None:
            return
        now = datetime.now(tz=UTC)
        if self._stale_checked_at and now - self._stale_checked_at < OFFLINE_DEVICES_SCAN_INTERVAL:
            return
        self._stale_checked_at = now
        index = self.presence_index(data)

        def stale(p: dict[str, Any] | None) -> bool:
            if not p:
                return False
            return p["state"] == "unknown" or (
                p["state"] == "offline" and (p.get("offline_days") or 0) >= STALE_RULE_DAYS
            )

        found: list[str] = []
        for rule in data.get("upnp") or []:
            if str(rule.get("id", "")).startswith("webui_"):
                p = index.by_ip(rule.get("destination_ip"))
                if stale(p):
                    found.append(f"Redirection de port « {rule.get('name')} » → {rule.get('destination_ip')}")
        for rule in data.get("ptf") or []:
            p = index.by_ip(rule.get("destination_ip"))
            if stale(p):
                found.append(f"Redirection de protocole « {rule.get('name')} » → {rule.get('destination_ip')}")
        for lease in data.get("dhcp_static_leases") or []:
            p = index.by_mac(lease.get("Mac Address"))
            if stale(p):
                label = lease.get("Name") or p.get("name") or lease.get("Mac Address")
                found.append(f"Réservation DHCP {lease.get('IP Address')} ({label})")
        self.monitor.update_stale_issue(found)

    def _record_last_seen(self, devices: dict[str, Any]) -> None:
        """Mémorise, pour chaque appareil actif, la date et ses adresses.

        Base de la colonne « appareil visé » des règles (cf. presence_utils) :
        la box efface l'IP d'un appareil dès qu'il se déconnecte.
        """
        store = self.event_log_store
        now_dt = datetime.now(tz=UTC)
        now = now_dt.isoformat()
        changed = False
        for mac, device in devices.items():
            if not device.get("Active"):
                continue
            previous = store.seen.get(mac)
            record = seen_record(device, previous, now)
            if previous is None or {**previous, "last_seen": now} != record:
                changed = True
            store.seen[mac] = record
        due = (
            self._last_seen_saved_at is None
            or now_dt - self._last_seen_saved_at >= LAST_SEEN_SAVE_INTERVAL
        )
        if changed or due:
            self._last_seen_saved_at = now_dt
            store.async_schedule_save()

    async def async_refresh_offline_devices(self) -> None:
        """Relit (toutes les 15 min) les appareils inactifs connus de la box."""
        now = datetime.now(tz=UTC)
        if (
            self._offline_devices_at is not None
            and now - self._offline_devices_at < OFFLINE_DEVICES_SCAN_INTERVAL
        ):
            return
        self._offline_devices_at = now
        parameters = {
            "expression": {
                "wifi": '.Active==false && wifi && (edev || hnid) and .PhysAddress!=""',
                "eth": '.Active==false && eth && (edev || hnid) and .PhysAddress!=""',
            }
        }
        result = (
            await self._make_request(self.api.devices.async_get_devices, parameters)
        ).get("status", {})
        if not isinstance(result, dict) or not result:
            # Échec de la requête (_make_request renvoie {}) : on garde la
            # liste précédente et on réessaiera au prochain cycle.
            self._offline_devices_at = None
            return
        self._offline_devices = {
            device["Key"]: device
            for group in ("wifi", "eth")
            for device in result.get(group, []) or []
            if isinstance(device, dict) and device.get("Key")
        }

    def _record_device_events(
        self, previous_devices: dict[str, Any], devices: dict[str, Any]
    ) -> None:
        """Journalise connexions, déconnexions et nouveaux appareils.

        Compare les ensembles d'appareils *actifs* entre deux rafraîchissements
        plutôt que les appareils présents dans les deux listes : en mode
        « Active only » (défaut), un appareil déconnecté disparaît purement et
        simplement de `devices`, et un appareil qui revient y réapparaît — une
        comparaison limitée aux MAC communes ne voyait donc ni l'un ni l'autre.

        Chaque événement est aussi publié sur le bus HA (`oralink_device_event`,
        champ `event` = connected / disconnected / new) pour les automatisations.
        """
        store = self.event_log_store
        current_active = {
            mac for mac, device in devices.items() if device.get("Active")
        }
        if previous_devices:
            previous_active = {
                mac for mac, d in previous_devices.items() if d.get("Active")
            }
        else:
            # Premier rafraîchissement depuis le démarrage : on repart de l'état
            # sauvegardé pour ne pas rater ce qui a changé pendant l'arrêt.
            previous_active = set(store.active)

        if not devices and previous_active:
            # Liste vide alors que des appareils étaient actifs : très
            # probablement un échec de requête (_make_request renvoie {}), pas
            # une déconnexion générale — on n'enregistre rien.
            return

        now = str(datetime.now(tz=DEFAULT_TIME_ZONE))
        new_events: list[dict[str, Any]] = []

        def _event(mac: str, device: dict[str, Any], kind: str) -> None:
            new_events.append({
                "time": now,
                "mac": mac,
                "name": device.get("Name") or mac,
                "ip": device.get("IPAddress", "") or "",
                "event": kind,
            })

        # Nouveaux appareils : jamais vus auparavant. Au tout premier lancement
        # (aucun appareil connu), on amorce la liste sans rien signaler.
        bootstrap = not store.known
        for mac, device in devices.items():
            if mac in store.known:
                continue
            store.known[mac] = {"name": device.get("Name") or mac, "first_seen": now}
            if not bootstrap:
                _event(mac, device, "new")

        if previous_devices or store.active:
            for mac in sorted(current_active - previous_active):
                _event(mac, devices[mac], "connected")
            for mac in sorted(previous_active - current_active):
                device = devices.get(mac) or previous_devices.get(mac) or {
                    "Name": store.known.get(mac, {}).get("name", mac)
                }
                _event(mac, device, "disconnected")

        changed = bool(new_events) or current_active != store.active
        store.active = current_active
        if new_events:
            store.events[:0] = reversed(new_events)
            del store.events[MAX_EVENTS:]
            for event in new_events:
                self.hass.bus.async_fire(
                    EVENT_DEVICE,
                    {"entry_id": self.config_entry.entry_id, **event},
                )
                if event["event"] == "new" and self.alerts is not None:
                    self.hass.async_create_task(self.alerts.async_new_device(event))
        if changed or bootstrap:
            store.async_schedule_save()

    async def _record_traffic_history(
        self,
        device_traffic: dict[str, Any],
        wan_counters: dict[str, Any],
        fiber_stats: dict[str, Any] | None = None,
    ) -> None:
        """Append an aggregate traffic sample for the "Graphiques" tab."""
        # Débit agrégé par appareil (fonctionne uniquement si HomeLan.getDevicesResults
        # retourne des données — souvent vide sur Livebox 6 SG60).
        rate_rx = round(sum(t.get("rate_rx", 0) for t in device_traffic.values()), 3)
        rate_tx = round(sum(t.get("rate_tx", 0) for t in device_traffic.values()), 3)

        # Débit WAN calculé depuis le différentiel des compteurs cumulés.
        # HomeLan.getWANCounters est souvent vide sur Livebox 6 SG60 — on se
        # rabat alors sur les stats de l'interface veip0 (NeMo.Intf.veip0:getNetDevStats)
        # qui expose BytesReceived/BytesSent fiables.
        wan_rx = wan_counters.get("BytesReceived") if isinstance(wan_counters, dict) else None
        wan_tx = wan_counters.get("BytesSent") if isinstance(wan_counters, dict) else None
        if wan_rx is None and isinstance(fiber_stats, dict):
            # NeMo.Intf.veip0:getNetDevStats may use Linux net-dev naming (RxBytes/TxBytes)
            # or sysbus naming (BytesReceived/BytesSent) depending on firmware.
            wan_rx = fiber_stats.get("BytesReceived") or fiber_stats.get("RxBytes")
            wan_tx = fiber_stats.get("BytesSent") or fiber_stats.get("TxBytes")
        now = datetime.now(tz=DEFAULT_TIME_ZONE)
        wan_rate_rx = 0.0
        wan_rate_tx = 0.0
        if wan_rx is not None and self._traffic_history:
            prev = self._traffic_history[-1]
            elapsed = _elapsed_seconds(prev.get("time"), now)
            prev_rx = prev.get("wan_rx_bytes")
            prev_tx = prev.get("wan_tx_bytes")
            # Débit = delta d'octets / temps réellement écoulé depuis le point
            # précédent (et non un intervalle supposé de 60 s : un rafraîchissement
            # manuel, un poll en retard ou un redémarrage de HA — dernier point
            # rechargé depuis le Store, potentiellement vieux de plusieurs heures —
            # produisaient sinon des pics aberrants). Au-delà de MAX_RATE_GAP on
            # considère le delta non significatif (trou dans l'historique).
            if (
                elapsed is not None
                and 0 < elapsed <= MAX_RATE_GAP.total_seconds()
                and isinstance(prev_rx, (int, float))
                and isinstance(prev_tx, (int, float))
            ):
                wan_rate_rx = round(
                    max(0, wan_rx - prev_rx) / elapsed * 8 / 1_000_000, 3
                )
                wan_rate_tx = round(
                    max(0, (wan_tx or 0) - prev_tx) / elapsed * 8 / 1_000_000, 3
                )

        now_str = str(now)
        self._traffic_history.append({
            "time": now_str,
            "rate_rx": rate_rx,
            "rate_tx": rate_tx,
            "wan_rate_rx": wan_rate_rx,
            "wan_rate_tx": wan_rate_tx,
            "wan_rx_bytes": wan_rx,
            "wan_tx_bytes": wan_tx,
        })

        # Per-device history — only for devices that have traffic data
        for mac, t in device_traffic.items():
            if t.get("rate_rx", 0) > 0 or t.get("rate_tx", 0) > 0:
                if mac not in self._device_history:
                    self._device_history[mac] = deque(maxlen=720)
                    while len(self._device_history) > self._device_history_max_macs:
                        self._device_history.popitem(last=False)
                self._device_history.move_to_end(mac)
                self._device_history[mac].append({
                    "time": now_str,
                    "rate_rx": t.get("rate_rx", 0),
                    "rate_tx": t.get("rate_tx", 0),
                })

        self.traffic_history_store.async_schedule_save(list(self._traffic_history))

    def _latest_wan_rate(self) -> dict[str, float | None]:
        """Dernier débit WAN calculé (Mbit/s), None tant qu'il n'y a pas 2 points."""
        if len(self._traffic_history) < 2:
            return {"rx": None, "tx": None}
        last = self._traffic_history[-1]
        return {"rx": last.get("wan_rate_rx"), "tx": last.get("wan_rate_tx")}

    @property
    def event_log(self) -> list[dict[str, Any]]:
        """Recent connection/disconnection/new-device events (most recent first)."""
        return list(self.event_log_store.events)

    @property
    def traffic_history(self) -> list[dict[str, Any]]:
        """Aggregate traffic samples collected over time (oldest first)."""
        return list(self._traffic_history)

    def get_device_history(self, mac: str) -> list[dict[str, Any]]:
        """Per-device traffic samples for the given MAC (oldest first)."""
        dq = self._device_history.get(mac)
        return list(dq) if dq else []

    @property
    def device_history_keys(self) -> list[str]:
        """MACs for which we have per-device traffic history."""
        return list(self._device_history.keys())

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

    async def async_get_protocol_forwarding(self) -> list[dict[str, Any]]:
        """Get protocol/port-triggering (PTF) rules — not wrapped by aiosysbus, direct call."""
        try:
            raw = await self.api.firewall._auth.post("Firewall", "getProtocolForwarding")
        except AiosysbusException:
            return []
        forwarding = raw.get("status", {}) if isinstance(raw, dict) else {}
        if not isinstance(forwarding, dict):
            return []
        rules = []
        for rule_id, rule in forwarding.items():
            if not isinstance(rule, dict):
                continue
            rules.append(
                {
                    "id": rule.get("Id") or rule_id,
                    "name": rule.get("Description") or rule.get("Id") or rule_id,
                    "enable": rule.get("Enable", rule.get("Status") == "Enabled"),
                    "status": rule.get("Status", ""),
                    "protocol": rule.get("Protocol", ""),
                    "destination_ip": rule.get("DestinationIPAddress", ""),
                    "source_prefix": rule.get("SourcePrefix", ""),
                }
            )
        return rules

    async def async_get_dhcp_pool(self) -> dict[str, Any]:
        """Pools du serveur DHCPv4 (`default`, `guest`) : Enable, plage, durée des baux."""
        if self.model == 5656:
            return {}
        data = (await self._make_request(self.api.dhcp.async_get_dhcp_pool)).get(
            "status", {}
        )
        return data if isinstance(data, dict) else {}

    async def async_get_dhcp_leases(
        self, domain: str = "default", pool: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Get dhcp leases (`pool` : résultat déjà lu de async_get_dhcp_pool)."""
        if self.model == 5656:
            return []

        data = pool if pool is not None else await self.async_get_dhcp_pool()
        if (data.get(domain) or {}).get("Enable", False) is False:
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

    async def async_get_memory_status(self) -> dict[str, Any]:
        """Get router memory status (Total/Free in kB)."""
        try:
            raw = await self.api._auth.post("DeviceInfo.MemoryStatus", "get", None)
            return (raw or {}).get("status", {}) or {}
        except Exception as err:
            _LOGGER.debug("Could not fetch memory status: %s", err)
            return {}

    async def async_get_ntp_synced(self) -> bool:
        """Return True if the router NTP clock is synchronised."""
        raw = await self._make_request(self.api.time.async_get_status)
        status = raw.get("status") or raw.get("data") or {}
        if not isinstance(status, dict):
            return False
        # Livebox 6 : {"status": null, "data": {"status": "Synchronized"}} — pas
        # de clé NTPSync (le capteur restait à « non synchronisé »).
        if "NTPSync" in status:
            return bool(status["NTPSync"])
        return str(status.get("status", "")).lower() == "synchronized"

    async def async_get_cgnat_active(self) -> bool:
        """Return True if CG-NAT (DS-Lite / Demand) is active on this line."""
        try:
            raw = await self.api._auth.post("NMC.ServiceEligibility.DSLITE", "get", None)
            return bool((raw or {}).get("status", {}).get("Demand", False))
        except Exception as err:
            _LOGGER.debug("Could not fetch CG-NAT status: %s", err)
            return False

    async def async_get_device_services(self, base_mac: str) -> dict[str, Any]:
        """Get per-service activation flags for the box itself (Devices.Device.<mac>:get)."""
        if not base_mac:
            return {}
        try:
            raw = await self.api._auth.post(f"Devices.Device.{base_mac}", "get", None)
            return (raw or {}).get("status", {}) or {}
        except Exception as err:
            _LOGGER.debug("Could not fetch device services: %s", err)
            return {}

    async def async_get_iptv_status(self) -> dict[str, Any]:
        """Get IPTV status, multi-screens flag and config (NMC.OrangeTV)."""
        status_raw, multiscreens_raw, config_raw = (
            r if isinstance(r, dict) else None
            for r in await asyncio.gather(
                self.api._auth.post("NMC.OrangeTV", "getIPTVStatus", None),
                self.api._auth.post("NMC.OrangeTV", "getIPTVMultiScreens", None),
                self.api._auth.post("NMC.OrangeTV", "getIPTVConfig", None),
                return_exceptions=True,
            )
        )

        # getIPTVStatus response shape: {"status": {"IPTVStatus": [...]}} on most
        # models, or the list directly on others.
        # Selon l'objet, la Livebox répond dans "status" ou dans "data"
        # (Livebox 6 : {"status": null, "data": {"IPTVStatus": "Available"}}).
        status = _payload(status_raw)
        iptv_status = status.get("IPTVStatus") if isinstance(status, dict) else status

        multiscreens_status = _payload(multiscreens_raw)
        multiscreens = (
            multiscreens_status.get("Enable")
            if isinstance(multiscreens_status, dict)
            else multiscreens_status
        )

        config_status = _payload(config_raw)
        if isinstance(config_status, list):
            # Livebox 6 : liste de canaux (VLAN, multicast…)
            config_status = {"channels": config_status}

        return {
            "status": iptv_status,
            "multi_screens": multiscreens,
            "config": config_status if isinstance(config_status, dict) else {},
        }

    async def async_get_connection_extra(self) -> dict[str, Any]:
        """Get primary WAN error code, VLAN ID, MTU, IPv6 autodetect mode and CG-NAT status."""
        # return_exceptions : un objet absent sur ce modèle (ex.
        # NMC.ServiceEligibility.DSLITE sur Livebox 6 → « Object or parameter
        # not found ») ne doit pas faire perdre VLAN, MTU, etc.
        error_raw, vlan_raw, mtu_raw, autodetect_raw, cgnat_raw = (
            r if isinstance(r, dict) else None
            for r in await asyncio.gather(
                self.api._auth.post("NMC.Error", "getPrimaryErrorCode", None),
                self.api._auth.post("NeMo.Intf.data", "getFirstParameter", {"name": "VLANID"}),
                self.api._auth.post("NeMo.Intf.data", "getFirstParameter", {"name": "MTU"}),
                self.api._auth.post("NMC.Autodetect", "get", None),
                self.api._auth.post("NMC.ServiceEligibility.DSLITE", "get", None),
                return_exceptions=True,
            )
        )

        error_code = (error_raw or {}).get("status") or None
        vlan_raw_val = (vlan_raw or {}).get("status")
        mtu_raw_val = (mtu_raw or {}).get("status")
        autodetect = (autodetect_raw or {}).get("status")
        cgnat = (cgnat_raw or {}).get("status")

        try:
            vlan_id = int(vlan_raw_val) if vlan_raw_val is not None else None
        except (TypeError, ValueError):
            vlan_id = None
        try:
            mtu = int(mtu_raw_val) if mtu_raw_val is not None else None
        except (TypeError, ValueError):
            mtu = None

        return {
            "error_code": error_code if isinstance(error_code, str)
                else (str(error_code) if error_code is not None else None),
            "vlan_id": vlan_id,
            "mtu": mtu,
            "autodetect": autodetect if isinstance(autodetect, dict) else {},
            "cgnat": cgnat if isinstance(cgnat, dict) else {},
        }

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
