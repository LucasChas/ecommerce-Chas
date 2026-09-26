import type { ProductoConCategoria } from '../types'
import { money } from './format'
import { tienda, textoTienda } from '../tienda'

// ============================================================================
// Links de contacto (WhatsApp + Instagram).
// El número, el usuario y los textos de los mensajes salen de la config de la
// tienda (tienda/tienda.config.mjs o la pestaña "Mi tienda" del admin).
// ============================================================================

const whatsapp = () => tienda().contacto.whatsapp
const instagram = () => tienda().contacto.instagram

// Link de WhatsApp (wa.me) con el mensaje de consulta por un producto.
export function waLink(producto: ProductoConCategoria): string {
  const msg = textoTienda(
    producto.stock > 0 ? 'whatsappConsulta' : 'whatsappConsultaSinStock',
    { producto: producto.nombre },
  )
  return `https://wa.me/${whatsapp()}?text=${encodeURIComponent(msg)}`
}

// Ítem mínimo para armar el mensaje de pedido.
interface ItemPedido {
  nombre: string
  precio: number
  cantidad: number
}

// Datos del checkout que van en el mensaje del pedido confirmado.
export interface DatosPedido {
  nombre: string
  entrega: 'envio' | 'coordinar'
  direccion?: string
  localidad?: string
  cp?: string
  notas?: string
}

// Link de WhatsApp para un pedido YA REGISTRADO en la base (checkout):
// incluye el número de orden, el detalle y los datos de entrega.
export function waPedidoConfirmadoLink(
  numero: number,
  items: ItemPedido[],
  subtotal: number,
  datos: DatosPedido,
): string {
  const lineas = items
    .map((i) => `• ${i.cantidad}x ${i.nombre} — ${money(i.precio * i.cantidad)}`)
    .join('\n')
  const entrega =
    datos.entrega === 'envio'
      ? `Envío a domicilio: ${datos.direccion ?? ''}, ${datos.localidad ?? ''} (CP ${datos.cp ?? ''})`
      : 'Entrega: a coordinar / retiro'
  const partes = [
    textoTienda('whatsappPedido', { nombre: datos.nombre, numero }),
    lineas,
    `Subtotal: ${money(subtotal)}`,
    entrega,
  ]
  if (datos.notas) partes.push(`Notas: ${datos.notas}`)
  return `https://wa.me/${whatsapp()}?text=${encodeURIComponent(partes.join('\n\n'))}`
}

// Link de WhatsApp para preguntar por qué se canceló un pedido. Lo usa el
// cliente desde "Mis pedidos": es su única vía para entender qué pasó.
export function waConsultaCancelacionLink(numero: number): string {
  const msg = textoTienda('whatsappCancelacion', { numero })
  return `https://wa.me/${whatsapp()}?text=${encodeURIComponent(msg)}`
}

// Link de WhatsApp desde el admin hacia el teléfono de un cliente. Si el
// número se cargó sin código de país, se le antepone el prefijo de la región.
export function waAClienteLink(telefono: string, numero: number): string {
  const { codigoPais, prefijoWhatsapp } = tienda().region
  let d = telefono.replace(/\D/g, '')
  if (d.startsWith('0')) d = d.slice(1)
  if (!d.startsWith(codigoPais)) d = prefijoWhatsapp + d
  const msg = textoTienda('whatsappAdminACliente', { numero })
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`
}

// ¿Está configurado Instagram? (para mostrar u ocultar el botón)
export function instagramHabilitado(): boolean {
  return instagram() !== ''
}

// Link de perfil de Instagram (para contacto general, ej. en el footer).
export function instagramPerfilLink(): string {
  return `https://instagram.com/${instagram()}`
}

// Link de WhatsApp genérico (sin producto), para contacto general en el footer.
export function waPerfilLink(): string {
  return `https://wa.me/${whatsapp()}`
}

// Link de mensaje directo (DM) de Instagram. ig.me/m abre el chat con la marca,
// análogo a wa.me. Instagram no permite prellenar el texto, así que el mensaje
// lo escribe la clienta (a diferencia de WhatsApp).
export function instagramDmLink(): string {
  return `https://ig.me/m/${instagram()}`
}
