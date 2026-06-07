import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Le panel HA est servi en module ES unique depuis
// custom_components/livebox/www/react-panel/. On construit donc un seul
// bundle JS + un seul CSS, sans hash, directement dans ce dossier. Le custom
// element (cf. main.jsx) ouvre un Shadow DOM et y pose lui-même un
// <link rel="stylesheet"> vers ce fichier — c'est ce qui isole le panel du
// CSS global de Home Assistant (et inversement). Garder le CSS dans un
// fichier séparé (plutôt que de l'injecter dans le JS) est donc requis ici.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
