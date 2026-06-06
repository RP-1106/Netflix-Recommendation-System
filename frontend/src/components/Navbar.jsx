import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SearchBar from './SearchBar'
import NotificationBell from './NotificationBell'
import './Navbar.css'

export default function Navbar({ onSearch, activePage, onPageChange, onJoinParty }) {
  const { user, profile, logout, selectProfile } = useAuth()
  const navigate    = useNavigate()
  const [showSearch, setShowSearch] = useState(false)
  const [scrolled, setScrolled]     = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navLinks = [
    { id: 'home',       label: 'Home' },
    { id: 'tvshows',    label: 'TV Shows' },
    { id: 'movies',     label: 'Movies' },
    { id: 'newpopular', label: 'New & Popular' },
    { id: 'mylist',     label: 'My List' },
  ]

  const avatarColor  = profile?.color || '#e50914'
  const avatarLetter = (profile?.name || user?.name || 'U')[0].toUpperCase()

  const handleSwitchProfile = () => {
    selectProfile(null)
    navigate('/profiles')
  }

  const handleSignOut = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => onPageChange('home')}>STREAMORA</div>
        <div className="navbar-links">
          {navLinks.map(link => (
            <span
              key={link.id}
              className={activePage === link.id ? 'nav-active' : ''}
              onClick={() => onPageChange(link.id)}
            >
              {link.label}
            </span>
          ))}
        </div>
      </div>

      <div className="navbar-right">
        <div ref={searchRef} style={{ position: 'relative' }}>
          <button className="navbar-search-btn" onClick={() => setShowSearch(s => !s)}>🔍</button>
          {showSearch && (
            <SearchBar
              onSearch={(movie, tmdbData) => { onSearch?.(movie, tmdbData); setShowSearch(false) }}
              onClose={() => setShowSearch(false)}
            />
          )}
        </div>

        <NotificationBell onAccept={onJoinParty} />

        <div className="navbar-profile">
          <div className="profile-avatar" style={{ background: avatarColor }}>
            {avatarLetter}
          </div>
          <div className="profile-dropdown">
            <div className="dropdown-name">{profile?.name || user?.name}</div>
            <div style={{ padding: '0 16px 8px', fontSize: '11px', color: '#555' }}>
              {user?.email}
            </div>
            <div className="dropdown-divider" />
            <button onClick={handleSwitchProfile}>Switch Profile</button>
            <button onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>
    </nav>
  )
}
