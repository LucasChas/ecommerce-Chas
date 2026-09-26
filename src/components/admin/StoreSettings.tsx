import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useDialog } from '../../context/DialogContext'
import { useTienda } from '../../tienda'
import type { ConfiguracionDB, Ornamento, PresetTema } from '../../tienda/tipos'
import { PRESETS } from '../../tienda/presets.mjs'
import { t } from '../../i18n/textos'

const ORNAMENTOS: { valor: Ornamento; texto: string }[] = [
  { valor: 'festón', texto: 'Festón' },
  { valor: 'onda', texto: 'Onda' },
  { valor: 'línea', texto: 'Línea' },
  { valor: 'ninguno', texto: 'Ninguno' },
]

// Límite para el logo: se sube tal cual (sin comprimir a JPEG, que rompería
// la transparencia de un PNG/SVG), así que conviene que sea liviano.
const LOGO_MAX_BYTES = 1024 * 1024

// Sube el logo al bucket de productos, en la carpeta "marca/". El nombre es
// único para que ningún navegador muestre el logo viejo cacheado.
async function subirLogo(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const ruta = `marca/logo-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('productos')
    .upload(ruta, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw error
  return supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
}

// Pestaña "Mi tienda" del panel: la dueña edita nombre, logo, colores y
// contacto. Se guarda en la tabla "configuracion" (migración 0014) y se ve en
// el muestrario al recargar. Un campo vacío vuelve al valor de
// tienda/tienda.config.mjs.
export default function StoreSettings() {
  const { config, recargar } = useTienda()
  const { avisar } = useDialog()

  const [nombre, setNombre] = useState(config.nombre)
  const [eslogan, setEslogan] = useState(config.eslogan)
  const [logoUrl, setLogoUrl] = useState(config.logoUrl ?? '')
  const [urlSitio, setUrlSitio] = useState(config.urlSitio)
  const [colorPrimario, setColorPrimario] = useState(config.tema.colorPrimario)
  const [colorFondo, setColorFondo] = useState(config.tema.colorFondo)
  const [colorTexto, setColorTexto] = useState(config.tema.colorTexto)
  const [whatsapp, setWhatsapp] = useState(config.contacto.whatsapp)
  const [instagram, setInstagram] = useState(config.contacto.instagram)
  const [email, setEmail] = useState(config.contacto.email)
  const [preset, setPreset] = useState<PresetTema>(config.tema.preset)
  const [ornamento, setOrnamento] = useState<Ornamento>(config.tema.ornamento)
  // Envío: texto libre en el input; vacío = a coordinar / nunca gratis.
  const [envioCosto, setEnvioCosto] = useState(config.envio.costo === null ? '' : String(config.envio.costo))
  const [envioGratis, setEnvioGratis] = useState(
    config.envio.gratisDesde === null ? '' : String(config.envio.gratisDesde),
  )

  // Elegir un tema carga sus colores y ornamento (después se pueden retocar).
  function elegirPreset(p: PresetTema) {
    setPreset(p)
    setColorPrimario(PRESETS[p].colorPrimario)
    setColorFondo(PRESETS[p].colorFondo)
    setColorTexto(PRESETS[p].colorTexto)
    setOrnamento(PRESETS[p].ornamento)
  }

  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > LOGO_MAX_BYTES) {
      setError(t('admin.logoPesado'))
      return
    }
    setSubiendo(true)
    setError(null)
    try {
      setLogoUrl(await subirLogo(file))
    } catch {
      setError(t('admin.logoError'))
    } finally {
      setSubiendo(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const vacioANull = (v: string) => v.trim() || null
    const cambios: ConfiguracionDB = {
      nombre_tienda: vacioANull(nombre),
      eslogan: eslogan.trim(),
      logo_url: vacioANull(logoUrl),
      url_sitio: vacioANull(urlSitio),
      color_primario: colorPrimario,
      color_fondo: colorFondo,
      color_texto: colorTexto,
      whatsapp: vacioANull(whatsapp.replace(/\D/g, '')),
      instagram: instagram.trim().replace(/^@/, ''),
      email_contacto: vacioANull(email),
      tema_preset: preset,
      ornamento,
      envio_costo: envioCosto.trim() === '' ? null : Math.max(0, Number(envioCosto) || 0),
      envio_gratis_desde: envioGratis.trim() === '' ? null : Math.max(0, Number(envioGratis) || 0),
    }

    // .select() para detectar un update bloqueado por RLS: no da error, solo
    // devuelve 0 filas y la pantalla quedaría muda.
    const { data, error: err } = await supabase
      .from('configuracion')
      .update(cambios)
      .eq('id', true)
      .select()

    setGuardando(false)
    if (err || !data?.length) {
      setError(
        err?.message.includes('check')
          ? t('admin.datosInvalidos')
          : 'No se pudo guardar. ¿Corriste las migraciones 0014 a 0017 en Supabase?',
      )
      return
    }
    await recargar()
    avisar({ titulo: 'Listo', mensaje: 'Los cambios ya se ven en la tienda.' })
  }

  return (
    <form className="store-settings" onSubmit={onSubmit}>
      <div className="list-head">
        <div>
          <h1>Mi tienda</h1>
          <p>Nombre, logo, tema, contacto y envío.</p>
        </div>
      </div>

      <section className="settings-card">
        <h2>Marca</h2>
        <div className="field">
          <label>Nombre de la tienda</label>
          <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="field">
          <label>Eslogan</label>
          <input
            type="text"
            value={eslogan}
            onChange={(e) => setEslogan(e.target.value)}
            placeholder="Ej: Ropa y accesorios"
          />
        </div>
        <div className="field">
          <label>Logo</label>
          <div className="logo-row">
            <div className="logo-preview">
              {logoUrl ? <img src={logoUrl} alt="Logo" /> : <span>{nombre || 'Sin logo'}</span>}
            </div>
            <div className="logo-actions">
              <label className="btn btn-ghost logo-upload">
                {subiendo ? 'Subiendo…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={onLogo} hidden />
              </label>
              {logoUrl && (
                <button type="button" className="link-btn" onClick={() => setLogoUrl('')}>
                  Usar el nombre como logo
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>Tema</h2>
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
        <div className="field">
          <label>Adorno debajo del encabezado</label>
          <select value={ornamento} onChange={(e) => setOrnamento(e.target.value as Ornamento)}>
            {ORNAMENTOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-card">
        <h2>Colores</h2>
        <div className="color-grid">
          <ColorField label="Principal" value={colorPrimario} onChange={setColorPrimario} />
          <ColorField label="Fondo" value={colorFondo} onChange={setColorFondo} />
          <ColorField label="Texto" value={colorTexto} onChange={setColorTexto} />
        </div>
        {/* Vista previa con los colores elegidos (antes de guardar). */}
        <div className="color-preview" style={{ background: colorFondo, color: colorTexto }}>
          <strong>{nombre || 'Mi tienda'}</strong>
          <span>Así se ven los textos sobre el fondo.</span>
          <span className="color-preview-btn" style={{ background: colorPrimario }}>
            Agregar al carrito
          </span>
        </div>
      </section>

      <section className="settings-card">
        <h2>Contacto</h2>
        <div className="field">
          <label>WhatsApp (con código de país, sin + ni espacios)</label>
          <input
            type="tel"
            required
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="Ej: 5493510000000"
          />
        </div>
        <div className="field">
          <label>Instagram (sin @, vacío para ocultarlo)</label>
          <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        </div>
        <div className="field">
          <label>Email de contacto</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Dirección del sitio</label>
          <input
            type="url"
            value={urlSitio}
            onChange={(e) => setUrlSitio(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </section>

      <section className="settings-card">
        <h2>Envío a domicilio</h2>
        <div className="row2">
          <div className="field">
            <label>Costo ({config.region.moneda})</label>
            <input
              type="number"
              min={0}
              value={envioCosto}
              onChange={(e) => setEnvioCosto(e.target.value)}
              placeholder="A coordinar"
            />
          </div>
          <div className="field">
            <label>Gratis desde</label>
            <input
              type="number"
              min={0}
              value={envioGratis}
              onChange={(e) => setEnvioGratis(e.target.value)}
              placeholder="Nunca"
            />
          </div>
        </div>
        <p className="field-hint">Vacío = el envío se coordina aparte y no se cobra en la web.</p>
      </section>

      {error && <p className="form-error">{error}</p>}

      <div className="sheet-actions">
        <button type="submit" className="btn btn-primary" disabled={guardando || subiendo}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
      <code>{value.toUpperCase()}</code>
    </label>
  )
}
