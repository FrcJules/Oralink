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

1. **Journal d'événements** (`LmEventsTab`) + **notifications email** —
   historique des connexions/déconnexions et alertes ; forte valeur
   diagnostic/sécurité. Nécessite de nouvelles commandes WS dans `panel.py`.
2. **Graphiques de trafic historiques** (`LmGraphTab`) — visualiser l'usage
   réseau dans le temps (par appareil/interface), au-delà des sensors
   instantanés déjà exposés. Bibliothèque cible : `recharts` (déjà dans
   `panel-src/package.json`).
3. **Sauvegarde / restauration de la configuration** (action "Backup and
   Restore..." de `LmActionsTab`) — utile après un factory reset ou un
   changement de box.
4. **Vue répéteurs Wifi détaillée** (`LmRepeaterTab`), **table de routage** et
   **contrôle LEDs/écran** — extensions de l'onglet "Avancé" existant.
   ✅ *Première brique posée* : un onglet **"Répéteurs"** permet de saisir et
   persister (en JSON, via `repeater_store.py` / helper `Store` de HA, dans
   `.storage/livebox_repeaters_<entry_id>`) l'IP et les identifiants de
   connexion de chaque répéteur détecté (commandes WS `livebox/repeaters` et
   `livebox/repeaters/set` dans `panel.py`). Reste à faire : utiliser ces
   identifiants pour se connecter réellement aux répéteurs et afficher leurs
   informations détaillées (modèle, firmware, appareils associés, actions...).
5. **Téléphone** (historique d'appels + carnet de contacts, `LmPhoneTab`) et
   **décodeurs TV Orange** (`LmTvDecoderTab`) — en dernier, car dépendent
   d'équipements que tous les utilisateurs n'ont pas.

Pour chaque ajout, le pattern à suivre est celui des onglets existants : une
ou plusieurs commandes `ws_get_*`/`ws_*_set` dans `panel.py` (suivant le
pattern `_get_coordinator` → lecture/mutation → `connection.send_result`),
une méthode `coordinator.async_get_*` si une nouvelle donnée API est
nécessaire, un composant dans `panel-src/src/tabs/`, et les traductions FR
dans `translations/fr.json`. Les emplacements de ces futurs onglets sont déjà
posés dans `panel-src/src/tabs/coming-soon-tab.jsx` / `App.jsx`.

**Hors-périmètre** (spécifique à l'usage desktop multi-comptes de
LiveboxMonitor, peu pertinent pour une intégration HA) : gestion de profils
multiples (HA gère déjà le multi-Livebox via les config entries), outils de
génération de documentation API, réglage du niveau de log applicatif.
