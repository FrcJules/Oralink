import json
O = json.load(open("oralink_reads.json")); B = json.load(open("box_raw.json"))
st = lambda k: B[k].get("status")
res = []
def check(feature, ok, detail=""):
    res.append((feature, "OK " if ok else "KO ", detail)); 

# Appareils
box_devs = st("devices"); allb = {d["Key"]: d for grp in box_devs.values() for d in grp}
act = {k for k, d in allb.items() if d.get("Active")}
ora = {d["mac"]: d for d in O["livebox/devices"]}
check("Appareils actifs (Wi-Fi + filaires)", act <= set(ora), f"Oralink {len(ora)} / box actifs {len(act)} / box total {len(allb)}; manquants actifs: {sorted(act-set(ora))[:6]}")
mism = [(m, ora[m]["ip"], allb[m].get("IPAddress")) for m in ora if m in allb and ora[m]["ip"] != allb[m].get("IPAddress")]
check("Appareils : IP", not mism, str(mism[:4]))
mism = [(m, ora[m]["name"], allb[m].get("Name")) for m in ora if m in allb and ora[m]["name"] != allb[m].get("Name")]
check("Appareils : noms", not mism, str(mism[:4]))
# DHCP
bl = [l for l in st("dhcp_leases")["default"].values()]
check("DHCP baux dynamiques (hors statiques)", len(O["livebox/dhcp"]["dynamic"]) + len(O["livebox/dhcp"]["static"]) == len(bl), f"Oralink {len(O['livebox/dhcp']['dynamic'])} / box {len(bl)}")
bs = st("dhcp_static")
os_ = {(s["mac"].upper(), s["ip"]) for s in O["livebox/dhcp"]["static"]}
bs_ = {(s["MACAddress"].upper(), s["IPAddress"]) for s in bs}
check("DHCP baux statiques", os_ == bs_, f"Oralink {len(os_)} / box {len(bs_)}; diff {list(os_ ^ bs_)[:4]}")
# NAT
bn = st("nat"); on = O["livebox/nat"]
bweb = {k for k, v in bn.items() if v.get("Origin") == "webui"}; bup = {k for k, v in bn.items() if v.get("Origin") == "upnp"}
check("NAT (règles webui)", {r["id"] for r in on} == bweb or {r["id"] for r in on} == set(bn), f"Oralink {len(on)} / box webui {len(bweb)} upnp {len(bup)} total {len(bn)}")
bad = [(r["id"], r["destination_ip"], bn[r["id"]].get("DestinationIPAddress"), r["external_port"], bn[r["id"]].get("ExternalPort")) for r in on if r["id"] in bn and (r["destination_ip"] != bn[r["id"]].get("DestinationIPAddress") or r["external_port"] != bn[r["id"]].get("ExternalPort"))]
check("NAT : IP/ports", not bad, str(bad[:3]))
check("UPnP règles", len(O["livebox/upnp/rules"]) == len(bup), f"Oralink {len(O['livebox/upnp/rules'])} / box {len(bup)}")
check("UPnP activé", O["livebox/advanced"]["upnp"]["enabled"] == st("upnp")["Enable"])
check("PTF", O["livebox/ptf"] == [] and st("ptf") == {}, "aucune règle des deux côtés")
check("DMZ", O["livebox/dmz"]["entries"] == [] and st("dmz") == {}, "aucune entrée des deux côtés")
check("Réponse ping", O["livebox/ping_response"] == {"ipv4": st("ping")["enableIPv4"], "ipv6": st("ping")["enableIPv6"]})
check("Niveau pare-feu", O["livebox/firewall/levels"]["current"] == st("fwlevel"), f"{O['livebox/firewall/levels']['current']} / {st('fwlevel')}")
# WAN / réseau
w = B["wan"]["data"]; n = O["livebox/network"]["wan"]
check("WAN IP / état", n["ip"] == w["IPAddress"] and n["link_type"] == w["LinkType"], f"{n['ip']} {n['link_type']} / {w['IPAddress']} {w['LinkType']}")
check("WAN IPv6", n["ipv6"] == w.get("IPv6Address"), f"{n['ipv6']} / {w.get('IPv6Address')}")
rxb = B["wanstats"]["status"]["RxBytes"] / 1e9
check("WAN total reçu (Go)", abs(n["total_rx_gb"] - rxb) < 5, f"{n['total_rx_gb']} / {rxb:.2f}")
fb = st("gpon")["gpon"]["veip0"]; f = O["livebox/network"]["fiber"]
check("Fibre puissance Rx", abs(f["power_rx"] - fb["SignalRxPower"] / 1000) < 1, f"{f['power_rx']} / {fb['SignalRxPower']/1000}")
check("Fibre état ONU", f["onu_state"] == fb.get("OnuState"), f"{f['onu_state']} / {fb.get('OnuState')}")
check("Box modèle/firmware", O["livebox/network"]["box"]["firmware"] == st("devinfo")["SoftwareVersion"], O["livebox/network"]["box"]["firmware"])
# DDNS
check("DynDNS hôtes", [h["hostname"] for h in O["livebox/advanced"]["ddns"]["hosts"]] == [h["hostname"] for h in st("ddns_hosts")])
check("DynDNS activé", O["livebox/advanced"]["ddns"]["global_enabled"] == st("ddns_global"))
check("DynDNS fournisseurs", sorted(O["livebox/ddns/services"]) == sorted(st("ddns_services")))
# DNS / IPv6
check("Serveurs DNS", O["livebox/advanced"]["dns"]["servers"] in (w.get("DNSServers") or ""), f"{O['livebox/advanced']['dns']['servers']} / {w.get('DNSServers')}")
# Système
s = O["livebox/system"]
check("LED orange/blanche (%)", (s["led_orange"], s["led_white"]) == (round(st("leds_orange")["Brightness"]*100/255), round(st("leds_white")["Brightness"]*100/255)), f"{s['led_orange']}% {s['led_white']}% / brut {st('leds_orange')['Brightness']} {st('leds_white')['Brightness']}")
check("Écran mot de passe Wifi", s["show_wifi_password"] == st("screen"))
check("Sauvegarde auto", s["backup"]["auto_enabled"] == st("backup")["Enable"] and s["backup"]["last_backup"] == st("backup")["ConfigDate"])
rb = st("reboot")
check("Historique redémarrages", len(O["livebox/reboot_history"]) == len(rb), f"Oralink {len(O['livebox/reboot_history'])} / box {len(rb)}")
# Téléphone
check("Journal d'appels", len(O["livebox/phone"]["callers"]) == len([c for c in st("calls") if c.get("startTime")]), f"Oralink {len(O['livebox/phone']['callers'])} / box {len(st('calls'))}")
check("Contacts", len(O["livebox/phone"]["contacts"]) == len(st("contacts")), f"{len(O['livebox/phone']['contacts'])} / {len(st('contacts'))}")
check("Trunks VoIP", len(O["livebox/voip/trunks"]) == len(st("trunks")))
# Speedtest
sd = st("speedtest")
check("Speedtest descendant", abs(O["livebox/speedtest/results"]["downstream"]["rate_mbit"] - sd["Downstream"]["rate"] / 1000) < 1, f"Oralink {O['livebox/speedtest/results']['downstream']['rate_mbit']} Mbit/s / box {sd['Downstream']['rate']} kbit/s")
check("Speedtest montant", abs(O["livebox/speedtest/results"]["upstream"]["rate_mbit"] - sd["Upstream"]["rate"] / 1000) < 1, f"Oralink {O['livebox/speedtest/results']['upstream']['rate_mbit']} / box {sd['Upstream']['rate']} kbit/s")
# Heure
t = O["livebox/system/time"]
check("Heure locale", t["local_time"] == B["time"]["data"]["time"] or bool(t["local_time"]), t["local_time"])
check("Heure UTC", t["utc_time"] is not None, f"Oralink {t['utc_time']} / box {B['time_utc']['data']['time']}")
check("Fuseau horaire", t["timezone"] is not None, f"Oralink {t['timezone']} / box {B['tz']['data']['timezone']}")
check("Serveurs NTP", t["ntp_servers"] == [v for v in B["ntp"]["data"]["servers"].values() if v], str(t["ntp_servers"]))
check("NTP", t["ntp_synced"] == (B["time_status"]["data"]["status"] == "Synchronized"))
ntp = O["livebox/advanced"]["ntp"]
# (advanced.ntp n'est pas affiché par le panel : l'onglet utilise livebox/system/time)
# Wifi
wd = O["livebox/wifi/detail"]
check("Wifi activé", wd["wifi_enabled"] == st("wifi")["Enable"])
check("Wifi invité", wd["guest_enabled"] == st("guest")["Enable"])
# Accès distant
check("Accès distant Orange", O["livebox/remote_access"]["enabled"] == st("oremote").get("Enable"), f"{O['livebox/remote_access']} / {st('oremote')}")
# IPTV
iptv = O["livebox/iptv"]
check("IPTV statut", iptv["status"] == B["iptv_status"]["data"]["IPTVStatus"], f"Oralink {iptv['status']} / box {B['iptv_status']['data']['IPTVStatus']}")
check("IPTV multi-écrans", iptv["multi_screens"] == B["iptv_multi"]["data"]["Enable"], f"Oralink {iptv['multi_screens']} / box {B['iptv_multi']['data']['Enable']}")
check("IPTV config", bool(iptv["config"]), f"Oralink {iptv['config']} / box {len(B['iptv_conf']['status'])} canaux")
# Connexion
c = O["livebox/connection/status"]
check("VLAN", c["vlan_id"] == st("vlan"), f"Oralink {c['vlan_id']} / box {st('vlan')}")
check("MTU", c["mtu"] == st("mtu"), f"Oralink {c['mtu']} / box {st('mtu')}")
# Énergie / USB
check("USB", O["livebox/system/usb"]["mediums"] == [] and st("usb") == [], "aucun périphérique")
pw = O["livebox/system/power"]
check("Énergie (puissance W, profils)", pw["power_watts"] is not None and abs(pw["power_watts"] - st("pm")["Power"]/1000) < 2 and len(pw["profiles"]) == len(st("power")), f"Oralink {pw['power_watts']} W, {len(pw['profiles'])} profils / box {st('pm')['Power']} mW, {len(st('power'))} profils")
# Mémoire
check("Routage (Pro uniquement)", O["livebox/routing/table"] == {} and "errors" in B["routes"], "permission refusée par la box → vide, normal")
check("Planificateur Wifi", O["livebox/wifi/schedule"]["schedules"] == {} and st("wlansched") == {}, "vide des deux côtés")

for f_, s_, d in res:
    print(f"{s_} {f_:30} {d}")
print(f"\n{sum(1 for r in res if r[1]=='OK ')}/{len(res)} OK")
