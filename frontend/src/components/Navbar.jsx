import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SearchBar from './SearchBar'
import './Navbar.css'

export default function Navbar({ onSearch }) {
  const [scrolled, setScrolled] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => navigate('/home')}>
          NETFLX
        </div>
        <div className="navbar-links">
          <span onClick={() => navigate('/home')}>Home</span>
          <span>TV Shows</span>
          <span>Movies</span>
          <span>New & Popular</span>
          <span>My List</span>
        </div>
      </div>

      <div className="navbar-right">
        {showSearch ? (
          <SearchBar
            onSearch={onSearch}
            onClose={() => setShowSearch(false)}
          />
        ) : (
          <button
            className="navbar-search-btn"
            onClick={() => setShowSearch(true)}
            aria-label="Search"
          >
            🔍
          </button>
        )}

        <div className="navbar-profile">
          <div
            className="profile-avatar"
            style={{ background: profile?.color || '#e50914' }}
          >
            {profile?.name?.[0] || user?.name?.[0] || 'U'}
          </div>
          <div className="profile-dropdown">
            <div className="dropdown-name">{profile?.name || user?.name}</div>
            <div className="dropdown-divider" />
            <button onClick={() => navigate('/profiles')}>Switch Profile</button>
            <button onClick={() => navigate('/profiles')}>Manage Profiles</button>
            <div className="dropdown-divider" />
            <button onClick={handleLogout}>Sign out of NETFLX</button>
          </div>
        </div>
      </div>
    </nav>
  )
}
