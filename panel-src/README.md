# Panel React — Oralink (Livebox)

Source React/Vite du panel personnalisé chargé par l'intégration Home
Assistant `custom_components/livebox`. Remplace l'ancien bundle compilé qui
n'avait plus de sources versionnées.

## Stack

- React + Vite (`@vitejs/plugin-react`)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Radix UI (onglets, dialogues...) avec une fine couche de style "shadcn-like" dans `src/components/ui/`
- `recharts` pour les futurs graphiques de trafic (cf. roadmap dans `CLAUDE.md`)

## Développement

```sh
npm install
npm run dev      # serveur de dev Vite (sans hass — utile pour le style des composants)
npm run build    # build de production
```

`npm run build` génère directement :

```
../custom_components/livebox/www/react-panel/livebox-panel-react.{js,css}
```

c'est-à-dire l'emplacement servi par `panel.py` (`/livebox_panel/react-panel/...`).
Pas de hash dans les noms de fichiers : l'intégration gère le cache-busting via
`_PANEL_BUILD` dans `__init__.py` (à incrémenter après chaque build).

## Architecture

- `src/main.jsx` définit l'élément personnalisé `<livebox-panel>` que Home
  Assistant instancie et alimente avec la prop `hass`.
- `src/lib/hass-context.jsx` relaie `hass` via le contexte React et expose
  `useWsCommand()` pour appeler les commandes WebSocket `livebox/*` de `panel.py`.
- `src/lib/use-ws-data.js` est un hook générique de chargement de données WS.
- `src/tabs/` contient un composant par onglet, qui correspond aux commandes
  `ws_get_*` exposées côté backend (`livebox/devices`, `livebox/dhcp`, etc.).
- `src/tabs/coming-soon-tab.jsx` matérialise les emplacements pour les
  fonctionnalités du plan (Événements, Graphiques...) qui restent à développer.
