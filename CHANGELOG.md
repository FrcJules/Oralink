# Changelog

## 1.2.0 — 2026-11-16

### Nouveautés
- **QR code Wi-Fi** : bouton « QR code » sur chaque réseau (onglet Wifi →
  Configuration des réseaux) pour rejoindre le Wi-Fi en scannant avec
  l'appareil photo — pratique pour le Wi-Fi invité. Généré localement.
- **« Qui consomme le plus en ce moment »** : carte sur la vue d'ensemble,
  débit par appareil rafraîchi toutes les 10 s.
- Capteurs **Débit WAN descendant / montant** (Mbit/s), calculés depuis les
  compteurs de la fibre : les statistiques d'interface de la box restent à 0
  sur Livebox 6, il n'existait donc aucun débit Internet exploitable dans HA.

### Corrections
- **NTP synchronisé** restait à « non » sur Livebox 6 (format de réponse).
- **Appareils Ethernet** affichait 0 sans suivi LAN ; les compteurs Wi-Fi /
  Ethernet comptent désormais les appareils connectés, quelles que soient les
  options de suivi.
- Puissance d'émission Wi-Fi « -1 % » affichée « auto ».

### Développement
- Tests JavaScript (`npm test` dans `panel-src`, lanceur intégré de Node).

## 1.1.0 — 2026-11-16

Audit complet sur une Livebox 6 réelle (firmware SG60 G07.R05) : chaque
fonction du panel a été comparée aux données de la box et testée en écriture
(modifications réversibles), voir `scripts/live-tests/`.

### Fonctionnalités cassées corrigées
- **Ajout de redirection NAT** : ne fonctionnait pas (la box refuse « TCP »,
  protocoles désormais envoyés en numéros IANA).
- **Redirection de protocole** : refaite (protocole IP entier — GRE, ESP… —
  vers une IP ; l'ancienne version à plages de ports ne pouvait pas marcher).
- **Type d'appareil forcé**, **niveau du pare-feu**, **DMZ** : commandes non
  enregistrées ou appelant des méthodes inexistantes.
- Speedtest (2 Mbit/s affiché au lieu de 2 Gbit/s), consommation électrique,
  LED, heure/fuseau, IPTV, VLAN/MTU, serveurs NTP, appareils filaires absents
  de l'onglet Appareils, noms manquants dans les baux DHCP.
- Les modifications affichaient « succès » même quand la box les refusait.
- Journal d'événements quasi vide en mode « appareils actifs uniquement ».
- Pic de débit aberrant après un redémarrage de HA.

### Sécurité
- Toutes les commandes de modification exigent un compte **administrateur** HA.
- Diagnostics : adresses MAC remplacées par des pseudonymes (`MAC_001`…).

### Nouveautés
- **Éditeur Wi-Fi** : nom, mot de passe, sécurité (WPA2/WPA3), WPS — réseaux
  principal et invité.
- **Pare-feu IPv6** : ouverture de ports vers un appareil.
- **DMZ**, **réponse au ping**, **hôtes DynDNS** gérables depuis le panel.
- Entité **« Événements réseau »** (nouvel appareil, connexion, déconnexion) et
  événement `oralink_device_event` ; blueprints **« nouvel appareil sur le
  réseau »** et **« couper le Wi-Fi la nuit »**.
- Capteurs **speedtest** (débit descendant/montant, latence).
- Historique de débit **par appareil** sur 7 jours (recorder HA), recherche /
  filtre / **export CSV** des appareils.
- Noms d'entités **traduits** (français / anglais).
- Panel plus léger au chargement (onglets lourds chargés à la demande).

### Notes de mise à jour
- Redémarrer Home Assistant après la mise à jour (un simple rechargement de
  l'intégration ne suffit pas).
- Les noms affichés des entités passent en français sur une installation en
  français ; les `entity_id` (automatisations, dashboards) ne changent pas.
