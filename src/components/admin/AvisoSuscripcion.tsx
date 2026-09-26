import { useState } from 'react'
import type { MiTienda } from '../../hooks/useMiTienda'
import { diasRestantes, precioPlan, waPlataforma } from '../../plataforma/formato'
import { irASuscribir } from '../../plataforma/suscripcion'

// Aviso arriba del panel sobre el estado comercial de la tienda: prueba
// gratis (días que quedan), pausada por falta de suscripción o suspendida.
// Con la suscripción activa no muestra nada.
export default function AvisoSuscripcion({ miTienda }: { miTienda: MiTienda | null }) {
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!miTienda || miTienda.suscripcion_estado === 'activa') return null

  async function suscribir() {
    setYendo(true)
    setError(await irASuscribir(miTienda!.id))
    setYendo(false)
  }

  if (miTienda.suspendida) {
    return (
      <div className="aviso-susc off">
        <strong>Tu tienda está suspendida.</strong>
        <span>Escribinos para reactivarla.</span>
        <a className="aviso-susc-btn" href={waPlataforma(`Hola! Mi tienda "${miTienda.nombre}" figura suspendida.`)} target="_blank" rel="noopener noreferrer">
          Escribir
        </a>
      </div>
    )
  }

  const dias = diasRestantes(miTienda.prueba_hasta)
  const pendiente = miTienda.suscripcion_estado === 'pendiente'
  return (
    <div className={dias > 0 ? 'aviso-susc' : 'aviso-susc off'}>
      <strong>
        {dias > 0
          ? `Prueba gratis: ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}`
          : 'Tu tienda está pausada: tus clientes no la ven.'}
      </strong>
      <span>
        {pendiente ? 'Estamos esperando la confirmación de MercadoPago.' : `Activá la suscripción (${precioPlan()}/mes) para que siga online.`}
      </span>
      <button type="button" className="aviso-susc-btn" onClick={suscribir} disabled={yendo}>
        {yendo ? 'Abriendo…' : pendiente ? 'Reintentar' : 'Activar'}
      </button>
      {error && <span className="aviso-susc-error">{error}</span>}
    </div>
  )
}
