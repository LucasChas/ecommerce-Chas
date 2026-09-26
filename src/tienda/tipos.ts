// ============================================================================
// Tipos de la configuración de una tienda.
//
// La configuración tiene dos fuentes que se combinan (ver src/tienda/index.tsx):
//   1. tienda/tienda.config.mjs  → valores de la instalación (build).
//   2. tabla "configuracion"     → lo que la dueña cambia desde el admin
//                                  (pisa a la anterior, sin redeploy).
// ============================================================================

export type Ornamento = 'festón' | 'onda' | 'línea' | 'ninguno'

export type PresetTema = 'calido' | 'minimal' | 'oscuro' | 'vibrante'

/** Tema tal como se escribe en tienda.config.mjs: un preset + lo que se quiera pisar. */
export interface TemaArchivo {
  preset: PresetTema
  colorPrimario?: string | null
  colorFondo?: string | null
  colorTexto?: string | null
  /** Familia de Google Fonts para títulos. */
  fuenteTitulos?: string | null
  /** Familia de Google Fonts para el resto del texto. */
  fuenteTexto?: string | null
  /** Elemento decorativo debajo del header. */
  ornamento?: Ornamento | null
}

/** Tema final (preset + overrides), el que usa la app. */
export interface TemaResuelto {
  preset: PresetTema
  colorPrimario: string
  colorFondo: string
  colorTexto: string
  fuenteTitulos: string
  fuenteTexto: string
  ornamento: Ornamento
  /** Tokens CSS extra del preset (radios, tarjetas, sombras). */
  variables: Record<string, string>
}

export interface AtributoProducto {
  /** Clave interna (sin espacios), ej. "material". */
  clave: string
  /** Etiqueta visible, ej. "Material". */
  etiqueta: string
}

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

  tema: TemaResuelto

  features: {
    /** Carrito + checkout + pedidos online. false = solo muestrario (consulta por WhatsApp). */
    carrito: boolean
    /** Registro de clientes y "Mis pedidos". El carrito lo necesita (crear_pedido exige login). */
    cuentas: boolean
    /** Carga manual de pedidos desde el admin (ventas por WhatsApp, local, etc.). */
    pedidosManuales: boolean
    /**
     * Pago online con MercadoPago en el checkout. Requiere desplegar las Edge
     * Functions crear-preferencia-mp y webhook-mercadopago (ver docs).
     */
    mercadoPago: boolean
  }

  envio: {
    /** Costo fijo del envío a domicilio. null = "a coordinar" (no se cobra en la web). */
    costo: number | null
    /** Envío gratis cuando el subtotal llega a este monto. null = nunca. */
    gratisDesde: number | null
  }

  catalogo: {
    /** Con stock <= a este número se muestra "¡Últimas N unidades!". */
    stockBajo: number
    /** Placeholder del campo descripción en el admin (orienta según el rubro). */
    placeholderDescripcion: string
    /**
     * Cómo se llaman las variantes de un producto en este rubro (ej. "Talle",
     * "Color", "Tamaño"). Se usa en la ficha ("Elegí un talle") y en el admin.
     */
    etiquetaVariante: string
    /**
     * Datos extra de los productos de este rubro. Cada uno aparece como campo
     * en el admin y como fila en la ficha del producto (si tiene valor).
     */
    atributos: AtributoProducto[]
  }

  idioma: {
    /** Trato de la interfaz: 'vos' (rioplatense) o 'tu'. */
    trato: 'vos' | 'tu'
    /**
     * Pisa cualquier texto del diccionario (src/i18n/textos.ts), ej.
     * { 'estado.nuevo': 'Recibido' }.
     */
    textos?: Partial<Record<import('../i18n/textos').ClaveTexto, string>>
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
  // 0016
  envio_costo?: number | null
  envio_gratis_desde?: number | null
  // 0017
  tema_preset?: PresetTema | null
  ornamento?: Ornamento | null
}

/** Config tal como se escribe en tienda/tienda.config.mjs. */
export interface TiendaConfigArchivo extends Omit<TiendaConfig, 'tema'> {
  tema: TemaArchivo
}
