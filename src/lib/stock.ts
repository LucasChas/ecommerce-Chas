import { tienda } from '../tienda'

// Mensaje de stock bajo para mostrar en la card / detalle (o null si no aplica).
// Solo tiene sentido cuando hay stock (> 0).
export function avisoStockBajo(stock: number): string | null {
  if (stock <= 0) return null
  if (stock === 1) return '¡Último disponible!'
  if (stock <= tienda().catalogo.stockBajo) return `¡Últimas ${stock} unidades!`
  return null
}
