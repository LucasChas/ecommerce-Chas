import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import plataforma from '../../plataforma/plataforma.config.mjs'
import Landing from './Landing'
import Crear from './Crear'
import Ingresar from './Ingresar'
import Panel from './Panel'
import '../styles/catalog.css'
import '../styles/cart.css'
import '../styles/admin.css'
import './plataforma.css'

// App de la plataforma: todo lo que no es una tienda (/t/<slug>).
//   /          landing (propuesta, precio, contacto)
//   /crear     alta guiada de una tienda nueva
//   /ingresar  login de dueñas
//   /panel     "mis tiendas": estado, suscripción y accesos
export default function PlataformaApp() {
  useEffect(() => {
    document.title = `${plataforma.nombre} — ${plataforma.eslogan}`
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/crear" element={<Crear />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/panel" element={<Panel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
