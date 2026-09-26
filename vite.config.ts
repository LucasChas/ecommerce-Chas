import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tienda from './tienda/tienda.config.mjs'
import plataforma from './plataforma/plataforma.config.mjs'
import { googleFontsHref, resolverTema } from './src/tienda/presets.mjs'

// Vite estándar para React, más:
//  - publicDir en tienda/public: logo, favicon y archivos públicos son de
//    cada tienda, no del núcleo.
//  - Reemplazo de %TIENDA_*% en index.html: nombre de la plataforma y fuentes
//    del tema base (cada tienda cambia título y fuentes al cargar).
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
            .replace(/%TIENDA_NOMBRE%/g, plataforma.nombre)
            .replace(/%TIENDA_ESLOGAN%/g, plataforma.eslogan)
            .replace(/%TIENDA_FUENTES%/g, googleFontsHref(resolverTema(tienda.tema))),
      },
    },
  ],
})
