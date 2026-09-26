import AccountButton from './AccountButton'
import CartIcon from '../cart/CartIcon'
import { useTienda } from '../../tienda'

// Acciones del header del muestrario: cuenta + carrito (según las features
// activas de la tienda).
export default function HeaderActions() {
  const { features } = useTienda().config
  if (!features.cuentas && !features.carrito) return null
  return (
    <div className="header-actions">
      {features.cuentas && <AccountButton />}
      {features.carrito && <CartIcon />}
    </div>
  )
}
