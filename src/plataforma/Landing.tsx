import { Link } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import { PRESETS } from '../tienda/presets.mjs'
import type { PresetTema } from '../tienda/tipos'
import { precioPlan, waPlataforma } from './formato'
import CabeceraPlataforma from './CabeceraPlataforma'
import IsotipoHornero from './IsotipoHornero'

// Landing de la plataforma: qué es, cómo funciona, cuánto sale y cómo
// empezar (o pedir algo a medida por WhatsApp).
export default function Landing() {
  const { plan } = plataforma
  return (
    <div className="plat">
      <CabeceraPlataforma />

      <section className="plat-hero">
        <div className="plat-hero-txt">
          <p className="plat-kicker">Tiendas online para marcas con identidad</p>
          <h1>Construí tu propio lugar en internet.</h1>
          <p className="plat-lead">
            Cargá tu logo, tus colores y tus productos, y empezá a vender hoy. Carrito, pedidos, cobros con
            MercadoPago y un panel pensado para usar desde el celular.
          </p>
          <div className="plat-ctas">
            <Link className="btn btn-primary" to="/crear">
              Probala gratis {plan.diasPrueba} días
            </Link>
            <a className="plat-link" href={`/t/${plataforma.demoSlug}`}>
              Ver una tienda de ejemplo →
            </a>
          </div>
          <p className="plat-nota">Sin tarjeta para empezar. Cancelás cuando quieras.</p>
        </div>

        {/* Maqueta de una tienda en un celular, hecha con CSS. */}
        <div className="plat-mock" aria-hidden="true">
          <div className="mock-tel">
            <div className="mock-head">Tu marca</div>
            <div className="scallop" />
            <div className="mock-chips">
              <span className="activo">Todos</span>
              <span>Novedades</span>
              <span>Ofertas</span>
            </div>
            <div className="mock-grid">
              {[0, 1, 2, 3].map((i) => (
                <div className="mock-card" key={i}>
                  <div className="mock-img" />
                  <div className="mock-line" />
                  <div className="mock-line corta" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="plat-seccion" id="como-funciona">
        <h2>Cómo funciona</h2>
        <div className="plat-pasos">
          {[
            ['1', 'Creá tu cuenta', 'Con el mail que vas a usar para administrar la tienda.'],
            ['2', 'Poné tu marca', 'Nombre, logo, colores, WhatsApp, Instagram y dirección web propia.'],
            ['3', 'Cargá y vendé', 'Subí tus productos desde el celular y compartí el link de tu tienda.'],
          ].map(([n, t, d]) => (
            <div className="plat-paso" key={n}>
              <span className="paso">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="plat-seccion plat-historia">
        <IsotipoHornero tamano={64} />
        <h2>¿Por qué Hornero?</h2>
        <p className="plat-sub">
          El hornero, nuestro pájaro nacional, construye su propia casa con sus manos, barro por barro. Así pensamos
          {' '}{plataforma.nombre}: para que cada emprendedor levante su lugar en internet, a su manera y con su marca, sin
          depender de nadie.
        </p>
      </section>

      <section className="plat-seccion plat-fondo">
        <h2>Tu estilo, no el de una plantilla</h2>
        <p className="plat-sub">Elegí una base y ajustala a tu marca. Se cambia cuando quieras desde tu panel.</p>
        <div className="plat-temas">
          {(Object.keys(PRESETS) as PresetTema[]).map((p) => (
            <div className="plat-tema" key={p} style={{ background: PRESETS[p].colorFondo, color: PRESETS[p].colorTexto }}>
              <span className="plat-tema-nombre" style={{ fontFamily: `'${PRESETS[p].fuenteTitulos}', serif` }}>
                {PRESETS[p].nombre}
              </span>
              <span className="plat-tema-btn" style={{ background: PRESETS[p].colorPrimario, color: PRESETS[p].colorFondo }}>
                Agregar al carrito
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="plat-seccion" id="precios">
        <h2>Un solo plan, todo incluido</h2>
        <div className="plat-precio">
          <p className="plat-plan">{plan.nombre}</p>
          <p className="plat-monto">
            {precioPlan()} <small>/ mes</small>
          </p>
          <p className="plat-nota">Los primeros {plan.diasPrueba} días son gratis.</p>
          <ul>
            {plan.incluye.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <Link className="btn btn-primary" to="/crear">
            Crear mi tienda
          </Link>
        </div>
      </section>

      <section className="plat-seccion plat-medida">
        <h2>¿Necesitás algo a medida?</h2>
        <p className="plat-sub">
          Si tu negocio necesita algo que la plataforma no trae (una integración, un diseño propio, otra forma de
          vender), lo pensamos juntos.
        </p>
        <a
          className="btn btn-primary"
          href={waPlataforma(`Hola! Vi ${plataforma.nombre} y quiero consultar por un proyecto a medida.`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Hablemos por WhatsApp
        </a>
      </section>

      <section className="plat-seccion">
        <h2>Preguntas frecuentes</h2>
        <div className="plat-faq">
          {[
            ['¿Necesito saber programar?', 'No. Todo se configura desde tu panel, incluso desde el celular.'],
            ['¿Cómo cobro mis ventas?', 'Con tu propia cuenta de MercadoPago: la plata va directo a vos. También podés coordinar el pago por WhatsApp.'],
            ['¿Qué pasa si no pago la suscripción?', 'Tu tienda se pausa (tus clientes ven un aviso) pero no se borra nada. Al activarla vuelve tal cual estaba.'],
            ['¿Puedo cancelar?', 'Sí, cuando quieras, desde MercadoPago o escribiéndonos.'],
          ].map(([p, r]) => (
            <details key={p}>
              <summary>{p}</summary>
              <p>{r}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="plat-footer">
        <p>
          © {new Date().getFullYear()} {plataforma.nombre} · <a href={`mailto:${plataforma.contacto.email}`}>{plataforma.contacto.email}</a>
        </p>
      </footer>
    </div>
  )
}
