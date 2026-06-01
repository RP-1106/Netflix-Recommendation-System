import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => { try { return JSON.parse(localStorage.getItem('nf_user')) } catch { return null } })
  const [profile, setProfile] = useState(() => { try { return JSON.parse(localStorage.getItem('nf_profile')) } catch { return null } })
  const [profiles, setProfiles] = useState(() => { try { return JSON.parse(localStorage.getItem('nf_profiles')) || [] } catch { return [] } })

  const [sessionId] = useState(() => {
    let id = localStorage.getItem('nf_session')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('nf_session', id) }
    return id
  })

  const [watchHistory, setWatchHistory]         = useState([])
  const [continueWatching, setContinueWatching] = useState([])
  const [watchedMovies, setWatchedMovies]       = useState(new Set())

  // Load per-profile history from backend when profile changes
  useEffect(() => {
    if (!user?.email || !profile?.id) return
    const loadHistory = async () => {
      try {
        const res  = await fetch(`${API_BASE}/history/${encodeURIComponent(user.email)}/${profile.id}`)
        const data = await res.json()
        const hist = data.history || []
        setWatchHistory(hist)
        setWatchedMovies(new Set(hist.map(h => h.title || h)))
        localStorage.setItem('nf_history', JSON.stringify(hist))
      } catch {
        const stored = localStorage.getItem(`nf_history_${profile.id}`)
        if (stored) {
          const hist = JSON.parse(stored)
          setWatchHistory(hist)
          setWatchedMovies(new Set(hist.map(h => h.title || h)))
        }
      }
    }
    loadHistory()
  }, [user?.email, profile?.id])

  const saveHistoryToBackend = useCallback(async (history) => {
    if (!user?.email || !profile?.id) return
    try {
      await fetch(`${API_BASE}/history/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: user.email, profile_id: profile.id, history }),
      })
    } catch (e) { console.error('Failed to save history:', e) }
  }, [user?.email, profile?.id])

  const login = (userData) => {
    setUser(userData)
    localStorage.setItem('nf_user', JSON.stringify(userData))
    if (userData.profiles) {
      setProfiles(userData.profiles)
      localStorage.setItem('nf_profiles', JSON.stringify(userData.profiles))
    }
  }

  const logout = () => {
    setUser(null); setProfile(null); setProfiles([])
    setWatchHistory([]); setWatchedMovies(new Set())
    localStorage.removeItem('nf_user')
    localStorage.removeItem('nf_profile')
    localStorage.removeItem('nf_profiles')
    localStorage.removeItem('nf_history')
  }

  const selectProfile = (prof) => {
    setProfile(prof)
    setWatchHistory([])
    setWatchedMovies(new Set())
    setContinueWatching([])
    localStorage.setItem('nf_profile', JSON.stringify(prof))
  }

  const addToHistory = useCallback((movie) => {
    setWatchHistory(prev => {
      const filtered = prev.filter(m => (m.title || m) !== (movie.title || movie))
      const updated  = [movie, ...filtered].slice(0, 50)
      localStorage.setItem('nf_history', JSON.stringify(updated))
      localStorage.setItem(`nf_history_${profile?.id}`, JSON.stringify(updated))
      setWatchedMovies(new Set(updated.map(h => h.title || h)))
      saveHistoryToBackend(updated)
      return updated
    })
  }, [profile?.id, saveHistoryToBackend])

  const updateProgress = useCallback((movie, progress) => {
    addToHistory(movie)
    setContinueWatching(prev => {
      const filtered = prev.filter(cw => (cw.movie?.title || cw.movie) !== (movie.title || movie))
      return progress < 0.9 ? [{ movie, progress }, ...filtered].slice(0, 20) : filtered
    })
  }, [addToHistory])

  return (
    <AuthContext.Provider value={{
      user, profile, profiles, sessionId,
      watchHistory, continueWatching, watchedMovies,
      login, logout, selectProfile, addToHistory, updateProgress,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
