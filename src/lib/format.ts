import { tienda } from '../tienda'

// Formatea un número como precio en la moneda y el locale de la tienda
// (tienda.config.mjs → region).
export function money(n: number): string {
  const { locale, moneda, decimales } = tienda().region
  return n.toLocaleString(locale, {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
