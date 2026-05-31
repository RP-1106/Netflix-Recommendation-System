import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

// Simple local user store using localStorage
const USERS_KEY = 'nf_users'

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}')
  } catch { return {} }
}

function saveUser(email, userData) {
  const users = getUsers()
  users[email.toLowerCase()] = userData
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function findUser(email) {
  return getUsers()[email.toLowerCase()] || null
}

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.email || !form.password) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    await new Promise(r => setTimeout(r, 400))

    if (mode === 'signup') {
      if (!form.name) { setError('Please enter your name.'); setLoading(false); return }
      if (form.password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return }

      // Check if user already exists
      if (findUser(form.email)) {
        setError('An account with this email already exists. Please sign in.')
        setLoading(false)
        return
      }

      // Save new user
      const userData = { name: form.name, email: form.email.toLowerCase(), password: form.password }
      saveUser(form.email, userData)
      login({ name: form.name, email: form.email.toLowerCase() })
      navigate('/profiles')

    } else {
      // Login
      const user = findUser(form.email)
      if (!user) {
        setError("No account found with this email. Please sign up first.")
        setLoading(false)
        return
      }
      if (user.password !== form.password) {
        setError('Incorrect password. Please try again.')
        setLoading(false)
        return
      }
      login({ name: user.name, email: user.email })
      navigate('/profiles')
    }

    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-bg-overlay" />
      <div className="login-logo">NETFLX</div>

      <div className="login-card">
        <h1 className="login-heading">
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </h1>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <input
              className="login-input"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoComplete="name"
            />
          )}
          <input
            className="login-input"
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            autoComplete="email"
          />
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="login-toggle">
          {mode === 'login' ? (
            <>New to NETFLX?{' '}
              <button onClick={() => { setMode('signup'); setError('') }}>Sign up now</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError('') }}>Sign in</button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
