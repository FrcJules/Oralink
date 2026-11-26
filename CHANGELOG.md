# Changelog

## Non publié

### Nouveautés
- **Qualité de la connexion** (nouvel onglet) :
  - **test de débit** chaque jour à l'heure choisie (et à la demande), avec
    historique et alerte ntfy si le débit chute (seuil fixe, ou moitié du
    débit habituel confirmée par un 2ᵉ test). La Livebox ne permet pas de
    lancer un test : Oralink mesure depuis Home Assistant vers les serveurs
    de test Cloudflare, donc dans la limite de la connexion de la machine HA.
    Les capteurs « Speedtest » utilisent ces mesures quand la box n'a pas de
    résultat (cas de la Livebox 6) ;
  - **santé de la fibre** : un relevé par heure de la puissance optique
    (30 jours), niveau Correct / À surveiller / Critique (seuils GPON et
    baisse de 3 dB par rapport à l'habitude), alerte ntfy à chaque
    changement de niveau.
- **Réparations Home Assistant** : une alerte apparaît quand des
  redirections de ports, redirections de protocole ou réservations DHCP
  visent un appareil inconnu ou absent depuis plus de 30 jours.
- **Frise de présence** sur 7 jours dans la fiche de chaque appareil.
- **Conseils Wi-Fi** (onglet Wifi) : appareils au signal faible (avec une
  suggestion selon qu'il y a déjà un répéteur ou non) et connexions
  instables (6 déconnexions ou plus en 24 h).
- **Notifications ntfy directes** (Administration → Notifications) : serveur
  (ntfy.sh ou auto-hébergé), topic, jeton facultatif, bouton de test. Alertes
  au choix : nouvel appareil sur le réseau, ouverture d'un port sur Internet
  par UPnP (première fois par appareil, ou à chaque fois), fin d'une pause
  Internet, Wi-Fi invité éteint par son minuteur. La notification « nouvel
  appareil » a un bouton **Couper Internet** (puis **Rétablir**), qui passe
  par un webhook Home Assistant avec un jeton à usage unique valable 24 h
  (il faut une URL externe configurée dans HA).
- **Pause Internet par groupe** (nouvel onglet « Pause Internet ») : groupes
  d'appareils (enfants, consoles…) à couper d'un coup pendant 30 min, 1 h,
  2 h, jusqu'au lendemain 7 h ou jusqu'à reprise. La reprise est automatique
  (et rattrapée au démarrage de HA si l'échéance est passée) ; un appareil
  déjà bloqué à la main avant la pause le reste.
- **Ouvertures de ports UPnP** : nouvel événement HA
  `oralink_port_forward_event` (`opened` / `closed`, port, protocole,
  appareil) et entrée « port ouvert (UPnP) » dans le journal d'événements.
- **Wi-Fi invité minuté** : la durée (1 h, 4 h, 24 h, sans limite) se choisit
  avant d'activer, et l'heure d'extinction s'affiche. C'est le minuteur de la
  box qui éteint le réseau, même si HA est arrêté.
- **Repérer les règles qui visent un appareil disparu** : chaque redirection
  de ports (NAT et UPnP), redirection de protocole, ouverture de port IPv6,
  entrée DMZ et réservation DHCP indique l'état de l'appareil visé : en
  ligne (avec son nom), hors ligne depuis N jours, « a changé d'adresse »
  (bail DHCP différent ou IPv6 temporaire renouvelée) ou « aucun appareil
  connu ». Un bandeau signale les règles dont l'appareil est inconnu ou
  absent depuis plus de 30 jours, sans doute à supprimer. La Livebox ne
  compte pas l'utilisation des ports (pas de compteur par règle, table des
  connexions inaccessible même en admin) : c'est la présence de l'appareil
  qui est vérifiée, pas le trafic sur le port.
- Oralink mémorise désormais la dernière présence et les dernières adresses
  de chaque appareil (la box efface l'IP d'un appareil déconnecté) et relit
  toutes les 15 min les appareils hors ligne connus de la box.

### Corrections
- **Wi-Fi invité avec minuteur** : il était vu comme éteint (interrupteur HA,
  Vue d'ensemble) alors qu'il était allumé. Avec un minuteur, la Livebox 6
  remet `Enable` à faux ; c'est maintenant `Status` qui fait foi.

## 1.4.0 — 2026-11-22

### Nouveautés
- **Capteur « Serveur DHCP »** (`binary_sensor.<box>_serveur_dhcp`, activé
  par défaut) : allumé quand la Livebox distribue les adresses du réseau.
  Attributs : plage d'adresses, durée des baux, nombre de baux et de
  réservations, et les appareils en IP manuelle situés dans la plage DHCP
  (risque de doublon). Utile pour être alerté si le DHCP est coupé, ou pour
  suivre une bascule quand un autre routeur cesse de le faire.
- **Onglet Réseau → DHCP** : bandeau d'état du serveur DHCP (actif avec sa
  plage et la durée des baux, ou désactivé).
- **Origine de l'IP de chaque appareil** (cartes et fiche détaillée de
  l'onglet Appareils) : DHCP, réservée ou IP manuelle, avec un avertissement
  quand une IP manuelle est dans la plage distribuée par la box.

### Améliorations
- Les capteurs « Baux DHCP » et « Baux DHCP statiques » sont désormais
  activés par défaut (nouvelles installations ; sur une installation
  existante, les activer depuis la page de l'appareil Livebox).
- Le pool DHCP n'est plus lu qu'une fois par rafraîchissement (au lieu
  d'une fois par réseau).

### Corrections
- **Répéteurs → détection automatique des IP** : elle ne trouvait jamais rien
  (mauvaise clé lue dans les baux DHCP). Elle utilise aussi maintenant les
  appareils vus par la box, ce qui marche pour un répéteur en IP fixe ou
  quand le DHCP est assuré par un autre routeur.

## 1.3.0 — 2026-11-17

### Nouveautés
- **Vue d'ensemble « Statut d'abord »** : bandeau d'état en haut (vert
  « Internet fonctionne normalement », orange ou rouge si le WAN est coupé ou
  si le signal fibre est faible ou critique), avec le type et le débit de la
  fibre, la qualité du signal et la durée depuis le dernier redémarrage. Trois
  cartes : débit Internet en direct avec courbe de la dernière heure, dernier
  speedtest, appareils connectés en Wi-Fi et en câble. Carte **« À regarder »**
  (nouveaux appareils et appels manqués des dernières 24 h, Wi-Fi invité,
  pare-feu bas). Le détail technique (box, mémoire, WAN, fibre, IPTV,
  connexion) passe dans des sections repliables, fermées par défaut.
- **Onglet Appareils en cartes** : regroupées par port LAN, bande Wi-Fi ou
  répéteur, avec pastille (en ligne, nouveau, très actif, Internet coupé),
  débits et signal Wi-Fi, et des actions directes : couper ou rétablir
  Internet, réserver l'IP, réveiller (Wake-on-LAN), renommer. La vue tableau
  reste disponible via le bouton « Liste » ; recherche, filtres et export CSV
  marchent dans les deux vues.

### Améliorations
- **Libellés lisibles partout** : « Port LAN 2 », « Wi-Fi 5 GHz » au lieu de
  ETH2 / vap5g0priv0 ; états en français (Connecté, Fibre, Pare-feu moyen…) ;
  signal Wi-Fi qualifié (« −48 dBm · excellent », mêmes seuils que le capteur
  de signal).
- **Débits formatés de la même façon dans tous les onglets** : kbit/s sous
  1 Mbit/s, Mbit/s à une décimale, Gbit/s au-delà, virgule décimale.
- Les valeurs vides ou factices renvoyées par la box (dont la date
  « 0001-01-01 ») ne sont plus affichées.
- Couleurs : l'orange est réservé aux actions et à la navigation, les couleurs
  vert / orange / rouge aux états et aux alertes ; lisible en thème clair et
  sombre.

### Corrections
- Le détail d'un appareil n'affichait jamais « Bloqué » pour un appareil dont
  l'accès Internet était coupé, et le bouton « Débloquer » restait grisé.
- Après avoir coupé ou rétabli l'accès Internet d'un appareil, l'état est relu
  immédiatement au lieu d'attendre le cycle de rafraîchissement suivant.

### Développement
- Modules partagés `panel-src/src/lib/labels.js` et `format.js`, couverts par
  des tests `node:test`.

## 1.2.1 — 2026-11-16

### Corrections
- **Détection des décodeurs TV** : ne trouvait jamais rien, car seuls les
  appareils Wi-Fi étaient sondés alors que les décodeurs Orange sont branchés
  en Ethernet. Tous les appareils actifs sont désormais sondés (décodeurs
  reconnus par la box en premier).

### Divers
- Nouveau **logo Oralink** original (remplace le logo Orange, marque déposée),
  avec variantes pour le thème sombre.
- Licence **MIT** (conserve la mention de hass-livebox-component, dont
  Oralink est dérivé) ; vérifications automatiques HACS / hassfest / tests.

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
