<p align="center"><img src="custom_components/oralink/brand/logo.png" alt="Oralink" height="96"></p>

# Oralink

Intégration **Home Assistant personnalisée pour les box Orange Livebox** : un
composant Python (entités, capteurs, automatisations) couplé à un **panel web
sur-mesure** affiché dans l'interface HA, pour piloter et surveiller la box
bien au-delà de ce qu'offrent les entités standard.

Basé sur [hass-livebox-component](https://github.com/cyr-ius/hass-livebox-component)
de [@cyr-ius](https://github.com/cyr-ius), avec pour objectif de rapprocher
l'expérience d'Oralink de celle de
[LiveboxMonitor](https://github.com/p-dor/LiveboxMonitor) (appli desktop de
référence pour gérer une Livebox), directement intégrée à Home Assistant.

## Installation

Oralink s'installe comme **dépôt personnalisé** dans HACS / le Marketplace
de Home Assistant (intégré à HA depuis 2026.11) :

1. Ouvrir HACS (ou le Marketplace) → menu **⋮** → **Dépôts personnalisés**.
2. URL : `https://github.com/FrcJules/Oralink`, type **Intégration** → Ajouter.
3. Rechercher **Oralink**, l'installer, puis **redémarrer Home Assistant**.
4. Ajouter l'intégration depuis Paramètres → Appareils et services
   (la Livebox est aussi détectée automatiquement via SSDP).

Mise à jour : HACS propose chaque nouvelle *release* GitHub ; redémarrer
Home Assistant après la mise à jour (un rechargement ne suffit pas).

⚠️ Oralink utilise son propre domaine (`oralink`), distinct de `livebox`
(`hass-livebox-component`, cyr-ius) — les deux peuvent techniquement coexister,
mais ça duplique les appareils/entités pour la même box. Si tu migres depuis
`hass-livebox-component` ou une version d'Oralink antérieure au domaine
`oralink`, supprime l'ancienne entrée d'intégration puis reconfigure Oralink
depuis zéro (nouveaux `entity_id`, anciennes automatisations/tableaux de bord
à mettre à jour).

## Notification « nouvel appareil sur le réseau »

Oralink publie une entité `event.<box>_evenements_reseau` (nouvel appareil,
connexion, déconnexion). Un blueprint prêt à l'emploi envoie une notification
quand un appareil jamais vu se connecte :

[![Importer le blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FFrcJules%2FOralink%2Fblob%2Fmaster%2Fblueprints%2Fautomation%2Foralink%2Fnew_device_notification.yaml)

(ou Paramètres → Automatisations → Blueprints → Importer, avec l'URL
`https://github.com/FrcJules/Oralink/blob/master/blueprints/automation/oralink/new_device_notification.yaml`).

## Couper le Wi-Fi la nuit

Blueprint qui coupe le Wi-Fi à une heure donnée et le rallume le matin (jours
au choix, rattrapage après un redémarrage de HA) :

[![Importer le blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2FFrcJules%2FOralink%2Fblob%2Fmaster%2Fblueprints%2Fautomation%2Foralink%2Fwifi_night_schedule.yaml)

## Structure du repo

```
custom_components/oralink/   # Intégration HA
panel-src/                   # Source du panel web (React + Vite + Tailwind)
```

Voir [CLAUDE.md](CLAUDE.md) pour l'architecture détaillée et le workflow de
build du panel.

## Licence

MIT — voir [LICENSE](LICENSE). Oralink est dérivé de
[hass-livebox-component](https://github.com/cyr-ius/hass-livebox-component)
(MIT, © Antoine Colmard). « Orange » et « Livebox » sont des marques d'Orange ;
Oralink est un projet indépendant, non affilié à Orange.
