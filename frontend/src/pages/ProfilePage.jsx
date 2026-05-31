import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './ProfilePage.css'

const PROFILES = [
  { name: 'You',      color: '#e50914', icon: '🎬' },
  { name: 'Partner',  color: '#0080ff', icon: '🎭' },
  { name: 'Kids',     color: '#ffb800', icon: '🌟' },
  { name: 'Guest',    color: '#00b894', icon: '🎪' },
]

export default function ProfilePage() {
  const [managing, setManaging] = useState(false)
  const { selectProfile, user } = useAuth()
  const navigate = useNavigate()

  const handleSelect = (profile) => {
    if (managing) return
    selectProfile(profile)
    navigate('/home')
  }

  return (
    <div className="profile-page">
      <div className="profile-logo">NETFLX</div>

      <div className="profile-content">
        <h1 className="profile-heading">
          {managing ? 'Manage Profiles' : "Who's watching?"}
        </h1>

        <div className="profile-grid">
          {PROFILES.map((p) => (
            <div
              key={p.name}
              className={`profile-item ${managing ? 'managing' : ''}`}
              onClick={() => handleSelect(p)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleSelect(p)}
            >
              <div className="profile-icon-wrap" style={{ background: p.color }}>
                <span className="profile-icon">{p.icon}</span>
                {managing && <div className="profile-edit-overlay">✏️</div>}
              </div>
              <span className="profile-name">{p.name}</span>
            </div>
          ))}

          {/* Add profile */}
          <div className="profile-item">
            <div className="profile-icon-wrap profile-add">
              <span className="profile-add-icon">+</span>
            </div>
            <span className="profile-name">Add Profile</span>
          </div>
        </div>

        <button
          className="profile-manage-btn"
          onClick={() => setManaging(m => !m)}
        >
          {managing ? 'Done' : 'Manage Profiles'}
        </button>
      </div>
    </div>
  )
}
