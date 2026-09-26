import { useTienda } from '../tienda'

// Ornamento debajo del header del catálogo. Cuál se usa lo define la config
// (tema.ornamento): 'festón' dibuja el borde festoneado; 'ninguno' no dibuja
// nada. Para sumar otro, agregá el valor en src/tienda/tipos.ts y su CSS en
// catalog.css. (El nombre del componente quedó por compatibilidad.)
export default function Scallop({ flip = false }: { flip?: boolean }) {
  const { config } = useTienda()
  if (config.tema.ornamento === 'ninguno') return null
  return <div className={flip ? 'scallop flip' : 'scallop'} aria-hidden="true" />
}
