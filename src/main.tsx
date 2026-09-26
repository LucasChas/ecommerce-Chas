import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { DialogProvider } from './context/DialogContext'
import { TiendaProvider } from './tienda'
import './styles/tokens.css'
import './styles/global.css'
// Ajustes de estilo propios de la tienda: van después del núcleo para pisarlo.
import '../tienda/tema.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TiendaProvider>
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
