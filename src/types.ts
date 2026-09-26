// Tipos que reflejan las tablas de Supabase (ver supabase/migrations/0001_init.sql).

export interface Categoria {
  id: string
  nombre: string
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  categoria_id: string | null
  descripcion: string | null
  precio: number
  stock: number
  imagen_url: string | null
  // Slug único generado por la base (ver migración 0011). Puede venir null
  // hasta que esa migración corra en el ambiente.
  slug: string | null
  // Galería de imágenes (columna "imagenes text[]", ver migración 0002).
  // Puede venir undefined si todavía no corriste esa migración.
  imagenes?: string[] | null
  // Rubros (migración 0015). Opcionales para convivir con bases sin migrar.
  activo?: boolean
  orden?: number
  // Datos propios del rubro: { clave: valor } según catalogo.atributos de la config.
  atributos?: Record<string, string> | null
  created_at: string
  updated_at: string
}

// Opción de un producto con stock propio (Talle, Color...). Si un producto
// tiene variantes, su "stock" es la suma de las variantes (lo mantiene la base).
export interface Variante {
  id: string
  producto_id: string
  nombre: string
  stock: number
  orden: number
}

// Producto ya "aplanado" con el nombre de su categoría resuelto,
// que es lo que consumen las vistas (para filtrar y mostrar).
export interface ProductoConCategoria extends Producto {
  categoria_nombre: string | null
  // Ordenadas por "orden". Vacío = producto sin variantes.
  variantes: Variante[]
}

// ---- Cuentas de clientas (ver migración 0005) ----
export interface Perfil {
  id: string
  nombre: string | null
  telefono: string | null
  rol: 'cliente' | 'admin'
  created_at: string
}

// ---- Pedidos (ver migraciones 0003 / 0005) ----
export type EstadoPedido = 'nuevo' | 'confirmado' | 'entregado' | 'cancelado'

export type OrigenPedido = 'checkout' | 'admin'

export interface PedidoItem {
  id: string
  // Incluye la variante si la tiene (ej. "Remera — M"), lo arma la base.
  nombre: string
  precio: number
  cantidad: number
  variante_id?: string | null
  variante?: string | null
}

export type MetodoPago = 'coordinar' | 'mercadopago'
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado'

export interface Pedido {
  id: string
  numero: number
  nombre: string
  telefono: string
  email: string | null
  entrega: 'envio' | 'coordinar'
  direccion: string | null
  localidad: string | null
  cp: string | null
  notas: string | null
  items: PedidoItem[]
  subtotal: number
  // Envío y total los calcula la base (migración 0016). Opcionales para
  // convivir con bases sin migrar: el front usa subtotal si falta total.
  envio?: number
  total?: number
  metodo_pago?: MetodoPago
  pago_estado?: EstadoPago
  estado: EstadoPedido
  origen: OrigenPedido
  created_at: string
  // Papelera: si tiene fecha, la admin lo mandó a la papelera (ver migración 0009).
  eliminado_at: string | null
}
