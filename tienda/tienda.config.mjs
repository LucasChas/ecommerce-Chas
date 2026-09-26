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

/** @type {import('../src/tienda/tipos').TiendaConfig} */
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

  tema: {
    colorPrimario: '#B08F55',
    colorFondo: '#F8F1E1',
    colorTexto: '#3B2F22',
    fuenteTitulos: 'Fraunces',
    fuenteTexto: 'Inter',
    ornamento: 'festón', // 'festón' | 'ninguno'
  },

  features: {
    carrito: true,
    cuentas: true,
    pedidosManuales: true,
  },

  catalogo: {
    stockBajo: 3,
    placeholderDescripcion: 'Material, medidas, detalles...',
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
