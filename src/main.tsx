import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PlataformaApp from './plataforma/PlataformaApp'
import TiendaNoEncontrada from './pages/TiendaNoEncontrada'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { DialogProvider } from './context/DialogContext'
import { TiendaProvider } from './tienda'
import { SLUG } from './lib/contexto'
import './styles/tokens.css'
import './styles/global.css'
// Ajustes de estilo comunes a todas las tiendas: van después del núcleo para pisarlo.
import '../tienda/tema.css'

const raiz = ReactDOM.createRoot(document.getElementById('root')!)

if (SLUG) {
  // /t/<slug>/... → la tienda (vitrina y su panel).
  raiz.render(
    <React.StrictMode>
      <TiendaProvider slug={SLUG} noExiste={<TiendaNoEncontrada />}>
        <DialogProvider>
          <AuthProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </AuthProvider>
        </DialogProvider>
      </TiendaProvider>
    </React.StrictMode>,
  )
} else {
  // Cualquier otra ruta → la plataforma (landing, alta, panel de la cuenta).
  raiz.render(
    <React.StrictMode>
      <DialogProvider>
        <AuthProvider>
          <PlataformaApp />
        </AuthProvider>
      </DialogProvider>
    </React.StrictMode>,
  )
}
