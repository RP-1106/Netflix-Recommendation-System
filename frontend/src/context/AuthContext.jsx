import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const AuthContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(() => { try { return JSON.parse(localStorage.getItem('nf_user')) } catch { return null } })
  const [profile, setProfile] = useState(() => { try { return JSON.parse(localStorage.getItem('nf_profile')) } catch { return null } })
  const [profiles, setProfiles] = useState(() => { try { return JSON.parse(localStorage.getItem('nf_profiles')) || [] } catch { return [] } })

  const [sessionId] = useState(() => {
    let id = localStorage.getItem('nf_session')
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
      localStorage.setItem('nf_session', id)
    }
    return id
  })

  const [watchHistory, setWatchHistory]         = useState([])
  const [continueWatching, setContinueWatching] = useState([])
  const [watchAgain, setWatchAgain]             = useState([])
  const [watchedMovies, setWatchedMovies]       = useState(new Set())

  // Use refs to always have latest values in callbacks
  const profileRef = useRef(profile)
  const userRef    = useRef(user)
  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => { userRef.current = user }, [user])

  // On mount — re-fetch profiles if missing
  useEffect(() => {
    if (user?.email && profiles.length === 0) {
      fetch(`${API_BASE}/profiles/${encodeURIComponent(user.email)}`)
        .then(r => r.json())
        .then(data => {
          if (data.profiles?.length > 0) {
            setProfiles(data.profiles)
            localStorage.setItem('nf_profiles', JSON.stringify(data.profiles))
          }
        })
        .catch(() => {})
    }
  }, [user?.email])

  // Load all profile data from backend when profile changes
  useEffect(() => {
    if (!user?.email || !profile?.id) return
    const load = async () => {
      try {
        const [histRes, cwRes, waRes] = await Promise.all([
          fetch(`${API_BASE}/history/${encodeURIComponent(user.email)}/${profile.id}`),
          fetch(`${API_BASE}/continue-watching/${encodeURIComponent(user.email)}/${profile.id}`),
          fetch(`${API_BASE}/watch-again/${encodeURIComponent(user.email)}/${profile.id}`),
        ])
        const histData = await histRes.json()
        const cwData   = await cwRes.json()
        const waData   = await waRes.json()

        const hist = histData.history || []
        setWatchHistory(hist)
        setWatchedMovies(new Set(hist.map(h => h.title || h)))
        localStorage.setItem('nf_history', JSON.stringify(hist))
        localStorage.setItem(`nf_history_${profile.id}`, JSON.stringify(hist))

        const cw = cwData.items || []
        setContinueWatching(cw)
        localStorage.setItem(`nf_continue_${profile.id}`, JSON.stringify(cw))

        const wa = waData.items || []
        setWatchAgain(wa)
        localStorage.setItem(`nf_watchagain_${profile.id}`, JSON.stringify(wa))
      } catch {
        // Fallback to localStorage
        const hist = JSON.parse(localStorage.getItem(`nf_history_${profile.id}`) || '[]')
        setWatchHistory(hist)
        setWatchedMovies(new Set(hist.map(h => h.title || h)))
        const cw = JSON.parse(localStorage.getItem(`nf_continue_${profile.id}`) || '[]')
        setContinueWatching(cw)
        const wa = JSON.parse(localStorage.getItem(`nf_watchagain_${profile.id}`) || '[]')
        setWatchAgain(wa)
      }
    }
    load()
  }, [user?.email, profile?.id])

  // ── Backend save helpers ────────────────────────────────────────────────
  const saveHistoryToBackend = useCallback(async (history) => {
    const u = userRef.current
    const p = profileRef.current
    if (!u?.email || !p?.id) return
    try {
      await fetch(`${API_BASE}/history/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: u.email, profile_id: p.id, history }),
      })
    } catch {}
  }, [])

  const saveCWToBackend = useCallback(async (items) => {
    const u = userRef.current
    const p = profileRef.current
    if (!u?.email || !p?.id) return
    try {
      await fetch(`${API_BASE}/continue-watching/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: u.email, profile_id: p.id, items }),
      })
    } catch {}
  }, [])

  const saveWAToBackend = useCallback(async (items) => {
    const u = userRef.current
    const p = profileRef.current
    if (!u?.email || !p?.id) return
    try {
      await fetch(`${API_BASE}/watch-again/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: u.email, profile_id: p.id, items }),
      })
    } catch {}
  }, [])

  // ── Auth actions ────────────────────────────────────────────────────────
  const login = useCallback((userData) => {
    const userToStore = { email: userData.email, name: userData.name }
    setUser(userToStore)
    userRef.current = userToStore
    localStorage.setItem('nf_user', JSON.stringify(userToStore))
    if (userData.profiles?.length > 0) {
      setProfiles(userData.profiles)
      localStorage.setItem('nf_profiles', JSON.stringify(userData.profiles))
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null); setProfile(null); setProfiles([])
    setWatchHistory([]); setWatchedMovies(new Set())
    setContinueWatching([]); setWatchAgain([])
    userRef.current = null
    profileRef.current = null
    localStorage.removeItem('nf_user')
    localStorage.removeItem('nf_profile')
    localStorage.removeItem('nf_profiles')
    localStorage.removeItem('nf_history')
  }, [])

  const selectProfile = useCallback((prof) => {
    setProfile(prof)
    profileRef.current = prof
    setWatchHistory([]); setWatchedMovies(new Set())
    setContinueWatching([]); setWatchAgain([])
    if (prof) localStorage.setItem('nf_profile', JSON.stringify(prof))
    else localStorage.removeItem('nf_profile')
  }, [])

  // ── History & list management ───────────────────────────────────────────
  const addToHistory = useCallback((movie) => {
    const p = profileRef.current
    setWatchHistory(prev => {
      const filtered = prev.filter(m => (m.title || m) !== (movie.title || movie))
      const updated  = [movie, ...filtered].slice(0, 50)
      localStorage.setItem('nf_history', JSON.stringify(updated))
      if (p?.id) localStorage.setItem(`nf_history_${p.id}`, JSON.stringify(updated))
      setWatchedMovies(new Set(updated.map(h => h.title || h)))
      saveHistoryToBackend(updated)
      return updated
    })
  }, [saveHistoryToBackend])

  const addToContinueWatching = useCallback((movie) => {
    const p = profileRef.current
    addToHistory(movie)
    setWatchAgain(prev => {
      const updated = prev.filter(m => (m.title || m) !== (movie.title || movie))
      if (p?.id) localStorage.setItem(`nf_watchagain_${p.id}`, JSON.stringify(updated))
      saveWAToBackend(updated)
      return updated
    })
    setContinueWatching(prev => {
      const filtered = prev.filter(cw => (cw.movie?.title || cw.movie) !== (movie.title || movie))
      const updated  = [{ movie, progress: 0.1 }, ...filtered].slice(0, 20)
      if (p?.id) localStorage.setItem(`nf_continue_${p.id}`, JSON.stringify(updated))
      saveCWToBackend(updated)
      return updated
    })
  }, [addToHistory, saveCWToBackend, saveWAToBackend])

  const addToWatchAgain = useCallback((movie) => {
    const p = profileRef.current
    addToHistory(movie)
    setContinueWatching(prev => {
      const updated = prev.filter(cw => (cw.movie?.title || cw.movie) !== (movie.title || movie))
      if (p?.id) localStorage.setItem(`nf_continue_${p.id}`, JSON.stringify(updated))
      saveCWToBackend(updated)
      return updated
    })
    setWatchAgain(prev => {
      const filtered = prev.filter(m => (m.title || m) !== (movie.title || movie))
      const updated  = [movie, ...filtered].slice(0, 20)
      if (p?.id) localStorage.setItem(`nf_watchagain_${p.id}`, JSON.stringify(updated))
      saveWAToBackend(updated)
      return updated
    })
  }, [addToHistory, saveCWToBackend, saveWAToBackend])

  const updateProgress = useCallback((movie, progress) => {
    if (progress < 0.9) addToContinueWatching(movie)
    else addToWatchAgain(movie)
  }, [addToContinueWatching, addToWatchAgain])

  return (
    <AuthContext.Provider value={{
      user, profile, profiles, sessionId,
      watchHistory, continueWatching, watchAgain, watchedMovies,
      login, logout, selectProfile,
      addToHistory, updateProgress,
      addToContinueWatching, addToWatchAgain,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)