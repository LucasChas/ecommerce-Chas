import { supabase } from '../lib/supabaseClient'

// Pide a la Edge Function crear-suscripcion el link de MercadoPago para
// suscribir una tienda al plan mensual, y redirige. Devuelve un error si falla.
export async function irASuscribir(tiendaId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('crear-suscripcion', { body: { tienda_id: tiendaId } })
  if (error || !data?.url) {
    const detalle = (await (error as { context?: Response })?.context?.json?.().catch(() => null))?.error
    return detalle || 'No pudimos abrir MercadoPago. Probá de nuevo en un momento.'
  }
  window.location.href = data.url as string
  return null
}
