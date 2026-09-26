import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import Scallop from '../components/Scallop'
import HeaderActions from '../components/account/HeaderActions'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/format'
import { irAPagar } from '../lib/pagos'
import type { Pedido } from '../types'
import '../styles/catalog.css'
import '../styles/cart.css'
import { t } from '../i18n/textos'

// Vuelta desde MercadoPago (/pago/resultado?numero=N). No confiamos en los
// parámetros que agrega MP a la URL: mostramos pedidos.pago_estado, que solo
// actualiza el webhook después de consultar la API de MP. Como el webhook
// puede tardar unos segundos, escuchamos el pedido en tiempo real.
export default function PaymentResultPage() {
  const [params] = useSearchParams()
  const numero = Number(params.get('numero'))
  const { session, loading } = useAuth()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintentando, setReintentando] = useState(false)

  useEffect(() => {
    if (!session || !numero) return
    let vivo = true
    const leer = () =>
      supabase
        .from('pedidos')
        .select('*')
        .eq('numero', numero)
        .maybeSingle()
        .then(({ data }) => {
          if (!vivo) return
          setPedido(data as Pedido | null)
          setCargando(false)
        })
    leer()
    const canal = supabase
      .channel(`pago-${numero}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `numero=eq.${numero}` }, leer)
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(canal)
    }
  }, [session, numero])

  async function reintentar() {
    setReintentando(true)
    setError(await irAPagar(numero))
    setReintentando(false)
  }

  if (loading) return null
  if (!session) return <Navigate to={`/cuenta?next=${encodeURIComponent(`/pago/resultado?numero=${numero}`)}`} replace />

  const estado = pedido?.pago_estado ?? 'pendiente'
  const total = pedido ? pedido.total ?? pedido.subtotal : 0

  return (
    <div className="catalog-root">
      <header className="cart-header">
        <Logo />
        <HeaderActions />
      </header>
      <Scallop />

      <main className="legal-page pago-resultado">
        {cargando ? (
          <p className="pago-estado-txt">Buscando tu pedido…</p>
        ) : !pedido ? (
          <p className="pago-estado-txt">No encontramos ese pedido en tu cuenta.</p>
        ) : (
          <div className={`legal-card pago-card pago-${estado}`}>
            <div className="pago-icono" aria-hidden="true">
              {estado === 'aprobado' ? '✓' : estado === 'rechazado' ? '✕' : '…'}
            </div>
            <h1 className="cart-title">
              {estado === 'aprobado'
                ? '¡Pago aprobado!'
                : estado === 'rechazado'
                  ? 'El pago no se pudo completar'
                  : estado === 'reembolsado'
                    ? 'Pago reembolsado'
                    : 'Estamos confirmando tu pago'}
            </h1>
            <p className="pago-estado-txt">
              Pedido #{pedido.numero} · {money(total)}
            </p>
            <p className="pago-estado-txt">
              {estado === 'aprobado'
                ? t('pago.aprobado')
                : estado === 'rechazado'
                  ? t('pago.rechazado')
                  : estado === 'reembolsado'
                    ? 'Se devolvió el dinero de este pedido.'
                    : 'MercadoPago puede tardar unos segundos en avisarnos. Esta pantalla se actualiza sola.'}
            </p>

            {error && <p className="form-error">{error}</p>}

            <div className="pago-acciones">
              {(estado === 'rechazado' || estado === 'pendiente') && pedido.estado !== 'cancelado' && (
                <button type="button" className="btn btn-primary" onClick={reintentar} disabled={reintentando}>
                  {reintentando ? 'Abriendo MercadoPago…' : estado === 'rechazado' ? 'Reintentar el pago' : 'Volver a MercadoPago'}
                </button>
              )}
              <Link className="pp-back" to="/mis-pedidos">
                Ver mis pedidos
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
