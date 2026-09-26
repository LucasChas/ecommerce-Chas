// ============================================================================
// CONFIGURACIÓN DE LA PLATAFORMA (tu marca como proveedor de tiendas)
//
// Lo usan la landing, el alta de tiendas y el panel de cuentas. La estética
// base de todas las tiendas sigue en tienda/tienda.config.mjs.
//
// Es .mjs para que también lo lean los scripts de Node y vite.config.ts.
// ============================================================================

/** @type {import('../src/plataforma/tipos').PlataformaConfig} */
const plataforma = {
  nombre: 'Tiendas Chas', // ← nombre comercial de la plataforma (provisorio)
  eslogan: 'Tu tienda online lista en minutos',
  urlPublica: 'https://tiendaschas.com',

  plan: {
    nombre: 'Plan Tienda',
    precioMensual: 15000, // en la moneda de abajo; también va en el secreto PLATAFORMA_PRECIO
    moneda: 'ARS',
    // Días de prueba gratis. Tiene que coincidir con el default de
    // tiendas.prueba_hasta en la base (migración 0018: 14 días).
    diasPrueba: 14,
    incluye: [
      'Tu tienda con tu logo, tus colores y tu dirección propia',
      'Productos ilimitados, con talles, colores y fotos',
      'Carrito, checkout y cuentas de clientes',
      'Cobros con tu propia cuenta de MercadoPago',
      'Pedidos en tiempo real y panel desde el celular',
      'Envío fijo o gratis desde un monto',
    ],
  },

  contacto: {
    // WhatsApp de la plataforma: para "hagamos algo a medida" y soporte.
    whatsapp: '5490000000000',
    email: 'hola@tiendaschas.com',
    instagram: '',
  },

  // Tienda de muestra que se enlaza desde la landing ("Ver una tienda de ejemplo").
  demoSlug: 'demo',
}

export default plataforma
