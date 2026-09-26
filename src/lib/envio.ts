import { tienda } from '../tienda'

// Costo del envío que va a cobrar la base para este subtotal (misma regla que
// crear_pedido, migración 0016). null = "a coordinar" (no se cobra en la web).
// Es solo para mostrarlo antes de confirmar: el importe real lo calcula la base.
export function costoEnvio(subtotal: number, entrega: 'envio' | 'coordinar'): number | null {
  if (entrega !== 'envio') return 0
  const { costo, gratisDesde } = tienda().envio
  if (costo === null) return null
  if (gratisDesde !== null && subtotal >= gratisDesde) return 0
  return costo
}
