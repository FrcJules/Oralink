import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Le panel HA est servi en module ES unique depuis
// custom_components/oralink/www/react-panel/. On construit donc un seul
// bundle JS + un seul CSS, sans hash, directement dans ce dossier. Le custom
// element (cf. main.jsx) ouvre un Shadow DOM et y pose lui-même un
// <link rel="stylesheet"> vers ce fichier — c'est ce qui isole le panel du
// CSS global de Home Assistant (et inversement). Garder le CSS dans un
// fichier séparé (plutôt que de l'injecter dans le JS) est donc requis ici.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Chemins relatifs à l'URL du module (le panel est servi sous
  // /livebox_panel/react-panel/, pas à la racine du site HA).
  base: './',
  build: {
    // Une seule feuille de style : le Shadow DOM du panel ne charge que
    // livebox-panel-react.css ; une CSS par chunk serait injectée dans le
    // <head> du document, hors du Shadow DOM, donc sans effet.
    cssCodeSplit: false,
    // Pas de préchargement des dépendances de chunks (le helper de Vite
    // insère des <link> dans le document, inutile ici).
    modulePreload: false,
    outDir: '../custom_components/oralink/www/react-panel',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'livebox-panel-react.js',
        // Onglets chargés à la demande (React.lazy) : noms hashés, donc
        // cache-busting automatique, rangés à part pour le nettoyage au
        // déploiement (scripts/deploy.sh).
        chunkFileNames: 'chunks/[name]-[hash].js',
        // HA charge le point d'entrée avec un paramètre « ?v=<build> » : si un
        // chunk importait « ../livebox-panel-react.js » (sans paramètre), le
        // navigateur le chargerait une 2e fois (2 React, custom element déjà
        // défini…). Tout le code partagé va donc dans un chunk « core » que
        // l'entrée ET les onglets lazy importent ; seuls les onglets lourds et
        // leurs dépendances exclusives (recharts, @xyflow, d3…) restent à part.
        manualChunks(id) {
          const lazyOnly = [
            '/src/tabs/graphs-tab.jsx', '/src/tabs/topology-tab.jsx',
            '/src/components/topology-graph.jsx',
            '/node_modules/recharts/', '/node_modules/@xyflow/', '/node_modules/d3-',
            '/node_modules/victory-vendor/', '/node_modules/react-smooth/',
            '/node_modules/recharts-scale/', '/node_modules/decimal.js-light/',
            '/node_modules/eventemitter3/', '/node_modules/@reduxjs/', '/node_modules/redux',
            '/node_modules/reselect/', '/node_modules/immer/', '/node_modules/react-redux/',
            '/node_modules/use-sync-external-store/', '/node_modules/zustand/',
            '/node_modules/classcat/', '/node_modules/es-toolkit/', '/node_modules/tiny-invariant/',
            '/node_modules/internmap/',
          ]
          if (id.endsWith('/src/main.jsx')) return undefined
          if (lazyOnly.some((part) => id.includes(part))) return undefined
          return 'core'
        },
        assetFileNames: 'livebox-panel-react[extname]',
        format: 'es',
      },
    },
  },
})
