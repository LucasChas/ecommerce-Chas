// ============================================================================
// pnpm nueva-tienda
//
// Asistente para dar de alta una tienda nueva: hace unas preguntas, completa
// tienda/tienda.config.mjs, arma supabase/instalar.sql y genera los mails de
// Auth. Al final imprime los pasos manuales que quedan (Supabase y deploy).
//
// Solo toca los valores de las preguntas: el resto del archivo (comentarios,
// textos de WhatsApp, etc.) queda como está para ajustarlo a mano.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { execFileSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const rutaConfig = join(raiz, 'tienda', 'tienda.config.mjs')
const { default: actual } = await import('../tienda/tienda.config.mjs')

// Se leen las respuestas como un flujo de líneas (y no con rl.question) para
// que el script también funcione con respuestas pegadas o por pipe.
const rl = createInterface({ input: stdin, output: stdout })
const lineas = rl[Symbol.asyncIterator]()

// Pregunta mostrando el valor actual; Enter lo deja igual.
async function preguntar(texto, actualValor, validar) {
  for (;;) {
    stdout.write(`${texto} [${actualValor}]: `)
    const { value, done } = await lineas.next()
    if (done) throw new Error('Se cortó la entrada antes de terminar las preguntas.')
    if (!stdin.isTTY) stdout.write(`${value}\n`)
    const r = value.trim()
    const valor = r === '' ? String(actualValor) : r
    const error = validar?.(valor)
    if (!error) return valor
    console.log(`  ✗ ${error}`)
  }
}
const siNo = (v) => (/^(s|si|sí|y|yes|true)$/i.test(v) ? true : /^(n|no|false)$/i.test(v) ? false : null)
const esColor = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? null : 'Usá formato #RRGGBB (ej. #B08F55)')
const soloDigitos = (v) => (/^\d{8,15}$/.test(v) ? null : 'Solo números, con código de país (ej. 5493510000000)')

console.log('\n🛍️  Nueva tienda — Enter deja el valor actual.\n')

const r = {}
r.nombre = await preguntar('Nombre de la tienda', actual.nombre)
r.eslogan = await preguntar('Eslogan', actual.eslogan)
r.urlSitio = await preguntar('URL del sitio', actual.urlSitio, (v) =>
  /^https?:\/\//.test(v) ? null : 'Tiene que empezar con https://',
)
r.whatsapp = await preguntar('WhatsApp', actual.contacto.whatsapp, soloDigitos)
r.instagram = (await preguntar('Instagram (sin @, "-" para ninguno)', actual.contacto.instagram || '-')).replace(/^@/, '')
if (r.instagram === '-') r.instagram = ''
r.email = await preguntar('Email de contacto', actual.contacto.email)
r.colorPrimario = await preguntar('Color principal', actual.tema.colorPrimario, esColor)
r.colorFondo = await preguntar('Color de fondo', actual.tema.colorFondo, esColor)
r.colorTexto = await preguntar('Color de texto', actual.tema.colorTexto, esColor)
r.moneda = (await preguntar('Moneda (ISO)', actual.region.moneda)).toUpperCase()
r.locale = await preguntar('Locale', actual.region.locale)
const carrito = siNo(
  await preguntar('¿Venta online con carrito? (s/n; n = solo muestrario)', actual.features.carrito ? 's' : 'n', (v) =>
    siNo(v) === null ? 'Respondé s o n' : null,
  ),
)
rl.close()

// Reemplaza el valor de una clave (línea "  clave: valor, // comentario")
// sin tocar la indentación ni el comentario.
let archivo = readFileSync(rutaConfig, 'utf8')
function setear(clave, valor) {
  const literal = typeof valor === 'string' ? `'${valor.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(valor)
  const re = new RegExp(`^(\\s*${clave}: ).*?,(\\s*//.*)?$`, 'm')
  if (!re.test(archivo)) throw new Error(`No encontré "${clave}" en tienda.config.mjs`)
  archivo = archivo.replace(re, (_m, pre, comentario = '') => `${pre}${literal},${comentario}`)
}
setear('nombre', r.nombre)
setear('eslogan', r.eslogan)
setear('urlSitio', r.urlSitio)
setear('whatsapp', r.whatsapp)
setear('instagram', r.instagram)
setear('email', r.email)
setear('colorPrimario', r.colorPrimario)
setear('colorFondo', r.colorFondo)
setear('colorTexto', r.colorTexto)
setear('moneda', r.moneda)
setear('locale', r.locale)
setear('carrito', carrito)
// El carrito necesita cuentas (crear_pedido exige login).
if (carrito) setear('cuentas', true)
writeFileSync(rutaConfig, archivo)
console.log('\n✓ tienda/tienda.config.mjs actualizado')

execFileSync(process.execPath, [join(raiz, 'scripts', 'armar-instalacion.mjs')], { stdio: 'inherit' })
execFileSync(process.execPath, [join(raiz, 'scripts', 'generar-emails.mjs')], { stdio: 'inherit' })

console.log(`
Listo. Lo que queda (ver docs/INSTALACION.md para el detalle):

  1. Supabase: creá el proyecto y pegá supabase/instalar.sql en el SQL Editor.
  2. Authentication → Users → creá la cuenta de la dueña y corré:
       select public.promover_admin('email-de-la-duena');
  3. Authentication → Emails: pegá los HTML de supabase/auth-email-templates/generadas/.
  4. Copiá .env.example a .env con la URL y la anon key del proyecto.
  5. Logo y favicon: poné los archivos en tienda/public/ (o subí el logo desde
     el admin → "Mi tienda").
  6. pnpm dev para probar, y deploy (Vercel/Netlify) con las mismas variables.
`)
