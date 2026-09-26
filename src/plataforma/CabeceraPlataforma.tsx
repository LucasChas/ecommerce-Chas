import { Link } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import { useAuth } from '../context/AuthContext'
import IsotipoHornero from './IsotipoHornero'

// Encabezado de las pantallas de la plataforma (isotipo + nombre, y el festón).
export default function CabeceraPlataforma({ simple = false }: { simple?: boolean }) {
  const { session } = useAuth()
  return (
    <>
      <header className="plat-header">
        <Link to="/" className="plat-marca">
          <IsotipoHornero />
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
