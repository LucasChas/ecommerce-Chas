import plataforma from '../../plataforma/plataforma.config.mjs'
import '../styles/catalog.css'
import '../styles/cart.css'

// La dirección /t/<slug> no corresponde a ninguna tienda.
export default function TiendaNoEncontrada() {
  return (
    <div className="catalog-root">
      <main className="legal-page">
        <div className="legal-card aviso-tienda">
          <h1 className="cart-title">No encontramos esta tienda</h1>
          <p>Revisá la dirección. Si querés una tienda con este nombre, todavía está disponible.</p>
          <a className="btn btn-primary" href="/crear">
            Crear mi tienda en {plataforma.nombre}
          </a>
        </div>
      </main>
    </div>
  )
}
