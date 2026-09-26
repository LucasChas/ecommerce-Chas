import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ProductoConCategoria, Variante } from '../types'
import { portadaDe } from '../lib/images'

// Un ítem del carrito guarda una "foto" de los datos del producto al momento de
// agregarlo (así el carrito no se rompe si el producto cambia). El precio y el
// stock se revalidan más adelante, en el checkout.
export interface CartItem {
  // Identifica la línea del carrito: producto + variante. La misma remera en
  // talle S y en talle M son dos líneas distintas.
  clave: string
  id: string
  nombre: string
  precio: number
  imagen: string
  stock: number
  cantidad: number
  // Slug del producto al momento de agregarlo (ver migración 0011), para armar
  // el link a /producto/:param. Puede venir null/undefined en carritos viejos
  // guardados en localStorage antes de este cambio; el link cae al id.
  slug?: string | null
  // Variante elegida (si el producto tiene). "stock" es el de la variante.
  variante_id?: string | null
  variante?: string | null
}

// Nombre para mostrar de una línea: incluye la variante (ej. "Remera — M").
export function nombreItem(i: Pick<CartItem, 'nombre' | 'variante'>): string {
  return i.variante ? `${i.nombre} — ${i.variante}` : i.nombre
}

// Clave de línea del carrito (ver CartItem.clave).
export function claveItem(id: string, varianteId?: string | null): string {
  return varianteId ? `${id}:${varianteId}` : id
}

interface CartContextValue {
  items: CartItem[]
  cantidadTotal: number
  subtotal: number
  agregar: (producto: ProductoConCategoria, cantidad?: number, variante?: Variante | null) => void
  // setCantidad y quitar reciben la CLAVE de la línea (CartItem.clave).
  setCantidad: (clave: string, cantidad: number) => void
  quitar: (clave: string) => void
  vaciar: () => void
  // Reemplaza el contenido completo (lo usa el checkout al revalidar contra la base).
  reemplazar: (items: CartItem[]) => void
  // Estado del carrito lateral (drawer).
  drawerAbierto: boolean
  abrirDrawer: () => void
  cerrarDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'tienda_cart_v1'

function leerStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const items = raw ? (JSON.parse(raw) as CartItem[]) : []
    // Carritos guardados antes de las variantes no tienen "clave".
    return items.map((i) => ({ ...i, clave: i.clave ?? claveItem(i.id, i.variante_id) }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(leerStorage)
  const [drawerAbierto, setDrawerAbierto] = useState(false)

  // Persistimos el carrito en localStorage ante cualquier cambio.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const agregar = useCallback(
    (producto: ProductoConCategoria, cantidad = 1, variante: Variante | null = null) => {
    const clave = claveItem(producto.id, variante?.id)
    // No dejamos superar el stock conocido (el de la variante si la hay).
    const tope = variante ? variante.stock : producto.stock
    setItems((prev) => {
      const existente = prev.find((i) => i.clave === clave)
      if (existente) {
        return prev.map((i) =>
          i.clave === clave ? { ...i, cantidad: Math.min(i.cantidad + cantidad, tope) } : i,
        )
      }
      return [
        ...prev,
        {
          clave,
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          imagen: portadaDe(producto),
          stock: tope,
          cantidad: Math.min(cantidad, tope),
          slug: producto.slug,
          variante_id: variante?.id ?? null,
          variante: variante?.nombre ?? null,
        },
      ]
    })
    // Feedback inmediato: abrimos el carrito lateral al agregar.
    setDrawerAbierto(true)
  }, [])

  const setCantidad = useCallback((clave: string, cantidad: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.clave === clave ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.stock)) } : i,
      ),
    )
  }, [])

  const quitar = useCallback((clave: string) => {
    setItems((prev) => prev.filter((i) => i.clave !== clave))
  }, [])

  const vaciar = useCallback(() => setItems([]), [])

  const reemplazar = useCallback((nuevos: CartItem[]) => setItems(nuevos), [])

  const cantidadTotal = useMemo(() => items.reduce((n, i) => n + i.cantidad, 0), [items])
  const subtotal = useMemo(
    () => items.reduce((n, i) => n + i.precio * i.cantidad, 0),
    [items],
  )

  const value: CartContextValue = {
    items,
    cantidadTotal,
    subtotal,
    agregar,
    setCantidad,
    quitar,
    vaciar,
    reemplazar,
    drawerAbierto,
    abrirDrawer: () => setDrawerAbierto(true),
    cerrarDrawer: () => setDrawerAbierto(false),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// Hook para consumir el carrito desde cualquier componente.
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return ctx
}
