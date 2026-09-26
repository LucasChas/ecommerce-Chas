import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordInput from '../components/common/PasswordInput'
import CabeceraPlataforma from './CabeceraPlataforma'

// Login de dueñas de tiendas: lleva a "Mis tiendas".
export default function Ingresar() {
  const { session, loading, ingresar } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (loading) return null
  if (session) return <Navigate to="/panel" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const { error } = await ingresar(email, password)
    setError(error)
    setEnviando(false)
  }

  return (
    <div className="plat">
      <CabeceraPlataforma simple />
      <main className="plat-alta">
        <form className="plat-card" onSubmit={onSubmit}>
          <h1>Ingresá a tu cuenta</h1>
          <div className="field">
            <label htmlFor="campo-1">Email</label>
            <input id="campo-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="campo-2">Contraseña</label>
            <PasswordInput id="campo-2" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
          <Link className="plat-link" to="/crear">
            ¿Todavía no tenés tienda? Creala
          </Link>
        </form>
      </main>
    </div>
  )
}
