# Oralink

Intégration **Home Assistant personnalisée pour les box Orange Livebox** :
un composant Python (entités, capteurs, automatisations) couplé à un
**panel web sur-mesure** affiché dans l'interface HA, pour piloter et
surveiller la box bien au-delà de ce qu'offrent les entités standard.

L'objectif est de rapprocher l'expérience d'**Oralink** de celle de
[LiveboxMonitor](https://github.com/p-dor/LiveboxMonitor) (appli desktop de
référence pour gérer une Livebox), mais directement intégrée à Home Assistant.

## Structure du repo

```
custom_components/oralink/   # Intégration HA (à copier dans config/custom_components/)
  __init__.py                # Setup, enregistrement du panel custom
  coordinator.py             # DataUpdateCoordinator — agrège les données de l'API Livebox
  panel.py                   # Commandes WebSocket (livebox/*) consommées par le panel React
  sensor.py, switch.py, ...  # Plateformes d'entités HA classiques
  www/react-panel/           # Bundle généré par panel-src/ (livebox-panel-react.{js,css})
panel-src/                   # Source du panel (React + Vite + Tailwind) — voir panel-src/README.md
```

**Domaine HA : `oralink`** (`custom_components/oralink/`, `DOMAIN` dans
`const.py`). Historiquement `livebox` — renommé pour éviter toute confusion
avec l'intégration upstream `hass-livebox-component` (cyr-ius), qui utilise
ce domaine. Les commandes WebSocket du panel (`panel.py`, préfixe `livebox/*`)
et le chemin des assets statiques (`/livebox_panel/...`) gardent volontairement
l'ancien nom — ce sont des identifiants internes indépendants du domaine HA,
les changer impliquerait de reconstruire le bundle JS pour rien.

## Stack technique

- **Backend** : composant Home Assistant standard (Python), API Livebox via
  `aiosysbus`, données mises en cache par un `DataUpdateCoordinator`, et un
  jeu de commandes WebSocket (`panel.py`) qui font le pont entre le panel
  React et le coordinator.
- **Frontend (panel)** : React + Vite + Tailwind CSS v4 + Radix UI, compilé en
  un unique bundle ES servi statiquement par l'intégration
  (`/livebox_panel/react-panel/livebox-panel-react.js`). Voir
  `panel-src/README.md` pour les commandes de build et l'architecture
  (élément personnalisé `<livebox-panel>`, contexte `hass`, hooks WS).

## Workflow de build & déploiement

```sh
cd panel-src
npm install
npm run build        # écrit directement dans custom_components/oralink/www/react-panel/
```

Puis incrémenter `_PANEL_BUILD` dans `custom_components/oralink/__init__.py`
(cache-busting de l'URL du module).

**Découpage du bundle** (`vite.config.js`) : l'entrée `livebox-panel-react.js`
(~1 Ko) charge un chunk `core` ; Topologie et Graphiques sont en `React.lazy`
dans `chunks/`. Contraintes : une seule CSS (`cssCodeSplit: false`, le Shadow
DOM ne charge que `livebox-panel-react.css`), `base: './'`, et **aucun chunk
ne doit importer l'entrée** — HA la charge avec `?v=<build>`, un import sans
paramètre en créerait une 2e instance (2 React). D'où `manualChunks` qui met
tout le code partagé dans `core`. Vérifier après build :
`grep -l livebox-panel-react.js custom_components/oralink/www/react-panel/chunks/*`
doit être vide. `scripts/deploy.sh` nettoie les chunks périmés côté HA.

**Graphique par appareil** : `livebox/graphs/device` lit l'historique des
capteurs « Débit ↓/↑ » dans le **recorder de HA** (persistant, jusqu'à 7 jours
via le paramètre `hours`, fusion/sous-échantillonnage dans `history_utils.py`),
avec repli sur l'historique en mémoire du coordinator quand l'appareil n'a pas
de capteurs (appareils filaires si le suivi Ethernet est désactivé).

**⚠️ Le dépôt Git n'est PAS synchronisé automatiquement avec l'instance Home
Assistant.** Après un `git push` (ou même sans commit, pour tester), il faut
explicitement déployer les fichiers modifiés : l'instance HA est montée en
CIFS/SMB sur `//192.168.1.134/config/custom_components`, visible localement
sous `/home/appuser/Perso/Oralink/Home-Assistant/oralink/`. **Utiliser
`scripts/deploy.sh`** : copie avec `cp` (pas `rsync` — le mount CIFS ne
supporte pas son pattern temp-file+rename), régénère les `.js.gz` et vérifie
par HTTP que HA sert bien le nouveau bundle.

⚠️ **Code Python : redémarrer HA, pas seulement recharger.** Recharger
l'intégration (Paramètres → Appareils et services → Oralink → Recharger)
relance l'entrée avec les modules *déjà importés* : le nouveau code Python
n'est pris en compte qu'après un **redémarrage complet de Home Assistant**
(Paramètres → Système → Redémarrer). Vérifié le 2026-11-16 : après un
rechargement, les nouvelles commandes WS restaient « Unknown command » et
`__pycache__` n'était pas régénéré. Ça vaut aussi pour un changement du seul
bundle JS : `_PANEL_BUILD` est une constante Python, l'URL du panel (et donc
le cache-busting) ne change qu'après redémarrage.

⚠️ **Piège des `.gz`** : le serveur statique de HA sert `<fichier>.js.gz` en
priorité aux navigateurs qui acceptent gzip. Un simple `cp` du bundle laisse
l'ancien `.gz` en place → le navigateur continue de recevoir l'ancien panel
alors que `curl` (sans gzip) montre le nouveau. Le script s'en charge.

**Diagnostics** (`diagnostics.py`) : `TO_REDACT` masque les valeurs connues
(mots de passe, n° de série, identifiants, IP publiques, numéros…) et
`diagnostics_utils.pseudonymize_macs` remplace **toutes** les MAC (clés,
valeurs, chaînes) par des pseudonymes stables `MAC_001`… — vérifié sur le vrai
fichier téléchargé depuis HA : aucun secret de la box ni MAC réelle.

**Lint du panel** : `npx eslint .` doit rester à 0 (règle react-refresh
désactivée pour `src/lib` et `src/components/ui`, cf. `eslint.config.js`).

**Tests** : `python3 -m pytest tests/ -q` — sans installer Home Assistant :
- `test_coordinator_logic.py` : logique du coordinator (événements, débit
  WAN) avec des stubs des modules HA ;
- `test_static_consistency.py` : chaque handler WS est enregistré, chaque
  commande appelée par le panel existe, chaque commande d'écriture exige
  l'admin, et chaque `api.<module>.async_*` existe dans aiosysbus (ce dernier
  test est ignoré si aiosysbus n'est pas installé — sinon pointer
  `AIOSYSBUS_SRC` vers le dossier `aiosysbus/` des sources 1.2.4, obtenues par
  `pip download --no-deps --no-binary :all: aiosysbus==1.2.4`).

**Migration `livebox` → `oralink` (2026-09-02)** : le domaine a changé,
l'ancien dossier `custom_components/livebox/` (et l'entrée d'intégration
correspondante côté HA) reste en place tel quel et continue de fonctionner —
rien n'est supprimé automatiquement. La bascule est manuelle : ajouter la
nouvelle intégration **Oralink** (domaine `oralink`) depuis Paramètres →
Appareils et services, reconstruire dashboards/automatisations sur les
nouveaux `entity_id`, puis seulement à ce moment-là supprimer l'ancienne
entrée `Livebox` et le dossier `custom_components/livebox/` sur le mount
CIFS.

## Feuille de route — fonctionnalités à porter depuis LiveboxMonitor

Comparaison faite avec `LiveboxMonitor/src/LiveboxMonitor/tabs/` (présent dans
le dossier de travail à côté de ce repo). Fonctionnalités identifiées comme
manquantes côté panel Oralink, par ordre de priorité suggéré :

1. ✅ **Journal d'événements** (`LmEventsTab`) — onglet **"Événements"** qui
   journalise (côté `coordinator`, `_record_device_events`, exposé par
   `coordinator.event_log` / commande WS `livebox/events`) connexions,
   déconnexions et **nouveaux appareils** (MAC jamais vue). Comparaison des
   ensembles d'appareils *actifs* (indispensable en mode « Active only », où
   un appareil déconnecté disparaît de la liste). Persisté avec les MAC
   connues dans `event_log_store.py` (`.storage/oralink_event_log_<entry>`,
   amorcé depuis le registre d'appareils HA). Chaque événement est publié sur
   le bus HA : `oralink_device_event` (`event` = `new`/`connected`/
   `disconnected`, `mac`, `name`, `ip`, `entry_id`) → base idéale pour une
   automatisation « appareil inconnu sur le réseau ». Volontairement plus simple que le système natif
   `eventmanager`/`get_events` de la Livebox (notifications par
   souscription/long-polling — `open_channel`/`subscribe`, cf.
   `LmEventsTab.LmEventsApi`), peu adapté au modèle `DataUpdateCoordinator`
   basé sur du polling. **Notifications email** : volontairement non
   implémentées dans l'intégration — recommandé de passer par une
   automatisation Home Assistant (déclencheur sur les `device_tracker`/
   capteurs de présence existants + service `notify.*`), plus idiomatique
   qu'un client SMTP custom dans le composant.
2. ✅ **Graphiques de trafic** (`LmGraphTab`) — onglet **"Graphiques"** avec
   `recharts`, alimenté par un historique en mémoire (`deque` `_traffic_history`,
   ~12h à raison d'un point par minute, `coordinator.traffic_history` /
   commande WS `livebox/graphs`) du débit agrégé (somme des débits instantanés
   de tous les appareils, cf. `_record_traffic_history`). Plus simple que
   LiveboxMonitor (pas de historique par appareil/interface ni de persistance
   sur disque — réinitialisé au redémarrage de HA).
3. ✅ **Sauvegarde / restauration de la configuration** (action "Backup and
   Restore..." de `LmActionsTab`) — section dans l'onglet **"Système"** :
   statut + activation de la sauvegarde automatique
   (`NMC.NetworkConfig:enableNetworkBR`), lancement d'une sauvegarde
   (`launchNetworkBackup`) et restauration (`launchNetworkRestore`), via
   `coordinator.api.nmc.*` (commandes WS `livebox/system/backup/*`).
4. ✅ **Contrôle LEDs et écran** (action "LEDs and Screen..." de `LmActionsTab`)
   — section dans l'onglet **"Système"** : luminosité des LEDs Orange/Blanche
   (`LEDs.LED.Orange|White:get/set`, en appel direct via `_auth.post` —
   tolérant si l'objet n'existe pas sur le modèle, cf. `_safe_post`) et
   affichage du mot de passe Wifi sur l'écran
   (`coordinator.api.screen.async_get/set_show_wifi_password`).
5. ✅ **Vue répéteurs Wifi détaillée** (`LmRepeaterTab`) — onglet
   **"Répéteurs"** : l'IP et les identifiants de chaque répéteur détecté dans
   la topologie sont saisis et persistés en JSON (`repeater_store.py` / helper
   `Store` de HA, dans `.storage/livebox_repeaters_<entry_id>`, commandes WS
   `livebox/repeaters` et `livebox/repeaters/set`). Une fois le mot de passe
   enregistré, le panel ouvre une session `AIOSysbus` éphémère pointée sur
   l'IP du répéteur (`_connect_repeater` dans `panel.py`) pour afficher ses
   infos détaillées (modèle, firmware, uptime, mémoire, Wifi, appareils
   associés — `livebox/repeater/info`), activer/désactiver son Wifi
   (`livebox/repeater/wifi/set`) et le redémarrer (`livebox/repeater/reboot`),
   avec détection automatique des IP (`livebox/repeaters/scan_ips`) et
   rafraîchissement périodique côté panel.
   **Table de routage** (`NMC.LAN:getStaticRoutes` — ⚠️ réservée aux modèles
   "Pro" selon LiveboxMonitor, et absente du wrapper `aiosysbus` :
   nécessiterait un appel `_auth.post` direct non documenté) reste non
   implémentée, à valider avant d'investir dessus.
6. ✅ **Téléphone** (`LmPhoneTab`) — onglet **"Téléphone"** : historique
   d'appels (réutilise `coordinator.data["callers"]`, déjà peuplé par
   `async_get_callers`, suppression individuelle/globale via
   `livebox/phone/calls/delete[_all]` → `VoiceService.VoiceApplication:
   clearCallList`) et carnet de contacts de la Livebox
   (`coordinator.api.phonebook.*` — lecture via `coordinator.async_get_contacts`
   exposée dans `coordinator.data["contacts"]`, ajout/suppression via les
   commandes WS `livebox/phone/contacts/add|delete`). Trunks VoIP
   (`livebox/voip/trunks`) et infos DECT — nom, PIN, RFPI, version logicielle,
   absent sur Livebox 6+ — (`livebox/phone/dect`, appels sysbus directs
   `DECT:get*`) affichés en cartes dédiées ; bouton "Sonner le combiné"
   (`livebox/phone/ring` → `VoiceService.VoiceApplication:ring`).
7. ✅ **Décodeurs TV Orange** (`LmTvDecoderTab`) — onglet **"Décodeurs TV"** :
   le décodeur ne passe pas par l'API sysbus, il faut lui parler en HTTP
   direct sur son IP locale (`tv_decoder_api.py`, port 8080,
   `/remoteControl/cmd?operation=...`). Configuration manuelle de l'IP ou
   découverte parmi les appareils actifs déjà connus du réseau (probing
   concurrent), persistée par `tv_decoder_store.py` ; statut en direct et
   télécommande virtuelle (touches mappées sur les codes du décodeur), via
   les commandes WS `livebox/tvdecoders*`.

**Réinitialisation usine** — Livebox (`livebox/system/factory_reset`, zone
dangereuse de l'onglet "Administration") et répéteurs
(`livebox/repeater/factory_reset`, à côté du bouton "Redémarrer" de l'onglet
"Répéteurs") — `NMC:reset`, action irréversible, double confirmation côté
panel.

**DMZ / réponse au ping / DynDNS** (onglet "Administration" → Avancé) :
gestion complète et plus seulement affichage. DMZ = liste d'entrées
identifiées (`Firewall:getDMZ/setDMZ/deleteDMZ`, identifiant `webui` comme
l'interface Orange ; commandes `livebox/dmz`, `livebox/dmz/set`,
`livebox/dmz/delete`), réponse au ping IPv4/IPv6 sur le WAN
(`livebox/ping_response[/set]`), ajout/suppression d'hôtes DynDNS avec la
liste des fournisseurs de la box (`livebox/ddns/services`). Ces mutations
appellent aiosysbus directement plutôt que `coordinator._make_request`, qui
avale les erreurs Livebox (le panel affichait sinon « succès » même en cas de
refus) — à privilégier pour toute nouvelle commande d'écriture.

**Redirection de protocole (PTF)** — section dédiée dans l'onglet "Réseau"
sous le NAT, `Firewall:getProtocolForwarding` / `setProtocolForwarding` /
`deleteProtocolForwarding` (appels `_auth.post` directs), commandes WS
`livebox/ptf[/add|/delete]`, cache `coordinator.data["ptf"]`. ⚠️ Ce n'est
**pas** du port triggering : la Livebox redirige un **protocole IP entier**
(GRE 47, ESP 50, AH 51…) vers une IP, sans ports — `destinationIPAddress`
est obligatoire (vérifié sur Livebox 6, cf. `save_ipv4_ptf_rule` de
LiveboxMonitor). L'ancienne version à plages de ports ne pouvait pas marcher.

**Pare-feu IPv6 (pinholes)** — section sous la redirection de protocole
(onglet "Réseau") : `Firewall:getPinhole/setPinhole/deletePinhole`, commandes
`livebox/ipv6/pinholes`, `livebox/ipv6/pinhole/add|delete`. Une règle ouvre
un port (ou une plage) vers une IPv6 précise ; la box préfixe l'identifiant
par l'origine (`webui_<nom>`), à repasser tel quel à `deletePinhole`. Le
formulaire propose les appareils actifs ayant une IPv6 globale (`ipv6` dans
`livebox/devices`). Testé sur Livebox 6 avec `2001:db8::/32` (plage de
documentation, jamais routée).

**Configuration Wi-Fi** (onglet Wifi → « Configuration des réseaux ») :
`livebox/wifi/config` (admin : renvoie les mots de passe) et
`livebox/wifi/config/set` → `NeMo.Intf.<lan|guest>:getMIBs` /
`setWLANConfig` avec `{"mibs": {"penable": {}, "wlanvap": {<vap>: {...}}}}`
(modèle de `LmWifiApi.set_config`). Réseaux découverts dynamiquement (la
Livebox 6 a aussi des VAP `priv1` WPA3, absentes de `_VAP_IFACES`).
`setWLANConfig` répond succès même quand un champ est ignoré : le handler
**relit** et renvoie `not_applied` (cas vérifié : masquer le SSID du réseau
invité est ignoré par la box — option retirée du panel). Testé uniquement sur
des réseaux désactivés (invité, `priv1`).

**Coupure du Wi-Fi** : l'interrupteur `switch.<box>_wifi` (`NMC.Wifi:set`)
arrête bien les 3 radios sur Livebox 6 sans toucher au profil
`PowerManagement` WiFi (testé : reprise des radios ~20 s, appareils
reconnectés). Le planificateur interne de la box (profil `WiFi`,
`setScheduledProfiles`) n'est pas utilisé : format des jours non documenté et
introspection `sysbus/...?_restDepth=-1` refusée (400) sur cette firmware —
remplacé par le blueprint `blueprints/automation/oralink/wifi_night_schedule.yaml`.

**Pièges de l'API vérifiés sur la box (2026-11-16, tests `scripts/live-tests/`)** :
- Protocoles NAT/PTF en **numéros IANA** (`"6"`, `"17"`, `"6,17"`) : la box
  refuse `"TCP"` (« Invalid parameter: protocol »). `_protocol_numbers()`
  convertit ce qu'envoie le panel.
- LEDs : `Brightness` sur **0-255** ; le panel raisonne en % (`_led_percent`).
- `SpeedTest:getWANResults` : débits en **kbit/s**. `PowerManagement.Power`
  en **mW**. `getProfiles` renvoie un dict.
- Beaucoup d'objets (`Time:*`, `NMC.OrangeTV:*`) répondent dans `data` et non
  `status` (`_payload()` dans le coordinator).
- Un objet absent du modèle (`NMC.ServiceEligibility.DSLITE` sur Livebox 6)
  fait lever aiosysbus : toujours `asyncio.gather(..., return_exceptions=True)`
  quand on groupe des appels optionnels.
- Ne jamais nommer un paramètre WS `id` : c'est le numéro de message de
  l'enveloppe WebSocket HA, il écrase la valeur (testé dans
  `test_static_consistency.py`).
- Après une écriture, `_refresh_cached()` relit la donnée concernée :
  `async_request_refresh` est temporisé (10 s) et laissait la liste périmée.
- L'onglet Appareils lit `coordinator.data["all_devices"]` (Wi-Fi + filaires) :
  les options de suivi ne concernent que les entités `device_tracker`.

**Entités ajoutées (2026-11-16)** : `event.<box>_evenements_reseau`
(`event.py`, relaie `oralink_device_event` — `event_type` new/connected/
disconnected, attributs mac/name/ip — utilisable comme déclencheur dans
l'éditeur d'automatisations) et capteurs `Speedtest Download/Upload/Latency`
(dernier test mémorisé par la box, `coordinator.data["speedtest"]`). L'onglet
Appareils a une recherche, un filtre Tous/Actifs/Wi-Fi/Filaires et un export
CSV (séparateur `;`, BOM UTF-8 pour Excel).

**Refonte UI 1.3.0 (2026-11-17)** : libellés et formatage centralisés dans
`panel-src/src/lib/labels.js` (interfaces ETHx/VAP, états, pare-feu, qualité
du signal Wi-Fi — seuils de `LiveboxDeviceSignalSensor` —, niveau fibre,
valeurs vides/sentinelles) et `lib/format.js` (`formatRate` en Mbit/s →
kbit/s / Mbit/s / Gbit/s, dBm, durées, `parseDate` pour les `str(datetime)`
Python) — à réutiliser plutôt que de reformater dans un onglet. `Row` masque
les valeurs vides. Couleurs : orange (`--lb-brand`) = actions/navigation ;
états via `lb-pill-*`/`lb-dot-*`/`lb-banner-*` (`--lb-ok/warn/bad`) ;
séries de données en `--lb-data`. Vue d'ensemble « Statut d'abord »
(`overview-tab.jsx`, `components/status.jsx` : `Pill`, `Collapsible` monté à
l'ouverture, `Sparkline` SVG sans recharts) ; onglet Appareils en cartes
(`components/device-cards.jsx`, vue Liste = `DeviceTable`). `livebox/devices`
expose `wan_blocked`/`static_ip`, `livebox/network` `guest_wifi`/
`firewall_level`/`wan.error_code`. Le dépôt est public : captures de PR avec
des données fictives (harnais `hass` simulé), jamais celles de la vraie box.

**État DHCP (1.4.0, 2026-11-23)** : `coordinator.data["dhcp_pool"]`
(`DHCPv4.Server:getDHCPServerPool`, lu une fois et réutilisé pour les baux
`default`/`guest`), logique pure dans `dhcp_utils.py` (`pool_summary`,
`device_ip_source` à partir de `IPAddressSource` DHCP/Static/self,
`manual_ip_in_pool`). Exposé par `binary_sensor.<box>_serveur_dhcp`,
`livebox/dhcp` → `pool` (bandeau de l'onglet Réseau) et `livebox/devices` →
`ip_source`/`ip_in_dhcp_pool`. ⚠️ Le panel n'a **pas** d'écran pour activer le
DHCP ou changer la plage : `livebox/dhcp/params/set` (NMC `DHCPEnable`/
`DHCPStartIPAddress`…) existe côté backend mais n'a jamais été vérifié sur la
box — à tester avec `scripts/live-tests/` avant de le rebrancher (une erreur
coupe le LAN).

**Nettoyage panel-src (2026-07-12)** : 6 fichiers d'onglets
(`dhcp-tab.jsx`, `nat-tab.jsx`, `network-tab.jsx`, `system-tab.jsx`,
`diagnostics-tab.jsx`, `advanced-tab.jsx`) n'étaient plus importés dans
`App.jsx` et dupliquaient intégralement des sections déjà présentes dans
`reseau-tab.jsx`/`overview-tab.jsx`/`administration-tab.jsx` — supprimés
(code mort, aucune perte fonctionnelle).

La **topologie réseau** (onglet "Topologie") a été reconstruite pour
retrouver le rendu et les fonctionnalités de l'ancien panel React
(`livebox-V1`, bibliothèque `@xyflow/react`) : disposition en grille par
interface (5 colonnes max), fond pointillé, mêmes icônes par type d'appareil,
et **switchs personnalisés** + **rattachement forcé d'un appareil à un
relais** ("parent override"). Contrairement à `livebox-V1` (où tout — y
compris les switchs et rattachements — était purement `localStorage` côté
navigateur), Oralink persiste tout côté serveur dans `TopologyStore`
(`livebox/topology/{positions,switches,parents}*`), donc partagé entre tous
les onglets/utilisateurs et indépendant du navigateur.

**Droits** : toutes les commandes WS qui modifient la box ou un état
persistant portent `@websocket_api.require_admin` (le panel reste visible
pour les non-admins, en lecture). Seules exceptions : `livebox/refresh`,
`livebox/device/wake` et `livebox/tvdecoders/key`. Toute nouvelle commande
d'écriture doit suivre cette règle.

Pour chaque ajout, le pattern à suivre est celui des onglets existants : une
ou plusieurs commandes `ws_get_*`/`ws_*_set` dans `panel.py` (suivant le
pattern `_get_coordinator` → lecture/mutation → `connection.send_result`),
une méthode `coordinator.async_get_*` si une nouvelle donnée API est
nécessaire, un composant dans `panel-src/src/tabs/`, et l'enregistrement dans
`App.jsx` (les onglets de ce panel sont rédigés directement en français dans
le JSX — pas besoin de toucher `translations/fr.json`, qui ne couvre que le
config flow HA).

**Hors-périmètre** (spécifique à l'usage desktop multi-comptes de
LiveboxMonitor, peu pertinent pour une intégration HA) : gestion de profils
multiples (HA gère déjà le multi-Livebox via les config entries), outils de
génération de documentation API, réglage du niveau de log applicatif.
