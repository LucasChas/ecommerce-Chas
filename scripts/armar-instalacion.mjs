// ============================================================================
// pnpm sql:instalacion
//
// Une todas las migraciones (supabase/migrations/*.sql, en orden) en un solo
// archivo: supabase/instalar.sql. Para una tienda NUEVA alcanza con pegar ese
// archivo en el SQL Editor de Supabase y ejecutarlo una vez.
//
// Correlo cada vez que agregues una migración, así instalar.sql no queda viejo.
// ============================================================================
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = join(raiz, 'supabase', 'migrations')
const archivos = readdirSync(carpeta)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort()

const partes = [
  '-- ============================================================================',
  '-- INSTALACIÓN COMPLETA (archivo generado con `pnpm sql:instalacion`, no editar)',
  '--',
  '-- Pegá TODO este archivo en Supabase → SQL Editor → New query y ejecutá.',
  '-- Incluye, en orden: ' + archivos.join(', '),
  '--',
  '-- Después: creá tu usuario en Authentication → Users y corré',
  "--   select public.promover_admin('tu@email.com');",
  '-- ============================================================================',
  '',
]
for (const f of archivos) {
  partes.push(`\n-- >>>>>>>>>>>>>>>>>>>> ${f} <<<<<<<<<<<<<<<<<<<<\n`)
  partes.push(readFileSync(join(carpeta, f), 'utf8').trimEnd())
}
writeFileSync(join(raiz, 'supabase', 'instalar.sql'), partes.join('\n') + '\n')
console.log(`✓ supabase/instalar.sql (${archivos.length} migraciones)`)
