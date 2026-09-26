import { createClient } from '@supabase/supabase-js'
import { SESION_DE_GESTION, SLUG } from './contexto'

// Cliente único de Supabase para toda la app.
// Las claves vienen de variables de entorno (ver .env.example).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla temprano y con un mensaje claro si falta configurar el .env.
  throw new Error(
    'Faltan las variables VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completalas.',
  )
}

// ---------------------------------------------------------------------------
// Sesiones separadas: gestión (plataforma + paneles) vs. vitrina de cada tienda.
//
// Si compartieran la misma clave, entrar como clienta en una tienda pisaría la
// sesión de la dueña (y al revés), y comprar en la tienda A dejaría la sesión
// abierta en la tienda B. Ver SESION_DE_GESTION en lib/contexto.ts.
// ---------------------------------------------------------------------------
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: SESION_DE_GESTION ? 'plataforma-auth' : `tienda-auth-${SLUG}`,
  },
})
