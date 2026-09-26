// ============================================================================
// pnpm emails
//
// Completa las plantillas de mail de Supabase Auth
// (supabase/auth-email-templates/*.html) con los datos de la PLATAFORMA
// (plataforma/plataforma.config.mjs): Auth es uno solo para todas las
// tiendas, así que confirmar la cuenta o cambiar la contraseña llega con la
// marca de la plataforma. Deja el resultado en
// supabase/auth-email-templates/generadas/, listo para pegar en
// Supabase → Authentication → Emails.
// ============================================================================
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tienda from '../tienda/tienda.config.mjs'
import plataforma from '../plataforma/plataforma.config.mjs'
import { resolverTema } from '../src/tienda/presets.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origen = join(raiz, 'supabase', 'auth-email-templates')
const destino = join(origen, 'generadas')

const escapar = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// El logo del mail tiene que ser una URL absoluta: si en la config es una
// ruta de tienda/public ("/logo.png"), se le antepone la URL del sitio.
// La plataforma no tiene logo en imagen: el nombre va en el título del mail.
function logoHtml() {
  return ''
}

const valores = {
  '%TIENDA_NOMBRE%': escapar(plataforma.nombre),
  '%TIENDA_URL%': escapar(plataforma.urlPublica),
  '%TIENDA_COLOR%': resolverTema(tienda.tema).colorPrimario,
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
