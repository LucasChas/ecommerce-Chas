// ============================================================================
// pnpm emails
//
// Completa las plantillas de mail de Supabase Auth
// (supabase/auth-email-templates/*.html) con los datos de
// tienda/tienda.config.mjs y deja el resultado en
// supabase/auth-email-templates/generadas/, listo para pegar en
// Supabase → Authentication → Emails.
// ============================================================================
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tienda from '../tienda/tienda.config.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origen = join(raiz, 'supabase', 'auth-email-templates')
const destino = join(origen, 'generadas')

const escapar = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// El logo del mail tiene que ser una URL absoluta: si en la config es una
// ruta de tienda/public ("/logo.png"), se le antepone la URL del sitio.
function logoHtml() {
  if (!tienda.logoUrl) return ''
  const url = /^https?:\/\//.test(tienda.logoUrl)
    ? tienda.logoUrl
    : tienda.urlSitio.replace(/\/$/, '') + tienda.logoUrl
  return `<img src="${escapar(url)}" alt="${escapar(tienda.nombre)}" style="max-height:48px;display:block;margin:0 auto 12px;" />`
}

const valores = {
  '%TIENDA_NOMBRE%': escapar(tienda.nombre),
  '%TIENDA_URL%': escapar(tienda.urlSitio),
  '%TIENDA_COLOR%': tienda.tema.colorPrimario,
  '%TIENDA_LOGO%': logoHtml(),
  '%ANIO%': String(new Date().getFullYear()),
}

mkdirSync(destino, { recursive: true })
for (const archivo of readdirSync(origen).filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(join(origen, archivo), 'utf8')
  for (const [marca, valor] of Object.entries(valores)) html = html.split(marca).join(valor)
  writeFileSync(join(destino, archivo), html)
  console.log(`✓ ${join('supabase/auth-email-templates/generadas', archivo)}`)
}
