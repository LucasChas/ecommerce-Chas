import { supabase } from './supabaseClient'
import type { EstadoPago } from '../types'
import { t } from '../i18n/textos'

// Pide a la Edge Function crear-preferencia-mp el link de pago de un pedido
// propio y redirige a MercadoPago. Devuelve un mensaje de error si falla.
export async function irAPagar(numero: number): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('crear-preferencia-mp', { body: { numero } })
  if (error || !data?.url) {
    // La función responde { error } con un texto para mostrar.
    const detalle = (await (error as { context?: Response })?.context?.json?.().catch(() => null))?.error
    return detalle || t('pago.errorAbrir')
  }
  window.location.href = data.url as string
  return null
}

export const TEXTO_PAGO: Record<EstadoPago, string> = {
  pendiente: 'Pago pendiente',
  aprobado: 'Pagado',
  rechazado: 'Pago rechazado',
  reembolsado: 'Reembolsado',
}
