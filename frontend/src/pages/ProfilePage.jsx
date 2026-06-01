import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './ProfilePage.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const AVATAR_OPTIONS = [
  { icon: '🎬', color: '#e50914' },
  { icon: '🎭', color: '#0080ff' },
  { icon: '⭐', color: '#ffb800' },
  { icon: '🎪', color: '#00b894' },
  { icon: '🚀', color: '#6c5ce7' },
  { icon: '🎵', color: '#fd79a8' },
  { icon: '🏆', color: '#e17055' },
  { icon: '🌙', color: '#2d3436' },
  { icon: '🎮', color: '#00cec9' },
  { icon: '🦁', color: '#fdcb6e' },
  { icon: '🐉', color: '#d63031' },
  { icon: '🌺', color: '#e84393' },
]

export default function ProfilePage() {
  const { profiles, selectProfile, login, user } = useAuth()
  const navigate = useNavigate()
  const [showAdd, setShowAdd]         = useState(false)
  const [newName, setNewName]         = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const handleSelect = (profile) => {
    selectProfile(profile)
    navigate('/')
  }

  const handleAddProfile = async () => {
    if (!newName.trim()) { setError('Please enter a name.'); return }
    setSaving(true)
    setError('')
    try {
      const res  = await fetch(`${API_BASE}/profiles/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: user?.email,
          name: newName.trim(),
          color: selectedAvatar.color,
          icon: selectedAvatar.icon,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Failed to create profile.'); setSaving(false); return }

      // Update profiles in auth context
      const updatedProfiles = [...profiles, data]
      login({ ...user, profiles: updatedProfiles })

      setShowAdd(false)
      setNewName('')
      setSelectedAvatar(AVATAR_OPTIONS[0])
    } catch (e) {
      setError('Could not connect to server.')
    }
    setSaving(false)
  }

  return (
    <div className="profile-page">
      <div className="profile-logo">NETFLX</div>
      <div className="profile-content">

        {!showAdd ? (
          <>
            <h1 className="profile-heading">Who's watching?</h1>
            <div className="profile-grid">
              {profiles.map(p => (
                <div key={p.id} className="profile-item" onClick={() => handleSelect(p)}
                  role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleSelect(p)}>
                  <div className="profile-icon-wrap" style={{ background: p.color }}>
                    <span className="profile-icon">{p.icon}</span>
                  </div>
                  <span className="profile-name">{p.name}</span>
                </div>
              ))}

              {profiles.length < 6 && (
                <div className="profile-item" onClick={() => setShowAdd(true)} role="button" tabIndex={0}>
                  <div className="profile-icon-wrap profile-add">
                    <span className="profile-add-icon">+</span>
                  </div>
                  <span className="profile-name">Add Profile</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="profile-heading">Create Profile</h1>
            <div className="add-profile-form">
              <input
                className="add-profile-input"
                type="text"
                placeholder="Profile name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddProfile()}
                autoFocus
              />

              <p className="avatar-label">Choose an avatar</p>
              <div className="avatar-grid">
                {AVATAR_OPTIONS.map((av, i) => (
                  <div
                    key={i}
                    className={`avatar-option ${selectedAvatar === av ? 'selected' : ''}`}
                    style={{ background: av.color }}
                    onClick={() => setSelectedAvatar(av)}
                  >
                    <span style={{ fontSize: '28px' }}>{av.icon}</span>
                  </div>
                ))}
              </div>

              {error && <p className="add-profile-error">{error}</p>}

              <div className="add-profile-actions">
                <button className="add-profile-save" onClick={handleAddProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
                <button className="add-profile-cancel" onClick={() => { setShowAdd(false); setError('') }}>
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
