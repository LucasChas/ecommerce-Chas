import type { Producto } from '../types'

// Placeholder cuando un producto no tiene ninguna imagen cargada: un SVG
// neutro embebido (sin depender de servicios externos ni de la marca).
export const IMG_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' +
      '<rect width="600" height="600" fill="#ECE7DD"/>' +
      '<g fill="none" stroke="#B5AB98" stroke-width="14" stroke-linejoin="round">' +
      '<rect x="190" y="210" width="220" height="180" rx="18"/>' +
      '<circle cx="255" cy="270" r="22"/>' +
      '<path d="M200 380l70-70 50 50 40-40 50 50"/></g></svg>',
  )

// Devuelve la galería de imágenes de un producto, con compatibilidad hacia atrás:
// usa la columna nueva "imagenes" y, si está vacía (o no corriste la migración
// 0002 todavía), cae a "imagen_url". Nunca devuelve un array vacío para la UI.
export function imagenesDe(producto: Pick<Producto, 'imagenes' | 'imagen_url'>): string[] {
  const galeria = (producto.imagenes ?? []).filter(Boolean)
  if (galeria.length > 0) return galeria
  if (producto.imagen_url) return [producto.imagen_url]
  return [IMG_PLACEHOLDER]
}

// Imagen de portada (la que va en la grilla del catálogo).
export function portadaDe(producto: Pick<Producto, 'imagenes' | 'imagen_url'>): string {
  return imagenesDe(producto)[0]
}
