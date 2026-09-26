import type { ProductoConCategoria, Variante } from '../types'

// Columnas que pide el front para un producto: con el nombre de su categoría
// y sus variantes (migración 0015).
export const SELECT_PRODUCTO = '*, categorias(nombre), producto_variantes(*)'

// Aplana una fila de SELECT_PRODUCTO: categorias.nombre -> categoria_nombre y
// producto_variantes -> variantes (ordenadas).
export function aplanarProducto(row: unknown): ProductoConCategoria {
  const { categorias, producto_variantes, ...resto } = row as Record<string, unknown> & {
    categorias: { nombre: string } | null
    producto_variantes: Variante[] | null
  }
  return {
    ...(resto as unknown as ProductoConCategoria),
    categoria_nombre: categorias?.nombre ?? null,
    variantes: [...(producto_variantes ?? [])].sort(
      (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre),
    ),
  }
}
