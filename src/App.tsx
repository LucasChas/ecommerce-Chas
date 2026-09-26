import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import CatalogPage from './pages/CatalogPage'
import ProductPage from './pages/ProductPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import AccountPage from './pages/AccountPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MyOrdersPage from './pages/MyOrdersPage'
import AdminPage from './pages/AdminPage'
import CartDrawer from './components/cart/CartDrawer'
import Footer from './components/catalog/Footer'
import { PrivacyPage } from './pages/PrivacyPage'
import PaymentResultPage from './pages/PaymentResultPage'
import { TermsPage } from './pages/TermsPage'
import { tienda } from './tienda'
import { BASE } from './lib/contexto'
import TiendaPausada from './pages/TiendaPausada'
// Layout del catálogo: monta el carrito lateral (drawer) una sola vez, disponible
// en todas las vistas públicas (muestrario, producto, carrito, checkout).
function CatalogLayout() {
  return (
    <>
      <Outlet />
      <Footer />
      {tienda().features.carrito && <CartDrawer />}
    </>
  )
}

// Rutas públicas de la tienda.
// Las de carrito y cuentas solo existen si la tienda tiene esas features
// (tienda.config.mjs → features); si no, caen en el redirect a "/".
function RutasCatalogo() {
  const { carrito, cuentas } = tienda().features
  return (
    <Route element={<CatalogLayout />}>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/producto/:param" element={<ProductPage />} />
      {carrito && <Route path="/carrito" element={<CartPage />} />}
      {carrito && <Route path="/checkout" element={<CheckoutPage />} />}
      {cuentas && <Route path="/cuenta" element={<AccountPage />} />}
      {cuentas && <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />}
      {cuentas && <Route path="/mis-pedidos" element={<MyOrdersPage />} />}
      {carrito && <Route path="/pago/resultado" element={<PaymentResultPage />} />}
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/terminos" element={<TermsPage />} />
    </Route>
  )
}

// App de UNA tienda de la plataforma. El router usa BASE ("/t/<slug>") como
// basename, así que todas las rutas y links de la tienda se escriben igual
// que si fuera la única ("/carrito", "/admin"...).
//
// Si la tienda está pausada (prueba vencida sin suscripción, o suspendida),
// la vitrina muestra un aviso y solo queda abierto su panel (/admin), para
// que la dueña pueda regularizarla.
export default function App() {
  const { habilitada } = tienda()
  return (
    <BrowserRouter basename={BASE}>
      <Routes>
        {habilitada ? RutasCatalogo() : <Route path="*" element={<TiendaPausada />} />}
        <Route path="/admin" element={<AdminPage />} />
        {habilitada && <Route path="*" element={<Navigate to="/" replace />} />}
      </Routes>
    </BrowserRouter>
  )
}
