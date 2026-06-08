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
custom_components/livebox/   # Intégration HA (à copier dans config/custom_components/)
  __init__.py                # Setup, enregistrement du panel custom
  coordinator.py             # DataUpdateCoordinator — agrège les données de l'API Livebox
  panel.py                   # Commandes WebSocket (livebox/*) consommées par le panel React
  sensor.py, switch.py, ...  # Plateformes d'entités HA classiques
  www/react-panel/           # Bundle généré par panel-src/ (livebox-panel-react.{js,css})
panel-src/                   # Source du panel (React + Vite + Tailwind) — voir panel-src/README.md
```

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
npm run build        # écrit directement dans custom_components/livebox/www/react-panel/
```

Puis incrémenter `_PANEL_BUILD` dans `custom_components/livebox/__init__.py`
(cache-busting de l'URL du module). Pour tester en local, copier/synchroniser
`custom_components/livebox/` vers le `custom_components/` de l'instance Home
Assistant, puis recharger l'intégration.

## Feuille de route — fonctionnalités à porter depuis LiveboxMonitor

Comparaison faite avec `LiveboxMonitor/src/LiveboxMonitor/tabs/` (présent dans
le dossier de travail à côté de ce repo). Fonctionnalités identifiées comme
manquantes côté panel Oralink, par ordre de priorité suggéré :

1. ✅ **Journal d'événements** (`LmEventsTab`) — onglet **"Événements"** qui
   journalise en mémoire (côté `coordinator`, `deque` `_event_log`, exposé par
   `coordinator.event_log` / commande WS `livebox/events`) les transitions
   `Active` détectées entre deux rafraîchissements des appareils
   (`_record_device_events`). Volontairement plus simple que le système natif
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
5. **Vue répéteurs Wifi détaillée** (`LmRepeaterTab`) et **table de routage**
   (cette dernière `NMC.LAN:getStaticRoutes` — ⚠️ réservée aux modèles "Pro"
   selon LiveboxMonitor, et absente du wrapper `aiosysbus` : nécessiterait un
   appel `_auth.post` direct non documenté, à valider avant d'investir dessus).
   ✅ *Première brique posée pour les répéteurs* : un onglet **"Répéteurs"**
   permet de saisir et persister (en JSON, via `repeater_store.py` / helper
   `Store` de HA, dans `.storage/livebox_repeaters_<entry_id>`) l'IP et les
   identifiants de connexion de chaque répéteur détecté (commandes WS
   `livebox/repeaters` et `livebox/repeaters/set` dans `panel.py`). Reste à
   faire : utiliser ces identifiants pour se connecter réellement aux
   répéteurs (session `AIOSysbus` éphémère pointée sur leur IP) et afficher
   leurs informations détaillées (modèle, firmware, appareils associés,
   actions...).
6. ✅ **Téléphone** (`LmPhoneTab`) — onglet **"Téléphone"** : historique
   d'appels (réutilise `coordinator.data["callers"]`, déjà peuplé par
   `async_get_callers`) et carnet de contacts de la Livebox
   (`coordinator.api.phonebook.*` — lecture via `coordinator.async_get_contacts`
   exposée dans `coordinator.data["contacts"]`, ajout/suppression via les
   commandes WS `livebox/phone/contacts/add|delete`).
7. ✅ **Décodeurs TV Orange** (`LmTvDecoderTab`) — onglet **"Décodeurs TV"** :
   le décodeur ne passe pas par l'API sysbus, il faut lui parler en HTTP
   direct sur son IP locale (`tv_decoder_api.py`, port 8080,
   `/remoteControl/cmd?operation=...`). Configuration manuelle de l'IP ou
   découverte parmi les appareils actifs déjà connus du réseau (probing
   concurrent), persistée par `tv_decoder_store.py` ; statut en direct et
   télécommande virtuelle (touches mappées sur les codes du décodeur), via
   les commandes WS `livebox/tvdecoders*`.

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
