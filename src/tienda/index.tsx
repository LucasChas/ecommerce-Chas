import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import base from '../../tienda/tienda.config.mjs'
import { supabase } from '../lib/supabaseClient'
import { urlTienda } from '../lib/contexto'
import type { ConfiguracionDB, TiendaConfig, TiendaConfigArchivo } from './tipos'
import { googleFontsHref, resolverTema } from './presets.mjs'
import { RUBROS } from './rubros.mjs'

// ============================================================================
// Configuración de la tienda en tiempo de ejecución.
//
// En la plataforma hay muchas tiendas: el provider carga la que indica la URL
// (/t/<slug>) y combina tienda/tienda.config.mjs (valores por defecto de TODAS
// las tiendas de la plataforma) con la fila de "configuracion" de esa tienda
// (lo que su dueña edita desde el panel). La fila de la base gana, campo por
// campo, cuando tiene valor.
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
  if (cfg.features.mercadoPago && !cfg.features.carrito) {
    cfg = { ...cfg, features: { ...cfg.features, mercadoPago: false } }
  }
  if (cfg.features.carrito && !cfg.features.cuentas) {
    console.warn('[tienda] features.carrito requiere features.cuentas: se activan las cuentas.')
    return { ...cfg, features: { ...cfg.features, cuentas: true } }
  }
  return cfg
}

// El archivo trae el tema como preset + overrides: acá se resuelve.
const archivo = base as TiendaConfigArchivo

// Fuera de una tienda (landing, alta) queda esta config por defecto.
const SIN_TIENDA = { id: '', slug: '', habilitada: false }

let actual: TiendaConfig = normalizar(combinar(archivo, null, SIN_TIENDA))

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

// Postgres devuelve numeric como string en algunos casos: normalizamos.
function numeroONull(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : Number(v)
}

// Aplica la fila de la base sobre la config de la instalación y resuelve el
// tema: preset (base > archivo) + colores/ornamento puntuales (base > archivo).
function combinar(
  cfg: TiendaConfigArchivo,
  db: ConfiguracionDB | null,
  info: Pick<TiendaConfig, 'id' | 'slug' | 'habilitada'>,
): TiendaConfig {
  if (!db) return { ...cfg, ...info, tema: resolverTema(cfg.tema) }
  return {
    ...cfg,
    ...info,
    nombre: db.nombre_tienda || cfg.nombre,
    eslogan: db.eslogan ?? cfg.eslogan,
    logoUrl: db.logo_url || cfg.logoUrl,
    urlSitio: db.url_sitio || cfg.urlSitio,
    contacto: {
      whatsapp: db.whatsapp || cfg.contacto.whatsapp,
      instagram: db.instagram ?? cfg.contacto.instagram,
      email: db.email_contacto || cfg.contacto.email,
    },
    envio: {
      // undefined = columna inexistente (base sin la 0016): se usa el archivo.
      costo: db.envio_costo !== undefined ? numeroONull(db.envio_costo) : cfg.envio.costo,
      gratisDesde:
        db.envio_gratis_desde !== undefined ? numeroONull(db.envio_gratis_desde) : cfg.envio.gratisDesde,
    },
    tema: resolverTema({
      ...cfg.tema,
      preset: db.tema_preset || cfg.tema.preset,
      colorPrimario: db.color_primario || cfg.tema.colorPrimario,
      colorFondo: db.color_fondo || cfg.tema.colorFondo,
      colorTexto: db.color_texto || cfg.tema.colorTexto,
      ornamento: db.ornamento || cfg.tema.ornamento,
    }),
  }
}

// Variables que puso el preset anterior (para limpiarlas al cambiar de preset).
let variablesPreset: string[] = []

// Lleva el tema a las variables CSS de :root y carga sus fuentes.
function aplicarTema(cfg: TiendaConfig) {
  const root = document.documentElement.style
  variablesPreset.forEach((v) => root.removeProperty(v))
  variablesPreset = Object.keys(cfg.tema.variables)
  for (const [nombre, valor] of Object.entries(cfg.tema.variables)) root.setProperty(nombre, valor)
  document.documentElement.dataset.tema = cfg.tema.preset
  root.setProperty('--color-primario', cfg.tema.colorPrimario)
  root.setProperty('--color-fondo', cfg.tema.colorFondo)
  root.setProperty('--color-texto', cfg.tema.colorTexto)
  root.setProperty('--fuente-titulos', `'${cfg.tema.fuenteTitulos}', serif`)
  root.setProperty('--fuente-texto', `'${cfg.tema.fuenteTexto}', sans-serif`)
  // index.html ya trae las fuentes del archivo; si la base eligió otro
  // preset, cargamos las suyas.
  const href = googleFontsHref(cfg.tema)
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
  document.title = cfg.nombre
}

// Si la red tarda, la tienda arranca igual con lo que haya.
const ESPERA_MAXIMA_MS = 4000

interface TiendaContextValue {
  config: TiendaConfig
  /** Vuelve a leer la tienda y su configuración (ej. después de guardar en el panel). */
  recargar: () => Promise<void>
}

const TiendaContext = createContext<TiendaContextValue | null>(null)

type Estado = 'cargando' | 'ok' | 'no-existe'

// Carga la tienda de la URL. Mientras carga no dibuja nada (así las funciones
// puras nunca ven la config de otra tienda); si no existe, muestra el aviso.
export function TiendaProvider({
  slug,
  noExiste,
  children,
}: {
  slug: string
  noExiste: React.ReactNode
  children: React.ReactNode
}) {
  const [config, setConfig] = useState<TiendaConfig>(actual)
  const [estado, setEstado] = useState<Estado>('cargando')

  const recargar = useCallback(async () => {
    const { data: t, error } = await supabase.rpc('tienda_publica', { p_slug: slug }).maybeSingle()
    if (error) console.warn('[tienda] no se pudo leer la tienda:', error.message)
    const info = t as {
      id: string
      slug: string
      habilitada: boolean
      rubro: string | null
      mp_conectado: boolean
    } | null
    if (!info) {
      setEstado('no-existe')
      return
    }
    const { data: db } = await supabase.from('configuracion').select('*').eq('tienda_id', info.id).maybeSingle()
    const combinada = combinar(archivo, (db as ConfiguracionDB | null) ?? null, {
      id: info.id,
      slug: info.slug,
      habilitada: info.habilitada,
    })
    // El rubro de la tienda define cómo se llaman sus variantes y qué datos
    // extra tienen sus productos; el pago online se ofrece solo si la tienda
    // conectó su MercadoPago (y la plataforma lo tiene activado).
    const rubro = RUBROS[(info.rubro ?? 'generico') as keyof typeof RUBROS] ?? RUBROS.generico
    const nueva = normalizar({
      ...combinada,
      // Sin dominio propio cargado, la tienda vive en /t/<slug> de la plataforma.
      urlSitio: (db as ConfiguracionDB | null)?.url_sitio || urlTienda(''),
      catalogo: {
        ...combinada.catalogo,
        etiquetaVariante: rubro.etiquetaVariante,
        atributos: rubro.atributos,
        placeholderDescripcion: rubro.placeholderDescripcion,
      },
      features: { ...combinada.features, mercadoPago: combinada.features.mercadoPago && info.mp_conectado },
    })
    actual = nueva
    aplicarTema(nueva)
    setConfig(nueva)
    setEstado('ok')
  }, [slug])

  useEffect(() => {
    aplicarTema(actual)
    const timeout = setTimeout(() => setEstado((e) => (e === 'cargando' ? 'no-existe' : e)), ESPERA_MAXIMA_MS)
    recargar().finally(() => clearTimeout(timeout))
    return () => clearTimeout(timeout)
  }, [recargar])

  if (estado === 'cargando') return null
  if (estado === 'no-existe') return <>{noExiste}</>

  return <TiendaContext.Provider value={{ config, recargar }}>{children}</TiendaContext.Provider>
}

export function useTienda(): TiendaContextValue {
  const ctx = useContext(TiendaContext)
  if (!ctx) throw new Error('useTienda debe usarse dentro de <TiendaProvider>')
  return ctx
}
