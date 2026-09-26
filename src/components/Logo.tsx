import { useTienda } from '../tienda'

// Logo de la tienda. Si la config tiene logoUrl (tienda/public o subido desde
// el admin) se muestra la imagen; si no, el nombre como logo de texto.
export default function Logo({ className = 'logo-img' }: { className?: string }) {
  const { config } = useTienda()
  if (config.logoUrl) {
    return <img className={className} src={config.logoUrl} alt={config.nombre} />
  }
  return <span className={`${className} logo-texto`}>{config.nombre}</span>
}
