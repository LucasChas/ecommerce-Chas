// ============================================================================
// Tipos de la configuración de una tienda.
//
// La configuración tiene dos fuentes que se combinan (ver src/tienda/index.tsx):
//   1. tienda/tienda.config.mjs  → valores de la instalación (build).
//   2. tabla "configuracion"     → lo que la dueña cambia desde el admin
//                                  (pisa a la anterior, sin redeploy).
// ============================================================================

export type Ornamento = 'festón' | 'ninguno'

export interface TiendaConfig {
  /** Nombre comercial. Aparece en header, títulos, mails y mensajes. */
  nombre: string
  /** Bajada corta debajo del logo y en el footer (ej. "Ropa y accesorios"). */
  eslogan: string
  /** URL del logo (ej. "/logo.png" en tienda/public). null = logo de texto. */
  logoUrl: string | null
  /** URL pública del sitio (se usa en legales y mails). */
  urlSitio: string

  contacto: {
    /** Formato internacional sin + ni espacios (ej. 5493510000000). */
    whatsapp: string
    /** Usuario sin @. Vacío = se ocultan los botones de Instagram. */
    instagram: string
    /** Email de contacto (legales, footer). */
    email: string
  }

  region: {
    /** Locale para formatear precios y fechas (ej. "es-AR", "es-MX"). */
    locale: string
    /** Código ISO de moneda (ej. "ARS", "MXN", "USD"). */
    moneda: string
    /** Decimales a mostrar en los precios. */
    decimales: number
    /** Código telefónico del país, sin + (Argentina: "54"). */
    codigoPais: string
    /**
     * Prefijo que se antepone a los teléfonos cargados sin código de país,
     * para armar links de WhatsApp (Argentina: "549", México: "521", etc.).
     */
    prefijoWhatsapp: string
  }

  tema: {
    colorPrimario: string
    colorFondo: string
    colorTexto: string
    /** Familia de Google Fonts para títulos. */
    fuenteTitulos: string
    /** Familia de Google Fonts para el resto del texto. */
    fuenteTexto: string
    /** Elemento decorativo debajo del header. */
    ornamento: Ornamento
  }

  features: {
    /** Carrito + checkout + pedidos online. false = solo muestrario (consulta por WhatsApp). */
    carrito: boolean
    /** Registro de clientes y "Mis pedidos". El carrito lo necesita (crear_pedido exige login). */
    cuentas: boolean
    /** Carga manual de pedidos desde el admin (ventas por WhatsApp, local, etc.). */
    pedidosManuales: boolean
  }

  catalogo: {
    /** Con stock <= a este número se muestra "¡Últimas N unidades!". */
    stockBajo: number
    /** Placeholder del campo descripción en el admin (orienta según el rubro). */
    placeholderDescripcion: string
  }

  legal: {
    /** Fecha que se muestra en Términos y Privacidad (texto libre). */
    ultimaActualizacion: string
  }

  /**
   * Textos con marca o tono propio. Admiten variables entre llaves:
   * {tienda}, {producto}, {numero}, {nombre}.
   */
  textos: {
    whatsappConsulta: string
    whatsappConsultaSinStock: string
    whatsappPedido: string
    whatsappCancelacion: string
    whatsappAdminACliente: string
    pedidoExito: string
    registroBajada: string
  }
}

/** Campos que la dueña puede cambiar desde el admin (tabla "configuracion"). */
export interface ConfiguracionDB {
  nombre_tienda: string | null
  eslogan: string | null
  logo_url: string | null
  url_sitio: string | null
  color_primario: string | null
  color_fondo: string | null
  color_texto: string | null
  whatsapp: string | null
  instagram: string | null
  email_contacto: string | null
}
