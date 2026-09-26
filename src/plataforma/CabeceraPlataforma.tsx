import { Link } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import { useAuth } from '../context/AuthContext'

// Encabezado de las pantallas de la plataforma (con el festón de Pecora).
export default function CabeceraPlataforma({ simple = false }: { simple?: boolean }) {
  const { session } = useAuth()
  return (
    <>
      <header className="plat-header">
        <Link to="/" className="plat-marca">
          {plataforma.nombre}
        </Link>
        {!simple && (
          <nav className="plat-nav">
            <a href="/#precios">Precios</a>
            {session ? (
              <Link to="/panel">Mis tiendas</Link>
            ) : (
              <Link to="/ingresar">Ingresar</Link>
            )}
            <Link className="btn btn-primary plat-nav-cta" to="/crear">
              Crear tienda
            </Link>
          </nav>
        )}
      </header>
      <div className="scallop" aria-hidden="true" />
    </>
  )
}
