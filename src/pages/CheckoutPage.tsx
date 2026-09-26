import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Logo from '../components/Logo'
import Scallop from '../components/Scallop'
import { useCart, nombreItem, type CartItem } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/format'
import { waPedidoConfirmadoLink, type DatosPedido } from '../lib/config'
import { costoEnvio } from '../lib/envio'
import { useTienda } from '../tienda'
import type { MetodoPago } from '../types'
import OrderSuccess from '../components/cart/OrderSuccess'
import '../styles/catalog.css'
import '../styles/cart.css'
import { t } from '../i18n/textos'
import { tienda } from '../tienda'

interface PedidoConfirmado {
  numero: number
  items: CartItem[]
  subtotal: number
  envio: number | null
  datos: DatosPedido
}


// Checkout como INVITADA (/checkout): datos de contacto y entrega, método de
// pago, revalidación de stock/precios contra la base y registro del pedido.
export default function CheckoutPage() {
  const { items, subtotal, reemplazar, vaciar } = useCart()
  const { session, perfil, loading: cargandoSesion } = useAuth()

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [entrega, setEntrega] = useState<'coordinar' | 'envio'>('coordinar')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [cp, setCp] = useState('')
  const [notas, setNotas] = useState('')
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('coordinar')
  const { features } = useTienda().config
  // Envío estimado para el resumen (el importe real lo calcula la base).
  const envio = costoEnvio(subtotal, entrega)

  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState<PedidoConfirmado | null>(null)

  // Prefill de nombre/teléfono con los datos de la cuenta (si están cargados).
  useEffect(() => {
    if (!perfil) return
    setNombre((n) => n || perfil.nombre || '')
    setTelefono((t) => t || perfil.telefono || '')
  }, [perfil])

  // Revalida el carrito contra la base: precios vigentes y stock disponible
  // (el de la variante, si la línea tiene una).
  async function revalidarCarrito(): Promise<{ corregidos: CartItem[]; cambios: string[] }> {
    const ids = [...new Set(items.map((i) => i.id))]
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, precio, stock, producto_variantes(id, nombre, stock)')
      .in('id', ids)
    if (error) throw new Error(error.message)

    type Fila = {
      id: string
      precio: number
      stock: number
      producto_variantes: { id: string; stock: number }[] | null
    }
    const porId = new Map(((data ?? []) as Fila[]).map((p) => [p.id, p]))
    const cambios: string[] = []
    const corregidos: CartItem[] = []

    for (const item of items) {
      const actual = porId.get(item.id)
      const nombre = nombreItem(item)
      const variantes = actual?.producto_variantes ?? []
      // Una línea sin variante de un producto que ahora tiene variantes ya no
      // se puede comprar así: hay que volver a elegir la opción en la ficha.
      if (actual && !item.variante_id && variantes.length > 0) {
        cambios.push(`"${nombre}" ahora tiene opciones: elegila de nuevo desde el producto.`)
        continue
      }
      const stock = item.variante_id
        ? variantes.find((v) => v.id === item.variante_id)?.stock ?? 0
        : actual?.stock ?? 0
      if (!actual || stock <= 0) {
        cambios.push(`"${nombre}" ya no está disponible y se quitó del carrito.`)
        continue
      }
      let cantidad = item.cantidad
      if (cantidad > stock) {
        cantidad = stock
        cambios.push(
          stock === 1
            ? `"${nombre}": queda 1 unidad (ajustamos la cantidad).`
            : `"${nombre}": quedan ${stock} unidades (ajustamos la cantidad).`,
        )
      }
      if (actual.precio !== item.precio) {
        cambios.push(`"${nombre}": el precio se actualizó a ${money(actual.precio)}.`)
      }
      corregidos.push({ ...item, precio: actual.precio, stock, cantidad })
    }
    return { corregidos, cambios }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)
    try {
      const { corregidos, cambios } = await revalidarCarrito()
      if (cambios.length > 0) {
        reemplazar(corregidos)
        setAviso(
          'Actualizamos tu carrito con los datos vigentes:\n• ' +
            cambios.join('\n• ') +
            '\n' + t('checkout.revisar'),
        )
        return
      }
      if (corregidos.length === 0) {
        setError('Tu carrito quedó vacío.')
        return
      }

      const datos: DatosPedido = {
        nombre,
        entrega,
        direccion: entrega === 'envio' ? direccion : undefined,
        localidad: entrega === 'envio' ? localidad : undefined,
        cp: entrega === 'envio' ? cp : undefined,
        notas: notas || undefined,
      }
      const subtotalFinal = corregidos.reduce((n, i) => n + i.precio * i.cantidad, 0)
      // Usamos la función crear_pedido (SECURITY DEFINER): registra el pedido y
      // nos devuelve el número de orden, sin exponer la lectura de pedidos.
      const { data: numero, error } = await supabase.rpc('crear_pedido', {
        p_nombre: nombre,
        p_telefono: telefono,
        p_email: email || null,
        p_entrega: entrega,
        p_direccion: datos.direccion ?? null,
        p_localidad: datos.localidad ?? null,
        p_cp: datos.cp ?? null,
        p_notas: datos.notas ?? null,
        p_items: corregidos.map((i) => ({
          id: i.id,
          variante_id: i.variante_id ?? null,
          cantidad: i.cantidad,
        })),
        p_subtotal: subtotalFinal,
        p_metodo_pago: metodoPago,
        p_tienda: tienda().id,
      })
      if (error) throw new Error(error.message)

      if (metodoPago === 'mercadopago') {
        // El pedido ya está registrado (y el stock reservado): pedimos el link
        // de pago a la Edge Function y vamos a MercadoPago. Al volver, la
        // página /pago/resultado muestra cómo quedó.
        vaciar()
        const { data, error: errPago } = await supabase.functions.invoke('crear-preferencia-mp', {
          body: { numero },
        })
        if (errPago || !data?.url) {
          setError(t('checkout.errorPago', { numero: numero as number }))
          return
        }
        window.location.href = data.url as string
        return
      }

      setConfirmado({
        numero: numero as number,
        items: corregidos,
        subtotal: subtotalFinal,
        envio: costoEnvio(subtotalFinal, entrega),
        datos,
      })
      vaciar()
    } catch (err) {
      // crear_pedido devuelve mensajes ya redactados para la clienta (falta de
      // stock, carrito vacío…), así que los mostramos tal cual.
      setError(
        err instanceof Error
          ? err.message
          : t('checkout.errorRegistrar'),
      )
    } finally {
      setEnviando(false)
    }
  }

  // Para comprar hay que estar logueada: si no, va a /cuenta y vuelve al checkout.
  if (cargandoSesion) return null
  if (!session) return <Navigate to="/cuenta?next=/checkout" replace />

  return (
    <div className="catalog-root">
      <header className="cart-header">
        <Link to="/">
          <Logo />
        </Link>
      </header>
      <Scallop />

      <main className="checkout">
        {confirmado ? null : items.length === 0 ? (
          <div className="no-results">
            Tu carrito está vacío.
            <br />
            <Link className="pp-back" to="/">
              ← Volver a la tienda
            </Link>
          </div>
        ) : (
          <>
            <h1 className="cart-title">Finalizar compra</h1>

            <div className="checkout-grid">
              {/* ---------- Columna formulario ---------- */}
              <form onSubmit={onSubmit} className="checkout-col-form checkout-form">
                <section className="checkout-card">
                  <h2 className="checkout-h">
                    <span className="paso">1</span> Tus datos
                  </h2>
                  <div className="field">
                    <label>Nombre y apellido</label>
                    <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Ana Pérez" />
                  </div>
                  <div className="field">
                    <label>Teléfono (WhatsApp)</label>
                    <input type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 3541 123456" />
                  </div>
                  <div className="field">
                    <label>Email (opcional)</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
                  </div>
                </section>

                <section className="checkout-card">
                  <h2 className="checkout-h">
                    <span className="paso">2</span> Entrega
                  </h2>
                  <div className="entrega-opciones">
                    <label className={entrega === 'coordinar' ? 'entrega-op active' : 'entrega-op'}>
                      <input type="radio" name="entrega" checked={entrega === 'coordinar'} onChange={() => setEntrega('coordinar')} />
                      Retiro / a coordinar
                    </label>
                    <label className={entrega === 'envio' ? 'entrega-op active' : 'entrega-op'}>
                      <input type="radio" name="entrega" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} />
                      Envío a domicilio
                    </label>
                  </div>

                  {entrega === 'envio' && (
                    <div className="entrega-datos">
                      <div className="field">
                        <label>Dirección</label>
                        <input type="text" required value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle y número" />
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Localidad</label>
                          <input type="text" required value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Ciudad" />
                        </div>
                        <div className="field">
                          <label>Código postal</label>
                          <input type="text" required value={cp} onChange={(e) => setCp(e.target.value)} placeholder="CP" />
                        </div>
                      </div>
                      <p className="cart-note">
                        {envio === null
                          ? 'El costo del envío se coordina al confirmar el pedido.'
                          : envio === 0
                            ? '¡El envío es gratis!'
                            : `Envío a domicilio: ${money(envio)}.`}
                      </p>
                    </div>
                  )}
                </section>

                <section className="checkout-card">
                  <h2 className="checkout-h">
                    <span className="paso">3</span> Pago
                  </h2>
                  <div className="pago-opciones">
                    <label className={metodoPago === 'coordinar' ? 'pago-op active' : 'pago-op'}>
                      <input type="radio" name="pago" checked={metodoPago === 'coordinar'} onChange={() => setMetodoPago('coordinar')} />
                      <div className="pago-txt">
                        <strong>Coordinar por WhatsApp</strong>
                        <span>{t('checkout.pagoCoordinar')}</span>
                      </div>
                    </label>
                    {features.mercadoPago && (
                      <label className={metodoPago === 'mercadopago' ? 'pago-op active' : 'pago-op'}>
                        <input
                          type="radio"
                          name="pago"
                          checked={metodoPago === 'mercadopago'}
                          onChange={() => setMetodoPago('mercadopago')}
                        />
                        <div className="pago-txt">
                          <strong>Pagar online</strong>
                          <span>Con MercadoPago: tarjeta, débito o dinero en cuenta.</span>
                        </div>
                      </label>
                    )}
                  </div>
                </section>

                <div className="field">
                  <label>Notas (opcional)</label>
                  <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Aclaraciones, horarios, etc." />
                </div>

                {aviso && <p className="checkout-aviso">{aviso}</p>}
                {error && <p className="form-error">{error}</p>}

                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? 'Registrando…' : 'Confirmar pedido'}
                </button>
                <Link className="pp-back" to="/carrito">
                  ← Volver al carrito
                </Link>
              </form>

              {/* ---------- Columna resumen ---------- */}
              <aside className="checkout-col-summary">
                <div className="checkout-card summary-card">
                  <h2 className="checkout-h">Tu pedido</h2>
                  <div className="summary-items">
                    {items.map((i) => (
                      <div className="summary-item" key={i.clave}>
                        <div className="summary-thumb">
                          <img src={i.imagen} alt={nombreItem(i)} />
                          <span className="summary-qty">{i.cantidad}</span>
                        </div>
                        <span className="summary-name">{nombreItem(i)}</span>
                        <span className="summary-total">{money(i.precio * i.cantidad)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="summary-linea">
                    <span>Subtotal</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  <div className={envio ? 'summary-linea' : 'summary-linea muted'}>
                    <span>Envío</span>
                    <span>
                      {entrega !== 'envio' ? '—' : envio === null ? 'a coordinar' : envio === 0 ? 'gratis' : money(envio)}
                    </span>
                  </div>
                  <div className="summary-linea total">
                    <span>Total</span>
                    <strong>{money(subtotal + (envio ?? 0))}</strong>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      {/* Modal de éxito */}
      {confirmado && (
        <OrderSuccess
          items={confirmado.items}
          subtotal={confirmado.subtotal + (confirmado.envio ?? 0)}
          entrega={confirmado.datos.entrega}
          waHref={waPedidoConfirmadoLink(
            confirmado.numero,
            confirmado.items,
            confirmado.subtotal,
            confirmado.datos,
            confirmado.envio,
          )}
        />
      )}
    </div>
  )
}
