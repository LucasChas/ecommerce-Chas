import { useTienda } from '../tienda'

// Ornamento debajo del header del catálogo. Cuál se usa lo define el tema
// (tema.ornamento): 'festón' (borde festoneado), 'onda', 'línea' o 'ninguno'.
// Para sumar otro, agregá el valor en src/tienda/tipos.ts y su CSS en
// catalog.css (.ornamento-<nombre>). El nombre del componente quedó por
// compatibilidad.
const CLASES = { festón: 'scallop', onda: 'ornamento-onda', línea: 'ornamento-linea' } as const

export default function Scallop({ flip = false }: { flip?: boolean }) {
  const { ornamento } = useTienda().config.tema
  if (ornamento === 'ninguno') return null
  const clase = CLASES[ornamento]
  return <div className={flip ? `${clase} flip` : clase} aria-hidden="true" />
}
