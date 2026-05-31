import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)           // { name, email, avatar }
  const [profile, setProfile] = useState(null)     // { name, avatar, color }
  const [sessionId, setSessionId] = useState(null)
  const [watchHistory, setWatchHistory] = useState([]) // list of {title, genres, release_year}
  const [continueWatching, setContinueWatching] = useState([]) // { movie, progress (0-1) }
  const [watchedMovies, setWatchedMovies] = useState(new Set()) // fully watched titles

  // Load from localStorage on mount
  useEffect(() => {
    const storedUser    = localStorage.getItem('nf_user')
    const storedProfile = localStorage.getItem('nf_profile')
    const storedSession = localStorage.getItem('nf_session')
    const storedHistory = localStorage.getItem('nf_history')
    const storedContinue = localStorage.getItem('nf_continue')
    const storedWatched = localStorage.getItem('nf_watched')

    if (storedUser)    setUser(JSON.parse(storedUser))
    if (storedProfile) setProfile(JSON.parse(storedProfile))
    if (storedSession) setSessionId(storedSession)
    else {
      const newSession = uuidv4()
      setSessionId(newSession)
      localStorage.setItem('nf_session', newSession)
    }
    if (storedHistory) setWatchHistory(JSON.parse(storedHistory))
    if (storedContinue) setContinueWatching(JSON.parse(storedContinue))
    if (storedWatched) setWatchedMovies(new Set(JSON.parse(storedWatched)))
  }, [])

  const login = useCallback((userData) => {
    setUser(userData)
    localStorage.setItem('nf_user', JSON.stringify(userData))
    // Generate fresh session on login
    const newSession = uuidv4()
    setSessionId(newSession)
    localStorage.setItem('nf_session', newSession)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setProfile(null)
    localStorage.removeItem('nf_user')
    localStorage.removeItem('nf_profile')
  }, [])

  const selectProfile = useCallback((profileData) => {
    setProfile(profileData)
    localStorage.setItem('nf_profile', JSON.stringify(profileData))
  }, [])

  const addToHistory = useCallback((movie) => {
    // Accept either a string (legacy) or a full movie object
    const item = typeof movie === 'string'
      ? { title: movie, genres: [], release_year: null }
      : { title: movie.title, genres: movie.genres || [], release_year: movie.release_year || null }

    setWatchHistory(prev => {
      const filtered = prev.filter(h => h.title !== item.title)
      const updated = [item, ...filtered].slice(0, 100)
      localStorage.setItem('nf_history', JSON.stringify(updated))
      return updated
    })
  }, [])

  const updateProgress = useCallback((movie, progress) => {
    setContinueWatching(prev => {
      const filtered = prev.filter(item => item.movie.title !== movie.title)
      let updated

      if (progress >= 0.9) {
        // Fully watched — move to watched set
        setWatchedMovies(prevWatched => {
          const newWatched = new Set(prevWatched)
          newWatched.add(movie.title)
          localStorage.setItem('nf_watched', JSON.stringify([...newWatched]))
          return newWatched
        })
        updated = filtered
      } else if (progress > 0.05) {
        // In progress — add to continue watching
        updated = [{ movie, progress }, ...filtered].slice(0, 20)
      } else {
        updated = filtered
      }

      localStorage.setItem('nf_continue', JSON.stringify(updated))
      return updated
    })
    addToHistory(movie)
  }, [addToHistory])

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      sessionId,
      watchHistory,
      continueWatching,
      watchedMovies,
      login,
      logout,
      selectProfile,
      addToHistory,
      updateProgress,
      isLoggedIn: !!user,
      hasProfile: !!profile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
