import json, sys
sys.path.insert(0, '.')
from lb import Livebox
calls = {
 "devices": ("Devices", "get", {"expression": {"wifi": 'wifi && (edev || hnid) and .PhysAddress!=""', "eth": 'eth && (edev || hnid) and .PhysAddress!=""'}}),
 "dhcp_leases": ("DHCPv4.Server.Pool.default", "getLeases", {}),
 "dhcp_static": ("DHCPv4.Server.Pool.default", "getStaticLeases", {}),
 "nat": ("Firewall", "getPortForwarding", {}),
 "ptf": ("Firewall", "getProtocolForwarding", {}),
 "dmz": ("Firewall", "getDMZ", {}),
 "ping": ("Firewall", "getRespondToPing", {"sourceInterface": "data"}),
 "fwlevel": ("Firewall", "getFirewallLevel", {}),
 "wan": ("NMC", "getWANStatus", {}),
 "nmc": ("NMC", "get", {}),
 "devinfo": ("DeviceInfo", "get", {}),
 "ddns_hosts": ("DynDNS", "getHosts", {}),
 "ddns_global": ("DynDNS", "getGlobalEnable", {}),
 "ddns_services": ("DynDNS", "getServices", {}),
 "upnp": ("UPnP-IGD", "get", {}),
 "leds_orange": ("LEDs.LED.Orange", "get", {}),
 "leds_white": ("LEDs.LED.White", "get", {}),
 "screen": ("Screen", "getShowWifiPassword", {}),
 "backup": ("NMC.NetworkConfig", "get", {}),
 "calls": ("VoiceService.VoiceApplication", "getCallList", {}),
 "contacts": ("Phonebook", "getAllContacts", {}),
 "trunks": ("VoiceService.VoiceApplication", "listTrunks", {}),
 "speedtest": ("SpeedTest", "getWANResults", {}),
 "time": ("Time", "getTime", {}),
 "time_utc": ("Time", "getUTCTime", {}),
 "time_status": ("Time", "getStatus", {}),
 "tz": ("Time", "getLocalTimeZoneName", {}),
 "ntp": ("Time", "getNTPServers", {}),
 "usb": ("USBHosts", "getDevices", {}),
 "power": ("PowerManagement", "getProfiles", {}),
 "pm": ("PowerManagement", "get", {}),
 "oremote": ("OrangeRemoteAccess", "get", {}),
 "wifi": ("NMC.Wifi", "get", {}),
 "guest": ("NMC.Guest", "get", {}),
 "remote": ("RemoteAccess", "get", {}),
 "iptv_status": ("NMC.OrangeTV", "getIPTVStatus", {}),
 "iptv_multi": ("NMC.OrangeTV", "getIPTVMultiScreens", {}),
 "iptv_conf": ("NMC.OrangeTV", "getIPTVConfig", {}),
 "vlan": ("NeMo.Intf.data", "getFirstParameter", {"name": "VLANID"}),
 "mtu": ("NeMo.Intf.data", "getFirstParameter", {"name": "MTU"}),
 "dslite": ("NMC.ServiceEligibility.DSLITE", "get", {}),
 "error": ("NMC.Error", "getPrimaryErrorCode", {}),
 "reboot": ("NMC.Reboot.Reboot", "get", {}),
 "gpon": ("NeMo.Intf.veip0", "getMIBs", {"mibs": "gpon"}),
 "wanstats": ("NeMo.Intf.veip0", "getNetDevStats", {}),
 "memory": ("DeviceInfo.MemoryStatus", "get", {}),
 "routes": ("NMC.LAN", "getStaticRoutes", {}),
 "wlansched": ("WLanScheduler", "get", {}),
 "topo": ("TopologyDiagnostics", "get", {}),
 "homelan_intf": ("HomeLan.Interface", "get", {}),
 "dhcp_pool": ("DHCPv4.Server", "getDHCPServerPool", {}),
}
lb = Livebox(); out = {}
for k, (svc, m, p) in calls.items():
    try: out[k] = lb.call(svc, m, p)
    except Exception as e: out[k] = {"__exc": str(e)}
lb.logout()
json.dump(out, open("box_raw.json", "w"), indent=1, ensure_ascii=False)
for k, v in out.items():
    s = json.dumps(v, ensure_ascii=False)
    print(f"{k:14} {len(s):6}o  {s[:110]}")
