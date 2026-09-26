// ============================================================================
// CONFIGURACIÓN DE LA TIENDA
//
// Este es el archivo principal para personalizar la maqueta para un cliente.
// El código del núcleo (src/) no se toca: todo lo que cambia entre tiendas
// vive en esta carpeta (tienda/).
//
//   tienda/tienda.config.mjs  → este archivo (marca, contacto, región, features)
//   tienda/tema.css           → ajustes finos de estilo (opcional)
//   tienda/public/            → logo, favicon y archivos públicos
//
// Nombre, eslogan, logo, colores y contacto también se pueden cambiar después
// desde el admin (pestaña "Mi tienda"): lo que se guarde ahí pisa estos valores.
//
// Es .mjs (y no .ts) para que lo puedan leer tanto la app como los scripts
// de Node (ej. el generador de plantillas de mail). El tipo lo valida igual.
// ============================================================================

/** @type {import('../src/tienda/tipos').TiendaConfigArchivo} */
const tienda = {
  nombre: 'Mi Tienda',
  eslogan: 'Productos seleccionados',
  logoUrl: null, // ej. '/logo.png' (archivo en tienda/public). null = logo de texto
  urlSitio: 'https://mi-tienda.com',

  contacto: {
    whatsapp: '5490000000000',
    instagram: '',
    email: 'hola@mi-tienda.com',
  },

  region: {
    locale: 'es-AR',
    moneda: 'ARS',
    decimales: 0,
    codigoPais: '54',
    prefijoWhatsapp: '549', // se antepone a teléfonos cargados sin código de país
  },

  // Tema: un preset ('calido' | 'minimal' | 'oscuro' | 'vibrante') y, si
  // hace falta, valores puntuales encima. null = el valor del preset.
  tema: {
    preset: 'calido',
    colorPrimario: null, // ej. '#B08F55'
    colorFondo: null,
    colorTexto: null,
    fuenteTitulos: null, // familia de Google Fonts, ej. 'Fraunces'
    fuenteTexto: null,
    ornamento: null, // 'festón' | 'onda' | 'línea' | 'ninguno'
  },

  features: {
    carrito: true,
    cuentas: true,
    pedidosManuales: true,
    mercadoPago: false, // requiere las Edge Functions de MP (docs/INSTALACION.md)
  },

  // Envío a domicilio. También se edita desde el admin → "Mi tienda".
  envio: {
    costo: null, // null = a coordinar; un número = costo fijo
    gratisDesde: null, // ej. 50000 → gratis desde ese subtotal
  },

  catalogo: {
    stockBajo: 3,
    placeholderDescripcion: 'Material, medidas, detalles...',
    // Nombre de las variantes en este rubro: 'Talle', 'Color', 'Tamaño'...
    etiquetaVariante: 'Opción',
    // Datos extra de cada producto (aparecen en el admin y en la ficha).
    // Ej. ropa: [{ clave: 'material', etiqueta: 'Material' }, { clave: 'cuidados', etiqueta: 'Cuidados' }]
    atributos: [],
  },

  idioma: {
    trato: 'vos', // 'vos' | 'tu'
    // Pisar cualquier texto de src/i18n/textos.ts, ej.:
    // textos: { 'estado.nuevo': 'Recibido', 'estadoAdmin.confirmado': 'Armando' },
    textos: {},
  },

  legal: {
    // Las páginas /terminos y /privacidad usan nombre, urlSitio y email de
    // arriba. Revisá el texto con un asesor legal antes de publicar.
    ultimaActualizacion: '26 de septiembre de 2026',
  },

  // Variables disponibles: {tienda} {producto} {numero} {nombre}
  textos: {
    whatsappConsulta: 'Hola! Quería consultar por "{producto}" ({tienda}) que vi en la web.',
    whatsappConsultaSinStock: 'Hola! Quería consultar disponibilidad de "{producto}" ({tienda}).',
    whatsappPedido: 'Hola! Soy {nombre}. Acabo de hacer el pedido #{numero} en la web de {tienda}:',
    whatsappCancelacion:
      'Hola! Vi que mi pedido #{numero} en {tienda} figura como cancelado. ¿Me podrías decir qué pasó?',
    whatsappAdminACliente: 'Hola! Te escribo por tu pedido #{numero} en {tienda}',
    pedidoExito:
      'Gracias por confiar en {tienda}. Ya tenemos tu pedido y lo estamos preparando con mucho cariño.',
    registroBajada: 'Creá tu cuenta de {tienda} para comprar y seguir tus pedidos.',
  },
}

export default tienda
