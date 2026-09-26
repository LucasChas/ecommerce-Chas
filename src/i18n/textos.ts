import { tienda } from '../tienda'

// ============================================================================
// Diccionario de textos de la interfaz.
//
// - VOS: textos base (español rioplatense, con voseo).
// - TU:  solo los que cambian al tutear. Se elige con tienda.config.mjs →
//        idioma.trato ('vos' | 'tu').
// - Cualquier texto se puede pisar por tienda con idioma.textos
//   (ej. { 'estado.nuevo': 'Recibido' }).
//
// Admiten variables entre llaves: {numero}, {variante}, etc.
// Los textos sin trato (ej. "Cancelar") siguen escritos en los componentes;
// acá están los que cambian según el trato y los que una tienda suele querer
// renombrar (estados de pedido).
// ============================================================================

export const VOS = {
  // ---- Estados de pedido (cliente y panel) ----
  'estado.nuevo': 'Pedido recibido',
  'estado.confirmado': 'Confirmado · en preparación',
  'estado.entregado': 'Entregado',
  'estado.cancelado': 'Cancelado',
  'estadoAdmin.nuevo': 'Nuevo',
  'estadoAdmin.confirmado': 'En preparación',
  'estadoAdmin.entregado': 'Entregado',
  'estadoAdmin.cancelado': 'Cancelado',

  // ---- Catálogo y ficha ----
  'producto.elegirVariante': 'Elegí {variante}',
  'producto.notaSinStock': 'Escribinos por WhatsApp o Instagram para consultar disponibilidad.',
  'producto.notaCarrito': 'Agregalo al carrito y completá el pedido desde el checkout.',
  'producto.notaMuestrario': 'Escribinos por WhatsApp o Instagram para hacer tu pedido.',

  // ---- Carrito y checkout ----
  'carrito.siguientePaso': 'En el siguiente paso cargás tus datos y la entrega.',
  'checkout.revisar': 'Revisá el resumen y volvé a confirmar.',
  'checkout.pagoCoordinar': 'Acordás el pago (efectivo, transferencia…) al confirmar el pedido.',
  'checkout.errorRegistrar': 'No pudimos registrar el pedido. Probá de nuevo en un momento.',
  'checkout.errorPago':
    'Registramos tu pedido #{numero}, pero no pudimos abrir MercadoPago. Podés reintentar el pago desde "Mis pedidos".',
  'exito.coordinar': 'Escribinos por WhatsApp y coordinamos',

  // ---- Pago online ----
  'pago.errorAbrir': 'No pudimos abrir MercadoPago. Probá de nuevo en un momento.',
  'pago.aprobado': 'Ya estamos preparando tu pedido. Podés seguirlo desde "Mis pedidos".',
  'pago.rechazado': 'Tu pedido sigue reservado. Podés intentar de nuevo con otro medio de pago.',

  // ---- Cuenta ----
  'cuenta.introIngresar': 'Ingresá para ver tus pedidos y finalizar tu compra.',
  'cuenta.introRecuperar': 'Ingresá tu email y te mandamos un link para elegir una contraseña nueva.',
  'cuenta.avisoRecuperar':
    'Si ese email tiene una cuenta, te mandamos un link para restablecer la contraseña. Revisá también la carpeta de spam.',
  'cuenta.yaRegistrado': 'Ese email ya tiene una cuenta. Ingresá tu contraseña para entrar.',
  'cuenta.confirmarEmail':
    'Ya casi está: te mandamos un email para confirmar tu cuenta. Abrilo y tocá el enlace para poder ingresar. ¿No lo ves? Revisá también la carpeta de spam.',
  'reset.linkInvalido':
    'Este link de recuperación no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?" en la pantalla de ingreso.',
  'reset.intro': 'Elegí tu nueva contraseña.',
  'reset.repetir': 'Repetí la contraseña',
  'legal.contacto': 'Para cualquier consulta sobre pedidos, devoluciones o aclaraciones legales, escribinos a:',

  // ---- Panel ----
  'admin.loginError': 'No pudimos iniciar sesión. Revisá el email y la contraseña.',
  'admin.loginSub': 'Ingresá para administrar la tienda.',
  'admin.categoriaConProductos': 'Reasigná o eliminá primero los productos de esta categoría',
  'admin.fotosAyuda': 'Elegí una o varias fotos de la galería del teléfono.',
  'admin.papeleraAviso': 'Va a la papelera: lo podés recuperar desde el filtro "Papelera".',
  'admin.papeleraVacia': 'Los pedidos que borres van a parar acá y podés recuperarlos.',
  'admin.pedidosSinResultados': 'Probá con otro nombre, teléfono o número.',
  'admin.faltaCategoria': 'Elegí o creá una categoría.',
  'admin.visibleAyuda': 'Si lo apagás, el producto queda guardado pero oculto.',
  'admin.productosVacio': 'Tocá el botón + para agregar el primero.',
  'admin.productosAyuda': 'Tocá un producto para editarlo.',
  'admin.logoPesado': 'El logo pesa más de 1 MB. Probá con una versión más liviana.',
  'admin.logoError': 'No se pudo subir el logo. Probá de nuevo.',
  'admin.datosInvalidos': 'Revisá los datos: el WhatsApp va solo con números (con código de país).',
}

export type ClaveTexto = keyof typeof VOS

export const TU: Partial<Record<ClaveTexto, string>> = {
  'producto.elegirVariante': 'Elige {variante}',
  'producto.notaSinStock': 'Escríbenos por WhatsApp o Instagram para consultar disponibilidad.',
  'producto.notaCarrito': 'Agrégalo al carrito y completa el pedido desde el checkout.',
  'producto.notaMuestrario': 'Escríbenos por WhatsApp o Instagram para hacer tu pedido.',
  'carrito.siguientePaso': 'En el siguiente paso cargas tus datos y la entrega.',
  'checkout.revisar': 'Revisa el resumen y vuelve a confirmar.',
  'checkout.pagoCoordinar': 'Acuerdas el pago (efectivo, transferencia…) al confirmar el pedido.',
  'checkout.errorRegistrar': 'No pudimos registrar el pedido. Prueba de nuevo en un momento.',
  'checkout.errorPago':
    'Registramos tu pedido #{numero}, pero no pudimos abrir MercadoPago. Puedes reintentar el pago desde "Mis pedidos".',
  'exito.coordinar': 'Escríbenos por WhatsApp y coordinamos',
  'pago.errorAbrir': 'No pudimos abrir MercadoPago. Prueba de nuevo en un momento.',
  'pago.aprobado': 'Ya estamos preparando tu pedido. Puedes seguirlo desde "Mis pedidos".',
  'pago.rechazado': 'Tu pedido sigue reservado. Puedes intentar de nuevo con otro medio de pago.',
  'cuenta.introIngresar': 'Ingresa para ver tus pedidos y finalizar tu compra.',
  'cuenta.introRecuperar': 'Ingresa tu email y te enviamos un enlace para elegir una contraseña nueva.',
  'cuenta.avisoRecuperar':
    'Si ese email tiene una cuenta, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.',
  'cuenta.yaRegistrado': 'Ese email ya tiene una cuenta. Ingresa tu contraseña para entrar.',
  'cuenta.confirmarEmail':
    'Ya casi está: te enviamos un email para confirmar tu cuenta. Ábrelo y toca el enlace para poder ingresar. ¿No lo ves? Revisa también la carpeta de spam.',
  'reset.linkInvalido':
    'Este enlace de recuperación no es válido o ya venció. Pide uno nuevo desde "¿Olvidaste tu contraseña?" en la pantalla de ingreso.',
  'reset.intro': 'Elige tu nueva contraseña.',
  'reset.repetir': 'Repite la contraseña',
  'legal.contacto': 'Para cualquier consulta sobre pedidos, devoluciones o aclaraciones legales, escríbenos a:',
  'admin.loginError': 'No pudimos iniciar sesión. Revisa el email y la contraseña.',
  'admin.loginSub': 'Ingresa para administrar la tienda.',
  'admin.categoriaConProductos': 'Reasigna o elimina primero los productos de esta categoría',
  'admin.fotosAyuda': 'Elige una o varias fotos de la galería del teléfono.',
  'admin.papeleraAviso': 'Va a la papelera: puedes recuperarlo desde el filtro "Papelera".',
  'admin.papeleraVacia': 'Los pedidos que borres van a parar aquí y puedes recuperarlos.',
  'admin.pedidosSinResultados': 'Prueba con otro nombre, teléfono o número.',
  'admin.faltaCategoria': 'Elige o crea una categoría.',
  'admin.visibleAyuda': 'Si lo apagas, el producto queda guardado pero oculto.',
  'admin.productosVacio': 'Toca el botón + para agregar el primero.',
  'admin.productosAyuda': 'Toca un producto para editarlo.',
  'admin.logoPesado': 'El logo pesa más de 1 MB. Prueba con una versión más liviana.',
  'admin.logoError': 'No se pudo subir el logo. Prueba de nuevo.',
  'admin.datosInvalidos': 'Revisa los datos: el WhatsApp va solo con números (con código de país).',
}

/** Texto de la interfaz según el trato de la tienda y sus overrides. */
export function t(clave: ClaveTexto, vars: Record<string, string | number> = {}): string {
  const { idioma } = tienda()
  const texto = idioma.textos?.[clave] ?? (idioma.trato === 'tu' ? TU[clave] : undefined) ?? VOS[clave]
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
