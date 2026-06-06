import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export default function LoginPage() {
  const [mode, setMode]   = useState('login')
  const [form, setForm]   = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return }
    setLoading(true)

    try {
      if (mode === 'signup') {
        if (!form.name) { setError('Please enter your name.'); setLoading(false); return }
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return }
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, name: form.name, password: form.password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.detail || 'Registration failed.'); setLoading(false); return }
        login({ email: data.email, name: data.name })
        navigate('/profiles')
      } else {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.detail || 'Login failed.'); setLoading(false); return }
        login({ email: data.email, name: data.name })
        navigate('/profiles')
      }
    } catch (e) {
      setError('Cannot connect to server. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-bg-overlay" />
      <div className="login-logo">STREAMORA</div>

      <div className="login-card">
        <h1 className="login-heading">{mode === 'login' ? 'Log In' : 'Create Account'}</h1>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <input className="login-input" type="text" placeholder="Your name"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          )}
          <input className="login-input" type="email" placeholder="Email address"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input className="login-input" type="password" placeholder="Password"
            value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="login-toggle">
          {mode === 'login' ? (
            <>New to STREAMORA?{' '}
              <button onClick={() => { setMode('signup'); setError('') }}>Sign up now</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError('') }}>Log in</button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
