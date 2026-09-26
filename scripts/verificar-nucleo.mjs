// ============================================================================
// pnpm verificar
//
// Chequea que el núcleo (src/) siga siendo genérico y que lo generado esté al
// día. Lo corre la CI; conviene correrlo antes de cada commit.
//
//   1) src/ no menciona datos de la tienda (nombre, WhatsApp, email, URL):
//      eso va en tienda/ o en la tabla "configuracion".
//   2) Los colores van por tokens: nada de hex sueltos en los .tsx (salvo el
//      placeholder de imagen y los presets, que son la paleta en sí).
//   3) supabase/instalar.sql coincide con las migraciones.
// ============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import tienda from '../tienda/tienda.config.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const errores = []

function archivos(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? archivos(p) : [p]
  })
}
const fuentes = archivos(join(raiz, 'src')).filter((f) => /\.(tsx?|css|mjs)$/.test(f))

// 1) Datos de la tienda hardcodeados en el núcleo.
const prohibidos = [tienda.nombre, tienda.contacto.whatsapp, tienda.contacto.email, tienda.urlSitio]
  .filter((v) => v && v.length > 4)
for (const f of fuentes) {
  const txt = readFileSync(f, 'utf8')
  for (const v of prohibidos) {
    if (txt.includes(v)) errores.push(`${relative(raiz, f)}: contiene "${v}" (va en tienda/ o en la base)`)
  }
}

// 2) Colores hex sueltos en componentes.
const permitidos = ['src/lib/images.ts', 'src/tienda/presets.mjs', 'src/styles/tokens.css']
for (const f of fuentes.filter((f) => f.endsWith('.tsx'))) {
  const rel = relative(raiz, f)
  if (permitidos.includes(rel)) continue
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((linea, i) => {
      if (/['"`]#[0-9a-fA-F]{3,8}['"`]/.test(linea)) errores.push(`${rel}:${i + 1}: color hex suelto (usá var(--color-*))`)
    })
}

// 3) instalar.sql al día.
const antes = readFileSync(join(raiz, 'supabase', 'instalar.sql'), 'utf8')
execFileSync(process.execPath, [join(raiz, 'scripts', 'armar-instalacion.mjs')], { stdio: 'ignore' })
if (readFileSync(join(raiz, 'supabase', 'instalar.sql'), 'utf8') !== antes) {
  errores.push('supabase/instalar.sql estaba desactualizado: se regeneró, commitealo.')
}

if (errores.length) {
  console.error('✗ Verificación del núcleo:\n  ' + errores.join('\n  '))
  process.exit(1)
}
console.log('✓ Núcleo genérico y archivos generados al día')
