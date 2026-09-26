import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { ProductoConCategoria } from '../types'
import { SELECT_PRODUCTO, aplanarProducto } from '../lib/productos'

// Trae los productos con el nombre de su categoría resuelto y se mantiene
// actualizado en tiempo real: cualquier alta/edición/baja de producto o
// categoría (hecha desde el admin) vuelve a pedir la lista y refresca la vista.
//
// Optar por "re-fetch ante cualquier cambio" (en vez de parchear el estado
// evento por evento) mantiene el código simple y garantiza consistencia,
// incluso cuando se renombra una categoría (que afecta al join).
export function useProducts() {
  const [productos, setProductos] = useState<ProductoConCategoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProductos = useCallback(async () => {
    const { data, error } = await supabase
      .from('productos')
      .select(SELECT_PRODUCTO)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setProductos((data ?? []).map(aplanarProducto))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProductos()

    // Suscripción Realtime a ambas tablas.
    const canal = supabase
      .channel('catalogo-productos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        fetchProductos,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categorias' },
        fetchProductos,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'producto_variantes' },
        fetchProductos,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [fetchProductos])

  return { productos, loading, error, refetch: fetchProductos }
}
