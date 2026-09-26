import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabaseClient'
import CabeceraPlataforma from './CabeceraPlataforma'
import { diasRestantes, precioPlan } from './formato'
import { irASuscribir } from './suscripcion'

interface FilaTienda {
  id: string
  slug: string
  nombre: string
  email_admin: string
  suspendida: boolean
  prueba_hasta: string
  suscripcion_estado: 'sin_suscripcion' | 'pendiente' | 'activa' | 'pausada' | 'cancelada'
  mp_conectado: boolean
  created_at: string
}

// Estado comercial de una tienda, en palabras.
function estadoDe(t: FilaTienda): { texto: string; clase: 'ok' | 'aviso' | 'off' } {
  if (t.suspendida) return { texto: 'Suspendida', clase: 'off' }
  if (t.suscripcion_estado === 'activa') return { texto: 'Suscripción activa', clase: 'ok' }
  const dias = diasRestantes(t.prueba_hasta)
  if (dias > 0) return { texto: `Prueba gratis · ${dias} ${dias === 1 ? 'día' : 'días'}`, clase: 'aviso' }
  return { texto: 'Pausada: activá la suscripción', clase: 'off' }
}

// "Mis tiendas": las tiendas de la cuenta, su estado y accesos. Para el admin
// de la plataforma lista TODAS (RLS lo permite) y puede suspender/reactivar.
export default function Panel() {
  const { session, loading, salir, esAdminPlataforma } = useAuth()
  const { confirmar, avisar } = useDialog()
  const [tiendas, setTiendas] = useState<FilaTienda[] | null>(null)
  const [suscribiendo, setSuscribiendo] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('tiendas')
      .select('id, slug, nombre, email_admin, suspendida, prueba_hasta, suscripcion_estado, mp_conectado, created_at')
      .order('created_at', { ascending: false })
    setTiendas((data as FilaTienda[]) ?? [])
  }, [])

  useEffect(() => {
    if (session) cargar()
  }, [session, cargar])

  if (loading) return null
  if (!session) return <Navigate to="/ingresar" replace />

  async function suscribir(t: FilaTienda) {
    setSuscribiendo(t.id)
    const error = await irASuscribir(t.id)
    setSuscribiendo(null)
    if (error) await avisar({ titulo: 'No se pudo abrir MercadoPago', mensaje: error })
  }

  async function alternarSuspension(t: FilaTienda) {
    const ok = await confirmar({
      titulo: t.suspendida ? `¿Reactivar "${t.nombre}"?` : `¿Suspender "${t.nombre}"?`,
      mensaje: t.suspendida ? 'La tienda vuelve a estar visible.' : 'La vitrina se pausa; los datos no se borran.',
      textoOk: t.suspendida ? 'Reactivar' : 'Suspender',
      peligro: !t.suspendida,
    })
    if (!ok) return
    const { error } = await supabase.from('tiendas').update({ suspendida: !t.suspendida }).eq('id', t.id)
    if (error) await avisar({ titulo: 'No se pudo cambiar', mensaje: error.message })
    cargar()
  }

  return (
    <div className="plat">
      <CabeceraPlataforma simple />
      <main className="plat-panel">
        <div className="plat-panel-head">
          <div>
            <h1>{esAdminPlataforma ? 'Tiendas de la plataforma' : 'Mis tiendas'}</h1>
            <p className="plat-sub">{session.user.email}</p>
          </div>
          <button type="button" className="plat-link" onClick={() => salir()}>
            Salir
          </button>
        </div>

        {tiendas === null ? (
          <p className="plat-sub">Cargando…</p>
        ) : tiendas.length === 0 ? (
          <div className="plat-card">
            <h2>Todavía no tenés una tienda</h2>
            <p className="plat-sub">Creala en unos minutos y probala gratis {plataforma.plan.diasPrueba} días.</p>
            <Link className="btn btn-primary" to="/crear">
              Crear mi tienda
            </Link>
          </div>
        ) : (
          <div className="plat-tiendas">
            {tiendas.map((t) => {
              const estado = estadoDe(t)
              const puedeSuscribir = t.suscripcion_estado !== 'activa' && !t.suspendida
              return (
                <div className="plat-tienda" key={t.id}>
                  <div className="plat-tienda-top">
                    <div>
                      <h2>{t.nombre}</h2>
                      <a className="plat-sub" href={`/t/${t.slug}`}>
                        /t/{t.slug}
                      </a>
                      {esAdminPlataforma && <p className="field-hint">{t.email_admin}</p>}
                    </div>
                    <span className={`plat-estado ${estado.clase}`}>{estado.texto}</span>
                  </div>
                  {!t.mp_conectado && (
                    <p className="field-hint">Todavía no conectó MercadoPago (se cobra coordinando por WhatsApp).</p>
                  )}
                  <div className="plat-acciones">
                    <a className="btn btn-primary" href={`/t/${t.slug}/admin`}>
                      Administrar
                    </a>
                    <a className="btn btn-ghost" href={`/t/${t.slug}`}>
                      Ver tienda
                    </a>
                    {puedeSuscribir && (
                      <button type="button" className="btn btn-ghost" onClick={() => suscribir(t)} disabled={suscribiendo === t.id}>
                        {suscribiendo === t.id ? 'Abriendo…' : `Suscribirme · ${precioPlan()}/mes`}
                      </button>
                    )}
                    {esAdminPlataforma && (
                      <button type="button" className="btn-danger-text" onClick={() => alternarSuspension(t)}>
                        {t.suspendida ? 'Reactivar' : 'Suspender'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <Link className="plat-link" to="/crear">
              + Crear otra tienda
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
