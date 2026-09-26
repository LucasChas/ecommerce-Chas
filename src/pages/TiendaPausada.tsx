import Logo from '../components/Logo'
import Scallop from '../components/Scallop'
import { useTienda } from '../tienda'
import '../styles/catalog.css'
import '../styles/cart.css'

// Vitrina de una tienda pausada (prueba vencida sin suscripción o suspendida
// por la plataforma). Se muestra con la marca de la tienda, sin productos.
export default function TiendaPausada() {
  const { config } = useTienda()
  return (
    <div className="catalog-root">
      <header className="cart-header">
        <Logo />
      </header>
      <Scallop />
      <main className="legal-page">
        <div className="legal-card aviso-tienda">
          <h1 className="cart-title">Volvemos pronto</h1>
          <p>{config.nombre} no está recibiendo pedidos en este momento.</p>
          {config.contacto.whatsapp && (
            <a className="btn btn-primary" href={`https://wa.me/${config.contacto.whatsapp}`} target="_blank" rel="noopener noreferrer">
              Escribir por WhatsApp
            </a>
          )}
        </div>
      </main>
    </div>
  )
}
