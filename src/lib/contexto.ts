// ============================================================================
// ¿Qué se está mirando? La plataforma (landing, alta, panel de la cuenta) o
// una tienda (/t/<slug>/...). Se decide UNA vez, al cargar la página.
//
// - /t/<slug>/...        → vitrina de esa tienda; /t/<slug>/admin su panel.
// - VITE_TIENDA_SLUG     → deploy dedicado a una tienda (dominio propio): la
//                          tienda se sirve en la raíz del dominio.
// - cualquier otra ruta  → la plataforma.
//
// Con BASE como "basename" del router, todos los links internos de la
// tienda ("/carrito", "/producto/x") siguen escritos igual que antes.
// ============================================================================

const forzada = import.meta.env.VITE_TIENDA_SLUG as string | undefined
const coincide = window.location.pathname.match(/^\/t\/([a-z0-9-]+)(\/.*)?$/)

/** Slug de la tienda que se está mirando (null = plataforma). */
export const SLUG: string | null = forzada || (coincide ? coincide[1] : null)

/** Prefijo de las rutas de la tienda ("/t/<slug>", o "" con dominio propio). */
export const BASE = forzada ? '' : SLUG ? `/t/${SLUG}` : ''

// Ruta dentro de la tienda (sin el prefijo).
const resto = forzada ? window.location.pathname : coincide?.[2] ?? '/'

/**
 * Sesión "de gestión": la plataforma y el panel de una tienda comparten la
 * sesión de la dueña. La vitrina de cada tienda tiene la suya (la de sus
 * clientes), así comprar en una tienda no mezcla sesiones con otra.
 */
export const SESION_DE_GESTION = !SLUG || resto.startsWith('/admin')

/** URL absoluta de una ruta de la tienda actual (para mails y redirecciones). */
export function urlTienda(ruta: string): string {
  return `${window.location.origin}${BASE}${ruta}`
}
