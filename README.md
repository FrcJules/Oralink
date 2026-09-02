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

## Installation via HACS

1. HACS → menu (⋮) → **Dépôts personnalisés**.
2. URL : `https://github.com/FrcJules/Oralink`, catégorie **Intégration**.
3. Chercher **Oralink** dans HACS et l'installer.
4. Redémarrer Home Assistant, puis ajouter l'intégration **Oralink**
   depuis Paramètres → Appareils et services.

⚠️ Oralink utilise son propre domaine (`oralink`), distinct de `livebox`
(`hass-livebox-component`, cyr-ius) — les deux peuvent techniquement coexister,
mais ça duplique les appareils/entités pour la même box. Si tu migres depuis
`hass-livebox-component` ou une version d'Oralink antérieure au domaine
`oralink`, supprime l'ancienne entrée d'intégration puis reconfigure Oralink
depuis zéro (nouveaux `entity_id`, anciennes automatisations/tableaux de bord
à mettre à jour).

## Structure du repo

```
custom_components/oralink/   # Intégration HA
panel-src/                   # Source du panel web (React + Vite + Tailwind)
```

Voir [CLAUDE.md](CLAUDE.md) pour l'architecture détaillée et le workflow de
build du panel.
