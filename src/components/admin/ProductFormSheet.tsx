import { useEffect, useRef, useState } from 'react'
import type { Categoria, ProductoConCategoria, Variante } from '../../types'
import { supabase } from '../../lib/supabaseClient'
import { tienda } from '../../tienda'
import { comprimirImagen } from '../../lib/imageCompress'
import { useDialog } from '../../context/DialogContext'
import ImagePicker, { type ImagenItem } from './ImagePicker'
import { t } from '../../i18n/textos'

interface Props {
  open: boolean
  // Producto a editar, o null para dar de alta uno nuevo.
  producto: ProductoConCategoria | null
  categorias: Categoria[]
  onClose: () => void
  onGestionarCategorias: () => void
  // Refresca los datos después de guardar/borrar/crear categoría.
  onChanged: () => void
}

// Comprime y sube un archivo al bucket "productos" de Storage; devuelve su URL.
async function subirImagen(file: File): Promise<string> {
  const blob = await comprimirImagen(file) // se sube liviana (JPEG)
  const nombre = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('productos')
    .upload(nombre, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('productos').getPublicUrl(nombre)
  return data.publicUrl
}

// Imágenes ya guardadas de un producto (galería nueva, o la portada vieja),
// convertidas al ítem unificado que usa ImagePicker. El key es la propia URL:
// es estable entre renders y único dentro de la galería de un producto.
function imagenesGuardadas(p: ProductoConCategoria | null): ImagenItem[] {
  if (!p) return []
  const arr = (p.imagenes ?? []).filter(Boolean)
  const urls = arr.length ? arr : p.imagen_url ? [p.imagen_url] : []
  return urls.map((url) => ({ key: url, kind: 'url', url }))
}

// Fila editable de variante en el formulario ("key" es estable para React;
// "id" existe solo si la variante ya está guardada).
interface VarianteForm {
  key: string
  id?: string
  nombre: string
  stock: string
}

// Sincroniza las variantes de un producto con lo que quedó en el formulario:
// borra las que se quitaron, actualiza las existentes e inserta las nuevas.
// El orden de la lista es el orden en que se muestran en la ficha.
async function guardarVariantes(productoId: string, opciones: VarianteForm[], antes: Variante[]) {
  const quedan = new Set(opciones.filter((v) => v.id).map((v) => v.id))
  const borrar = antes.filter((v) => !quedan.has(v.id)).map((v) => v.id)
  if (borrar.length) {
    const { error } = await supabase.from('producto_variantes').delete().in('id', borrar)
    if (error) throw error
  }
  for (const [orden, v] of opciones.entries()) {
    const fila = { producto_id: productoId, nombre: v.nombre, stock: Math.max(0, Number(v.stock) || 0), orden }
    const { error } = v.id
      ? await supabase.from('producto_variantes').update(fila).eq('id', v.id)
      : await supabase.from('producto_variantes').insert(fila)
    if (error) throw error
  }
}

// Hoja (bottom sheet) para crear o editar un producto.
// Incluye la carga de imagen (a Storage) y el selector de categoría con la
// opción de crear una nueva sin salir del formulario.
export default function ProductFormSheet({
  open,
  producto,
  categorias,
  onClose,
  onGestionarCategorias,
  onChanged,
}: Props) {
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [stock, setStock] = useState('')
  // Rubros (migración 0015): visible en el catálogo, datos extra y variantes.
  const [activo, setActivo] = useState(true)
  const [atributos, setAtributos] = useState<Record<string, string>>({})
  const [variantes, setVariantes] = useState<VarianteForm[]>([])
  // Galería: lista única y ordenada (URLs existentes + archivos nuevos
  // intercalados, en el orden en que se van a mostrar/guardar). El índice 0
  // es la portada. Reemplaza los antiguos keepUrls/newFiles disjuntos, que
  // no permitían intercalar una foto nueva antes de una existente.
  const [imagenes, setImagenes] = useState<ImagenItem[]>([])

  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false)
  const [nuevaCat, setNuevaCat] = useState('')

  const { confirmar } = useDialog()
  const { etiquetaVariante, atributos: camposAtributos } = tienda().catalogo
  const stockTotalVariantes = variantes.reduce((n, v) => n + (Number(v.stock) || 0), 0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Referencia siempre actualizada al estado de imágenes, sólo para poder
  // revocar los object URLs de archivos nuevos al desmontar o al cambiar de
  // producto (no dispara re-render, no participa en el flujo de reorder).
  const imagenesRef = useRef<ImagenItem[]>([])
  useEffect(() => {
    imagenesRef.current = imagenes
  }, [imagenes])

  // Al abrir la hoja, cargamos los datos del producto (o valores vacíos si es alta).
  useEffect(() => {
    if (!open) return
    // Si veníamos de otro producto con fotos nuevas sin guardar, liberamos
    // sus previews antes de reemplazar la galería.
    imagenesRef.current.forEach((it) => {
      if (it.kind === 'file') URL.revokeObjectURL(it.preview)
    })
    setNombre(producto?.nombre ?? '')
    setCategoriaId(producto?.categoria_id ?? categorias[0]?.id ?? '')
    setDescripcion(producto?.descripcion ?? '')
    setPrecio(producto ? String(producto.precio) : '')
    setStock(producto ? String(producto.stock) : '')
    setImagenes(imagenesGuardadas(producto))
    setActivo(producto?.activo ?? true)
    setAtributos({ ...(producto?.atributos ?? {}) })
    setVariantes(
      (producto?.variantes ?? []).map((v) => ({ key: v.id, id: v.id, nombre: v.nombre, stock: String(v.stock) })),
    )
    setMostrarNuevaCat(false)
    setNuevaCat('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto])

  // Al desmontar el componente, liberamos cualquier preview de archivo nuevo
  // que haya quedado viva.
  useEffect(() => {
    return () => {
      imagenesRef.current.forEach((it) => {
        if (it.kind === 'file') URL.revokeObjectURL(it.preview)
      })
    }
  }, [])

  // Manejo de la galería de imágenes: cada archivo nuevo crea su object URL
  // UNA sola vez, al agregarse (no en cada render/reorder, que es lo que
  // causaba flicker/imágenes rotas al arrastrar con el efecto anterior).
  function agregarFiles(files: File[]) {
    const nuevos: ImagenItem[] = files.map((file) => ({
      key: crypto.randomUUID(),
      kind: 'file',
      file,
      preview: URL.createObjectURL(file),
    }))
    setImagenes((prev) => [...prev, ...nuevos])
  }

  // Reordenar y quitar imágenes llegan por el mismo callback desde
  // ImagePicker; acá detectamos qué archivos nuevos salieron para revocar
  // su preview (las URLs existentes no tienen nada que liberar).
  function onImagenesChange(next: ImagenItem[]) {
    const nextKeys = new Set(next.map((it) => it.key))
    for (const it of imagenes) {
      if (it.kind === 'file' && !nextKeys.has(it.key)) URL.revokeObjectURL(it.preview)
    }
    setImagenes(next)
  }

  function onCategoriaChange(valor: string) {
    if (valor === '__new__') {
      setMostrarNuevaCat(true)
    } else {
      setMostrarNuevaCat(false)
      setCategoriaId(valor)
    }
  }

  // Crea una categoría nueva desde el mismo formulario y la deja seleccionada.
  async function agregarCategoria() {
    const limpio = nuevaCat.trim()
    if (!limpio) return
    const { data, error } = await supabase
      .from('categorias')
      .insert({ nombre: limpio })
      .select()
      .single()
    if (error) {
      setError('No se pudo crear la categoría: ' + error.message)
      return
    }
    setCategoriaId(data.id)
    setNuevaCat('')
    setMostrarNuevaCat(false)
    onChanged() // Refresca la lista de categorías (acá y en el catálogo).
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!categoriaId || categoriaId === '__new__') {
      setError(t('admin.faltaCategoria'))
      return
    }
    setGuardando(true)
    setError(null)
    try {
      // Recorremos la galería en el orden que dejó el drag-and-drop, subiendo
      // a Storage sólo las imágenes nuevas, en el lugar exacto donde quedaron
      // (ya no van todas al final como con keepUrls/newFiles separados).
      const imagenesFinal: string[] = []
      for (const item of imagenes) {
        imagenesFinal.push(item.kind === 'url' ? item.url : await subirImagen(item.file))
      }

      const opciones = variantes
        .map((v) => ({ ...v, nombre: v.nombre.trim() }))
        .filter((v) => v.nombre !== '')
      const nombresUnicos = new Set(opciones.map((v) => v.nombre.toLowerCase()))
      if (nombresUnicos.size !== opciones.length) {
        throw new Error(`Hay dos opciones de ${etiquetaVariante.toLowerCase()} con el mismo nombre.`)
      }
      const conVariantes = opciones.length > 0

      // Solo guardamos los atributos con valor (los vacíos no ensucian la ficha).
      const atributosFinal = Object.fromEntries(
        Object.entries(atributos)
          .map(([k, v]) => [k, v.trim()])
          .filter(([, v]) => v !== ''),
      )

      const payload: Record<string, unknown> = {
        nombre,
        categoria_id: categoriaId,
        descripcion,
        precio: Number(precio) || 0,
        imagenes: imagenesFinal,
        imagen_url: imagenesFinal[0] ?? null, // portada para la grilla / compatibilidad (índice 0)
        activo,
        atributos: atributosFinal,
      }
      // Con variantes, el stock del producto es la suma de las opciones y lo
      // mantiene la base (migración 0015): no se manda.
      if (!conVariantes) payload.stock = Number(stock) || 0

      let productoId = producto?.id
      if (productoId) {
        // Primero las variantes (así, si se borran todas, el producto ya no
        // tiene variantes cuando le guardamos el stock a mano).
        await guardarVariantes(productoId, opciones, producto?.variantes ?? [])
        const { error } = await supabase.from('productos').update(payload).eq('id', productoId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('productos')
          .insert({ ...payload, stock: conVariantes ? 0 : payload.stock })
          .select('id')
          .single()
        if (error) throw error
        productoId = data.id as string
        await guardarVariantes(productoId, opciones, [])
      }
      onChanged() // Refresca los datos para que el cambio se vea al instante.
      onClose()
    } catch (err) {
      setError('No se pudo guardar: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!producto) return
    const ok = await confirmar({
      titulo: `¿Eliminar "${producto.nombre}"?`,
      mensaje: 'Esta acción no se puede deshacer.',
      textoOk: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    const { error } = await supabase.from('productos').delete().eq('id', producto.id)
    if (error) {
      setError('No se pudo eliminar: ' + error.message)
      return
    }
    onChanged() // Refresca la lista tras borrar.
    onClose()
  }

  return (
    <div
      className={open ? 'overlay open' : 'overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="handle" />
        <h2>{producto ? 'Editar producto' : 'Nuevo producto'}</h2>

        <form onSubmit={onSubmit}>
          <ImagePicker items={imagenes} onChange={onImagenesChange} onAddFiles={agregarFiles} />

          <div className="field">
            <label>Nombre</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Nombre del producto"
            />
          </div>

          <div className="field">
            <div className="field-label-row">
              <label>Categoría</label>
              <button type="button" className="link-btn" onClick={onGestionarCategorias}>
                Gestionar categorías
              </button>
            </div>
            <select
              value={mostrarNuevaCat ? '__new__' : categoriaId}
              onChange={(e) => onCategoriaChange(e.target.value)}
            >
              {categorias.length === 0 && <option value="">Sin categorías todavía</option>}
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
              <option value="__new__">+ Agregar categoría nueva...</option>
            </select>

            {mostrarNuevaCat && (
              <div className="new-cat-row">
                <input
                  type="text"
                  autoFocus
                  value={nuevaCat}
                  onChange={(e) => setNuevaCat(e.target.value)}
                  placeholder="Nombre de la categoría"
                />
                <button type="button" onClick={agregarCategoria}>
                  Agregar
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label>Descripción breve</label>
            <textarea
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tienda().catalogo.placeholderDescripcion}
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>Precio ({tienda().region.moneda})</label>
              <input
                type="number"
                min={0}
                required
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label>Stock</label>
              {variantes.length > 0 ? (
                // Con variantes el stock se carga por opción (abajo).
                <input type="number" value={stockTotalVariantes} readOnly disabled title="Suma de las opciones" />
              ) : (
                <input
                  type="number"
                  min={0}
                  required
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="0"
                />
              )}
            </div>
          </div>

          {/* Variantes: opciones con stock propio (Talle, Color...). */}
          <div className="field">
            <div className="field-label-row">
              <label>{etiquetaVariante}s (opcional)</label>
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  setVariantes((vs) => [...vs, { key: crypto.randomUUID(), nombre: '', stock: '0' }])
                }
              >
                + Agregar
              </button>
            </div>
            {variantes.length === 0 ? (
              <p className="field-hint">
                Sin opciones: se vende como un solo producto con el stock de arriba.
              </p>
            ) : (
              <div className="variantes-editor">
                {variantes.map((v, i) => (
                  <div className="variante-fila" key={v.key}>
                    <input
                      type="text"
                      value={v.nombre}
                      placeholder={`${etiquetaVariante} (ej. M)`}
                      aria-label={`Nombre de la opción ${i + 1}`}
                      onChange={(e) =>
                        setVariantes((vs) => vs.map((x) => (x.key === v.key ? { ...x, nombre: e.target.value } : x)))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      value={v.stock}
                      aria-label={`Stock de la opción ${i + 1}`}
                      onChange={(e) =>
                        setVariantes((vs) => vs.map((x) => (x.key === v.key ? { ...x, stock: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      className="variante-quitar"
                      aria-label={`Quitar opción ${i + 1}`}
                      onClick={() => setVariantes((vs) => vs.filter((x) => x.key !== v.key))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Datos extra del rubro (definidos en tienda.config.mjs → catalogo.atributos). */}
          {camposAtributos.map((a) => (
            <div className="field" key={a.clave}>
              <label>{a.etiqueta}</label>
              <input
                type="text"
                value={atributos[a.clave] ?? ''}
                onChange={(e) => setAtributos((prev) => ({ ...prev, [a.clave]: e.target.value }))}
              />
            </div>
          ))}

          <label className="switch-row">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span>
              <strong>Visible en la tienda</strong>
              <small>{t('admin.visibleAyuda')}</small>
            </span>
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="sheet-actions">
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar producto'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            {producto && (
              <button type="button" className="btn-danger-text" onClick={eliminar}>
                Eliminar producto
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
