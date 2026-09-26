import { useState } from 'react'
import type { ProductoConCategoria, Variante } from '../../types'
import { useCart } from '../../context/CartContext'
import { useTienda } from '../../tienda'
import { t } from '../../i18n/textos'

// Selector de variante (si el producto tiene) + cantidad + "Agregar al
// carrito", para la ficha del producto. Si no hay stock, no se muestra (se
// consulta por WhatsApp/Instagram).
export default function AddToCart({ producto }: { producto: ProductoConCategoria }) {
  const { agregar } = useCart()
  const etiqueta = useTienda().config.catalogo.etiquetaVariante
  const conVariantes = producto.variantes.length > 0
  const [variante, setVariante] = useState<Variante | null>(() =>
    // Si hay una sola opción con stock, viene elegida.
    producto.variantes.filter((v) => v.stock > 0).length === 1
      ? producto.variantes.find((v) => v.stock > 0) ?? null
      : null,
  )
  const [cantidad, setCantidad] = useState(1)
  const [agregado, setAgregado] = useState(false)

  if (producto.stock <= 0) return null

  // Tope de cantidad: el stock de la variante elegida o el del producto.
  const tope = conVariantes ? variante?.stock ?? 0 : producto.stock
  const falta = conVariantes && !variante

  const bajar = () => setCantidad((c) => Math.max(1, c - 1))
  const subir = () => setCantidad((c) => Math.min(Math.max(tope, 1), c + 1))

  function elegir(v: Variante) {
    setVariante(v)
    setCantidad((c) => Math.min(c, v.stock))
  }

  function onAgregar() {
    if (falta) return
    agregar(producto, cantidad, variante)
    setAgregado(true)
    // Mensaje "agregado" temporal.
    window.setTimeout(() => setAgregado(false), 1800)
  }

  return (
    <>
      {conVariantes && (
        <div className="variantes">
          <p className="variantes-label">
            {etiqueta}
            {variante && <strong>: {variante.nombre}</strong>}
          </p>
          <div className="variantes-opciones" role="radiogroup" aria-label={etiqueta}>
            {producto.variantes.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={variante?.id === v.id}
                className={variante?.id === v.id ? 'variante activa' : 'variante'}
                disabled={v.stock <= 0}
                title={v.stock <= 0 ? 'Sin stock' : undefined}
                onClick={() => elegir(v)}
              >
                {v.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="add-cart">
        <div className="qty">
          <button type="button" onClick={bajar} aria-label="Restar">
            −
          </button>
          <span>{cantidad}</span>
          <button type="button" onClick={subir} aria-label="Sumar">
            +
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary add-cart-btn"
          onClick={onAgregar}
          disabled={falta}
        >
          {agregado ? (
            <span className="added-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="added-check-ic"
                aria-hidden="true"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              Agregado
            </span>
          ) : falta ? (
            t('producto.elegirVariante', { variante: etiqueta.toLowerCase() })
          ) : (
            'Agregar al carrito'
          )}
        </button>
      </div>
    </>
  )
}
