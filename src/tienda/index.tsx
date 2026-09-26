import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import base from '../../tienda/tienda.config.mjs'
import { supabase } from '../lib/supabaseClient'
import type { ConfiguracionDB, TiendaConfig } from './tipos'

// ============================================================================
// Configuración de la tienda en tiempo de ejecución.
//
// Combina tienda/tienda.config.mjs (valores de la instalación) con la fila de
// la tabla "configuracion" (lo que la dueña edita desde el admin). La fila de
// la base gana, campo por campo, cuando tiene valor.
//
// Además de la hook useTienda(), la config vigente queda en un módulo
// (tienda()) para que las funciones puras —armar links de WhatsApp,
// formatear precios— la lean sin tener que recibirla por parámetro.
// Para que esas funciones nunca vean valores viejos, el provider no dibuja
// la app hasta tener la config de la base (o hasta que falle / tarde).
// ============================================================================

// Validación mínima: el carrito crea pedidos con crear_pedido, que exige
// login. Sin cuentas no hay checkout posible.
function normalizar(cfg: TiendaConfig): TiendaConfig {
  if (cfg.features.carrito && !cfg.features.cuentas) {
    console.warn('[tienda] features.carrito requiere features.cuentas: se activan las cuentas.')
    return { ...cfg, features: { ...cfg.features, cuentas: true } }
  }
  return cfg
}

let actual: TiendaConfig = normalizar(base)

/** Config vigente (para funciones fuera de React). */
export function tienda(): TiendaConfig {
  return actual
}

/** Reemplaza {variables} de un texto de la config. {tienda} se completa solo. */
export function textoTienda(
  clave: keyof TiendaConfig['textos'],
  vars: Record<string, string | number> = {},
): string {
  const todas: Record<string, string | number> = { tienda: actual.nombre, ...vars }
  return actual.textos[clave].replace(/\{(\w+)\}/g, (m, k: string) =>
    k in todas ? String(todas[k]) : m,
  )
}

// Aplica la fila de la base sobre la config de la instalación.
function combinar(cfg: TiendaConfig, db: ConfiguracionDB | null): TiendaConfig {
  if (!db) return cfg
  return {
    ...cfg,
    nombre: db.nombre_tienda || cfg.nombre,
    eslogan: db.eslogan ?? cfg.eslogan,
    logoUrl: db.logo_url || cfg.logoUrl,
    urlSitio: db.url_sitio || cfg.urlSitio,
    contacto: {
      whatsapp: db.whatsapp || cfg.contacto.whatsapp,
      instagram: db.instagram ?? cfg.contacto.instagram,
      email: db.email_contacto || cfg.contacto.email,
    },
    tema: {
      ...cfg.tema,
      colorPrimario: db.color_primario || cfg.tema.colorPrimario,
      colorFondo: db.color_fondo || cfg.tema.colorFondo,
      colorTexto: db.color_texto || cfg.tema.colorTexto,
    },
  }
}

// Lleva los colores y fuentes de la config a las variables CSS de :root.
function aplicarTema(cfg: TiendaConfig) {
  const root = document.documentElement.style
  root.setProperty('--color-primario', cfg.tema.colorPrimario)
  root.setProperty('--color-fondo', cfg.tema.colorFondo)
  root.setProperty('--color-texto', cfg.tema.colorTexto)
  root.setProperty('--fuente-titulos', `'${cfg.tema.fuenteTitulos}', serif`)
  root.setProperty('--fuente-texto', `'${cfg.tema.fuenteTexto}', sans-serif`)
  document.title = cfg.nombre
}

// Si la tabla no existe todavía (migración sin correr) o la red tarda, la
// tienda arranca igual con los valores de tienda.config.mjs.
const ESPERA_MAXIMA_MS = 2500

interface TiendaContextValue {
  config: TiendaConfig
  /** Vuelve a leer la tabla "configuracion" (ej. después de guardar en el admin). */
  recargar: () => Promise<void>
}

const TiendaContext = createContext<TiendaContextValue | null>(null)

export function TiendaProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<TiendaConfig>(actual)
  const [lista, setLista] = useState(false)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('configuracion').select('*').maybeSingle()
    if (error) console.warn('[tienda] no se pudo leer "configuracion":', error.message)
    const nueva = normalizar(combinar(base, (data as ConfiguracionDB | null) ?? null))
    actual = nueva
    aplicarTema(nueva)
    setConfig(nueva)
  }, [])

  useEffect(() => {
    aplicarTema(actual)
    const timeout = setTimeout(() => setLista(true), ESPERA_MAXIMA_MS)
    recargar().finally(() => {
      clearTimeout(timeout)
      setLista(true)
    })
    return () => clearTimeout(timeout)
  }, [recargar])

  if (!lista) return null

  return <TiendaContext.Provider value={{ config, recargar }}>{children}</TiendaContext.Provider>
}

export function useTienda(): TiendaContextValue {
  const ctx = useContext(TiendaContext)
  if (!ctx) throw new Error('useTienda debe usarse dentro de <TiendaProvider>')
  return ctx
}
