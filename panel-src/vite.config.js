import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// Le panel HA est servi en module ES unique depuis
// custom_components/livebox/www/react-panel/. On construit donc un seul
// bundle JS, sans hash, directement dans ce dossier. Le CSS est injecté
// dans le JS au runtime (cssInjectedByJsPlugin) plutôt qu'extrait dans un
// fichier .css séparé : rien côté HA/panel ne pose de <link rel="stylesheet">
// pour ce panel custom (élément personnalisé chargé comme module ES unique),
// donc un .css à part ne serait jamais chargé.
export default defineConfig({
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  build: {
    outDir: '../custom_components/livebox/www/react-panel',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'livebox-panel-react.js',
        assetFileNames: 'livebox-panel-react[extname]',
        format: 'es',
      },
    },
  },
})
