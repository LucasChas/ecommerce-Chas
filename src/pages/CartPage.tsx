import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import Scallop from '../components/Scallop'
import HeaderActions from '../components/account/HeaderActions'
import { useCart, nombreItem } from '../context/CartContext'
import { money } from '../lib/format'
import '../styles/catalog.css'
import '../styles/cart.css'
import { t } from '../i18n/textos'

// Página del carrito (/carrito): lista de ítems, cantidades, subtotal y cierre.
// Por ahora el cierre es por WhatsApp (arma el pedido); el checkout completo
// con datos, MercadoPago y envío llega en las próximas fases.
export default function CartPage() {
  const { items, subtotal, setCantidad, quitar, vaciar } = useCart()

  return (
    <div className="catalog-root">
      <header className="cart-header">
        <Link to="/">
          <Logo />
        </Link>
        <HeaderActions />
      </header>
      <Scallop />

      <main className="cart-page">
        <h1 className="cart-title">Tu carrito</h1>

        {items.length === 0 ? (
          <div className="no-results">
            Tu carrito está vacío.
            <br />
            <Link className="pp-back" to="/">
              ← Volver a la tienda
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {items.map((i) => (
                <div className="cart-item" key={i.clave}>
                  <img src={i.imagen} alt={nombreItem(i)} />
                  <div className="cart-item-main">
                    <Link to={`/producto/${i.slug ?? i.id}`} className="cart-item-name">
                      {nombreItem(i)}
                    </Link>
                    <p className="cart-item-price">{money(i.precio)}</p>
                    <div className="qty">
                      <button type="button" onClick={() => setCantidad(i.clave, i.cantidad - 1)} aria-label="Restar">
                        −
                      </button>
                      <span>{i.cantidad}</span>
                      <button type="button" onClick={() => setCantidad(i.clave, i.cantidad + 1)} aria-label="Sumar">
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-right">
                    <p className="cart-item-total">{money(i.precio * i.cantidad)}</p>
                    <button type="button" className="cart-remove" onClick={() => quitar(i.clave)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <div className="cart-subtotal">
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              {/* TODO(owner-copy): revisar este texto una vez definida la copy final del checkout. */}
              <p className="cart-note">
                {t('carrito.siguientePaso')}
              </p>

              <Link className="btn btn-primary" to="/checkout">
                Finalizar pedido
              </Link>
              <div className="cart-actions">
                <Link className="pp-back" to="/">
                  ← Seguir comprando
                </Link>
                <button type="button" className="cart-clear" onClick={vaciar}>
                  Vaciar carrito
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
