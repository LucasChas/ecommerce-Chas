import plataforma from '../../plataforma/plataforma.config.mjs'

// Precio del plan con la moneda de la plataforma (no la de las tiendas).
export function precioPlan(): string {
  return plataforma.plan.precioMensual.toLocaleString('es-AR', {
    style: 'currency',
    currency: plataforma.plan.moneda,
    maximumFractionDigits: 0,
  })
}

// Link de WhatsApp de la plataforma con un mensaje prellenado.
export function waPlataforma(mensaje: string): string {
  return `https://wa.me/${plataforma.contacto.whatsapp}?text=${encodeURIComponent(mensaje)}`
}

// Días que le quedan a una prueba gratis (0 si venció).
export function diasRestantes(hasta: string): number {
  return Math.max(0, Math.ceil((new Date(hasta).getTime() - Date.now()) / 86_400_000))
}
