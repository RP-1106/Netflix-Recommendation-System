import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import './NotificationBell.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export default function NotificationBell({ onAccept }) {
  const { user } = useAuth()
  const [invites, setInvites]   = useState([])
  const [open, setOpen]         = useState(false)
  const bellRef = useRef(null)

  // Poll for pending invites every 8 seconds
  useEffect(() => {
    if (!user?.email) return
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/invite/pending/${encodeURIComponent(user.email)}`)
        const data = await res.json()
        setInvites(data.invites || [])
      } catch (e) {}
    }
    poll()
    const interval = setInterval(poll, 8000)
    return () => clearInterval(interval)
  }, [user?.email])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const respond = async (inviteId, action, invite) => {
    try {
      const res = await fetch(`${API_BASE}/invite/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId, action }),
      })
      const data = await res.json()
      setInvites(prev => prev.filter(i => i.id !== inviteId))
      if (action === 'accepted' && data.room_id) {
        onAccept({ roomId: data.room_id, movieId: invite.movie_id, movieTitle: invite.movie_title })
        setOpen(false)
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="bell-wrap" ref={bellRef}>
      <button className="bell-btn" onClick={() => setOpen(o => !o)}>
        🔔
        {invites.length > 0 && (
          <span className="bell-badge">{invites.length}</span>
        )}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-header">Notifications</div>
          {invites.length === 0 ? (
            <div className="bell-empty">No new notifications</div>
          ) : (
            invites.map(invite => (
              <div key={invite.id} className="bell-invite">
                <div className="bell-invite-text">
                  <strong>{invite.from_name}</strong> wants to watch
                  <br />
                  <em>"{invite.movie_title}"</em> with you
                </div>
                <div className="bell-invite-actions">
                  <button
                    className="bell-accept"
                    onClick={() => respond(invite.id, 'accepted', invite)}
                  >
                    Accept
                  </button>
                  <button
                    className="bell-decline"
                    onClick={() => respond(invite.id, 'declined', invite)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
