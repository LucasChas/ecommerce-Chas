import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tienda from './tienda/tienda.config.mjs'
import { googleFontsHref, resolverTema } from './src/tienda/presets.mjs'

// Vite estándar para React, más:
//  - publicDir en tienda/public: logo, favicon y archivos públicos son de
//    cada tienda, no del núcleo.
//  - Reemplazo de %TIENDA_*% en index.html con la config (título y fuentes
//    correctos desde el primer byte, antes de que cargue React).
export default defineConfig({
  publicDir: 'tienda/public',
  plugins: [
    react(),
    {
      name: 'tienda-index-html',
      // 'pre': reemplazar antes de que Vite procese los <link> del HTML.
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html
            .replace(/%TIENDA_NOMBRE%/g, tienda.nombre)
            .replace(/%TIENDA_ESLOGAN%/g, tienda.eslogan)
            .replace(/%TIENDA_FUENTES%/g, googleFontsHref(resolverTema(tienda.tema))),
      },
    },
  ],
})
