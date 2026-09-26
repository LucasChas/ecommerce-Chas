import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tienda from './tienda/tienda.config.mjs'

// Arma el <link> de Google Fonts con las dos familias de la config.
function googleFontsHref(): string {
  const familias = [...new Set([tienda.tema.fuenteTitulos, tienda.tema.fuenteTexto])]
  const params = familias
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

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
            .replace(/%TIENDA_FUENTES%/g, googleFontsHref()),
      },
    },
  ],
})
