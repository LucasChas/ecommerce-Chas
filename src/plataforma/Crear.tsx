import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { PRESETS } from '../tienda/presets.mjs'
import { RUBROS } from '../tienda/rubros.mjs'
import type { PresetTema } from '../tienda/tipos'
import PasswordInput from '../components/common/PasswordInput'
import CabeceraPlataforma from './CabeceraPlataforma'
import { SLUG_VALIDO, aSlug } from './slug'
import { irASuscribir } from './suscripcion'

type Paso = 'cuenta' | 'tienda' | 'marca' | 'lista'
type Rubro = keyof typeof RUBROS

const LOGO_MAX_BYTES = 1024 * 1024

// Alta guiada de una tienda nueva:
//   1. Cuenta     → el mail administrativo (con el que después entra al panel).
//   2. Tu tienda  → nombre, dirección web, rubro y datos de contacto.
//   3. Tu marca   → tema, color y logo. Acá se crea la tienda (crear_tienda).
//   4. Lista      → link a su tienda, a su panel y a la suscripción.
// La tienda arranca con la prueba gratis; la suscripción se puede activar al
// final o después desde el panel.
export default function Crear() {
  const { session, loading } = useAuth()
  const [paso, setPaso] = useState<Paso>('tienda')
  const [creada, setCreada] = useState<{ id: string; slug: string } | null>(null)

  if (loading) return null
  const pasoActual: Paso = !session ? 'cuenta' : creada ? 'lista' : paso

  return (
    <div className="plat">
      <CabeceraPlataforma simple />
      <main className="plat-alta">
        <ol className="plat-stepper" aria-label="Pasos">
          {(['cuenta', 'tienda', 'marca', 'lista'] as Paso[]).map((p, i) => (
            <li key={p} className={p === pasoActual ? 'activo' : undefined}>
              <span className="paso">{i + 1}</span>
              {{ cuenta: 'Cuenta', tienda: 'Tu tienda', marca: 'Tu marca', lista: '¡Lista!' }[p]}
            </li>
          ))}
        </ol>

        {pasoActual === 'cuenta' && <PasoCuenta />}
        {pasoActual !== 'cuenta' && pasoActual !== 'lista' && (
          <FormTienda paso={pasoActual} onPaso={setPaso} onCreada={setCreada} emailSesion={session?.user.email ?? ''} />
        )}
        {pasoActual === 'lista' && creada && <PasoLista tienda={creada} />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- Paso 1
function PasoCuenta() {
  const { registrar, ingresar } = useAuth()
  const [modo, setModo] = useState<'registro' | 'ingreso'>('registro')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      if (modo === 'ingreso') {
        const { error } = await ingresar(email, password)
        if (error) setError(error)
        return
      }
      const r = await registrar({ email, password, nombre, telefono })
      if (r.error) setError(r.error)
      else if (r.yaRegistrado) {
        setModo('ingreso')
        setAviso('Ese mail ya tiene una cuenta: ingresá con tu contraseña.')
      } else if (r.necesitaConfirmar) {
        setAviso('Te mandamos un mail para confirmar la cuenta. El link te trae de vuelta acá para seguir.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="plat-card" onSubmit={onSubmit}>
      <h1>{modo === 'registro' ? 'Creá tu cuenta' : 'Ingresá a tu cuenta'}</h1>
      <p className="plat-sub">
        Este es el <strong>mail administrativo</strong>: con él vas a entrar a tu panel y te vamos a escribir por tu
        suscripción.
      </p>
      {modo === 'registro' && (
        <>
          <div className="field">
            <label htmlFor="campo-1">Tu nombre</label>
            <input id="campo-1" type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="campo-2">Teléfono</label>
            <input id="campo-2" type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 351 123 4567" />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="campo-3">Email</label>
        <input id="campo-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="campo-4">Contraseña</label>
        <PasswordInput id="campo-4"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
        />
      </div>
      {aviso && <p className="checkout-aviso">{aviso}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" disabled={enviando}>
        {enviando ? 'Un momento…' : modo === 'registro' ? 'Crear cuenta y seguir' : 'Ingresar y seguir'}
      </button>
      <button type="button" className="plat-link" onClick={() => setModo(modo === 'registro' ? 'ingreso' : 'registro')}>
        {modo === 'registro' ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Creala'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- Pasos 2 y 3
function FormTienda({
  paso,
  onPaso,
  onCreada,
  emailSesion,
}: {
  paso: 'tienda' | 'marca'
  onPaso: (p: Paso) => void
  onCreada: (t: { id: string; slug: string }) => void
  emailSesion: string
}) {
  // Paso 2
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEditado, setSlugEditado] = useState(false)
  const [slugLibre, setSlugLibre] = useState<boolean | null>(null)
  const [rubro, setRubro] = useState<Rubro>('generico')
  const [emailAdmin, setEmailAdmin] = useState(emailSesion)
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [instagram, setInstagram] = useState('')
  // Paso 3
  const [preset, setPreset] = useState<PresetTema>('calido')
  const [color, setColor] = useState(PRESETS.calido.colorPrimario)
  const [logo, setLogo] = useState<File | null>(null)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La dirección se arma sola desde el nombre, hasta que la editen a mano.
  useEffect(() => {
    if (!slugEditado) setSlug(aSlug(nombre))
  }, [nombre, slugEditado])

  // ¿Está libre? (con una pequeña espera para no consultar en cada tecla)
  useEffect(() => {
    setSlugLibre(null)
    if (!SLUG_VALIDO.test(slug)) return
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('slug_disponible', { p_slug: slug })
      setSlugLibre(!!data)
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  function elegirPreset(p: PresetTema) {
    setPreset(p)
    setColor(PRESETS[p].colorPrimario)
  }

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > LOGO_MAX_BYTES) {
      setError('El logo pesa más de 1 MB. Probá con una versión más liviana.')
      return
    }
    setError(null)
    setLogo(f)
  }

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      const { data: id, error } = await supabase.rpc('crear_tienda', {
        p_slug: slug,
        p_nombre: nombre,
        p_rubro: rubro,
        p_email_admin: emailAdmin,
        p_telefono: whatsapp,
        p_direccion: direccion || null,
        p_localidad: localidad || null,
        p_instagram: instagram || null,
        p_preset: preset,
        p_color: color === PRESETS[preset].colorPrimario ? null : color,
      })
      if (error) throw new Error(error.message)
      const tiendaId = id as string

      // El logo va a la carpeta de la tienda (recién ahora existe su id).
      if (logo) {
        const ext = logo.name.split('.').pop()?.toLowerCase() || 'png'
        const ruta = `${tiendaId}/marca/logo-${crypto.randomUUID()}.${ext}`
        const { error: errSubida } = await supabase.storage
          .from('productos')
          .upload(ruta, logo, { cacheControl: '3600', contentType: logo.type })
        if (!errSubida) {
          const url = supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
          await supabase.from('configuracion').update({ logo_url: url }).eq('tienda_id', tiendaId)
        }
      }
      onCreada({ id: tiendaId, slug })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la tienda.')
    } finally {
      setCreando(false)
    }
  }

  const pasoTiendaValido =
    nombre.trim().length >= 2 && SLUG_VALIDO.test(slug) && slugLibre === true && whatsapp.replace(/\D/g, '').length >= 8

  if (paso === 'tienda') {
    return (
      <form
        className="plat-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (pasoTiendaValido) onPaso('marca')
        }}
      >
        <h1>Tu tienda</h1>
        <div className="field">
          <label htmlFor="campo-5">Nombre de la tienda</label>
          <input id="campo-5" type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Pecora" />
        </div>
        <div className="field">
          <label htmlFor="campo-slug">Dirección web</label>
          <div className="plat-slug">
            <span>{window.location.host}/t/</span>
            <input
              id="campo-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlugEditado(true)
                setSlug(aSlug(e.target.value))
              }}
            />
          </div>
          <p className={slugLibre === false ? 'field-hint plat-error' : 'field-hint'}>
            {!SLUG_VALIDO.test(slug)
              ? 'Entre 3 y 40 caracteres: letras, números y guiones.'
              : slugLibre === null
                ? 'Revisando…'
                : slugLibre
                  ? '✓ Disponible'
                  : 'Esa dirección ya está tomada.'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="campo-6">Rubro</label>
          <select id="campo-6" value={rubro} onChange={(e) => setRubro(e.target.value as Rubro)}>
            {(Object.keys(RUBROS) as Rubro[]).map((r) => (
              <option key={r} value={r}>
                {RUBROS[r].nombre}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Define cómo se llaman las opciones de tus productos ({RUBROS[rubro].etiquetaVariante}) y las categorías
            iniciales.
          </p>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="campo-7">WhatsApp de la tienda</label>
            <input id="campo-7" type="tel" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Con código de país: 54 9 351…" />
          </div>
          <div className="field">
            <label htmlFor="campo-8">Instagram (opcional)</label>
            <input id="campo-8" type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tutienda" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="campo-9">Dirección (opcional)</label>
            <input id="campo-9" type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle y número" />
          </div>
          <div className="field">
            <label htmlFor="campo-10">Localidad (opcional)</label>
            <input id="campo-10" type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="campo-11">Mail administrativo</label>
          <input id="campo-11" type="email" required value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={!pasoTiendaValido}>
          Seguir
        </button>
      </form>
    )
  }

  return (
    <div className="plat-card">
      <h1>Tu marca</h1>
      <p className="plat-sub">Todo esto se puede cambiar después desde tu panel.</p>
      <div className="preset-grid">
        {(Object.keys(PRESETS) as PresetTema[]).map((p) => (
          <button
            type="button"
            key={p}
            className={preset === p ? 'preset-op activo' : 'preset-op'}
            onClick={() => elegirPreset(p)}
            style={{ background: PRESETS[p].colorFondo, color: PRESETS[p].colorTexto }}
          >
            <span className="preset-muestra" style={{ background: PRESETS[p].colorPrimario }} />
            <span style={{ fontFamily: `'${PRESETS[p].fuenteTitulos}', serif` }}>{PRESETS[p].nombre}</span>
          </button>
        ))}
      </div>
      <div className="row2">
        <div className="field">
          <label>Color principal</label>
          <label className="color-field plat-color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <code>{color.toUpperCase()}</code>
          </label>
        </div>
        <div className="field">
          <label>Logo (opcional)</label>
          <label className="btn btn-ghost logo-upload">
            {logo ? logo.name : 'Elegir archivo'}
            <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={onLogo} hidden />
          </label>
        </div>
      </div>

      {/* Vista previa con lo elegido. */}
      <div className="color-preview" style={{ background: PRESETS[preset].colorFondo, color: PRESETS[preset].colorTexto }}>
        <strong style={{ fontFamily: `'${PRESETS[preset].fuenteTitulos}', serif` }}>{nombre}</strong>
        <span>Así se va a ver tu tienda.</span>
        <span className="color-preview-btn" style={{ background: color }}>
          Agregar al carrito
        </span>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="plat-acciones">
        <button type="button" className="plat-link" onClick={() => onPaso('tienda')}>
          ← Volver
        </button>
        <button type="button" className="btn btn-primary" onClick={crear} disabled={creando}>
          {creando ? 'Creando tu tienda…' : 'Crear mi tienda'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Paso 4
function PasoLista({ tienda }: { tienda: { id: string; slug: string } }) {
  const [error, setError] = useState<string | null>(null)
  const [yendo, setYendo] = useState(false)
  const url = `${window.location.origin}/t/${tienda.slug}`

  async function suscribir() {
    setYendo(true)
    setError(await irASuscribir(tienda.id))
    setYendo(false)
  }

  return (
    <div className="plat-card plat-lista">
      <div className="pago-icono" aria-hidden="true">
        ✓
      </div>
      <h1>¡Tu tienda está lista!</h1>
      <p className="plat-sub">
        Ya está online en <a href={url}>{url.replace(/^https?:\/\//, '')}</a>. Tenés {plataforma.plan.diasPrueba} días de
        prueba gratis.
      </p>
      <ol className="plat-siguientes">
        <li>Cargá tus productos desde el panel.</li>
        <li>Conectá tu MercadoPago para cobrar online (en "Mi tienda").</li>
        <li>Compartí el link en tu Instagram y WhatsApp.</li>
      </ol>
      {error && <p className="form-error">{error}</p>}
      <div className="plat-acciones columna">
        <a className="btn btn-primary" href={`/t/${tienda.slug}/admin`}>
          Ir a mi panel
        </a>
        <button type="button" className="btn btn-ghost" onClick={suscribir} disabled={yendo}>
          {yendo ? 'Abriendo MercadoPago…' : 'Activar la suscripción ahora'}
        </button>
        <Link className="plat-link" to="/panel">
          Ver mis tiendas
        </Link>
      </div>
    </div>
  )
}
