import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { tienda } from '../tienda'

// Datos privados de la tienda actual (fila de "tiendas"): estado de la prueba
// y la suscripción, conexión de MercadoPago y datos de alta. Solo los puede
// leer quien administra la tienda (RLS).
export interface MiTienda {
  id: string
  slug: string
  nombre: string
  email_admin: string
  telefono: string | null
  direccion: string | null
  localidad: string | null
  suspendida: boolean
  prueba_hasta: string
  suscripcion_estado: 'sin_suscripcion' | 'pendiente' | 'activa' | 'pausada' | 'cancelada'
  mp_conectado: boolean
}

// usuarioId: se vuelve a leer al iniciar/cerrar sesión (RLS depende de quién mira).
export function useMiTienda(usuarioId: string | undefined) {
  const [miTienda, setMiTienda] = useState<MiTienda | null>(null)

  const recargar = useCallback(async () => {
    if (!usuarioId) {
      setMiTienda(null)
      return
    }
    const { data } = await supabase
      .from('tiendas')
      .select(
        'id, slug, nombre, email_admin, telefono, direccion, localidad, suspendida, prueba_hasta, suscripcion_estado, mp_conectado',
      )
      .eq('id', tienda().id)
      .maybeSingle()
    setMiTienda(data as MiTienda | null)
  }, [usuarioId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { miTienda, recargar }
}
