import { useState, useEffect, useCallback } from 'react'
import { getTrailerKey } from '../api/client'
import { sendFeedback } from '../api/client'
import { useAuth } from '../context/AuthContext'
import './MovieModal.css'

export default function MovieModal({ movie, tmdbData, modelVariant, onClose }) {
  const { sessionId, updateProgress } = useAuth()
  const [trailerKey, setTrailerKey] = useState(null)
  const [showTrailer, setShowTrailer] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null)
  const [loadingTrailer, setLoadingTrailer] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Add to continue watching when modal opens
useEffect(() => {
  updateProgress(movie, 0.1)
}, [])

  const handlePlayTrailer = async () => {
    if (trailerKey) { setShowTrailer(true); return }
    setLoadingTrailer(true)
    const key = await getTrailerKey(tmdbData?.tmdbId)
    setLoadingTrailer(false)

    if (key) {
      setTrailerKey(key)
      setShowTrailer(true)
    } else {
      // Fallback: search YouTube
      const query = encodeURIComponent(`${movie.title} ${movie.release_year} official trailer`)
      window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank')
    }

    // Mark as started watching
    updateProgress(movie, 0.1)
  }

  const handleFeedback = async (signal) => {
    setFeedbackGiven(signal)
    try {
      await sendFeedback(sessionId, movie.item_id, signal, modelVariant)
    } catch (e) {
      console.error('Feedback error:', e)
    }
  }

  const backdrop = tmdbData?.backdropUrl || tmdbData?.posterUrl
  const overview = tmdbData?.overview || `${movie.title} (${movie.release_year})`

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()}>

        {/* Hero image / trailer */}
        <div className="modal-hero">
          {showTrailer && trailerKey ? (
            <iframe
              className="modal-trailer"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=0`}
              title={`${movie.title} trailer`}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <>
              {backdrop ? (
                <img src={backdrop} alt={movie.title} className="modal-backdrop-img" />
              ) : (
                <div className="modal-backdrop-placeholder" />
              )}
              <div className="modal-hero-overlay" />
            </>
          )}

          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Info */}
        <div className="modal-body">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">{movie.title}</h2>
              <div className="modal-meta">
                <span className="modal-year">{movie.release_year}</span>
                {tmdbData?.rating && (
                  <span className="modal-rating">★ {tmdbData.rating}</span>
                )}
                <div className="modal-genres">
                  {movie.genres?.map(g => (
                    <span key={g} className="modal-genre-tag">{g}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="modal-actions">
              <button
                className="modal-play-btn"
                onClick={handlePlayTrailer}
                disabled={loadingTrailer}
              >
                {loadingTrailer ? '...' : '▶  Play Trailer'}
              </button>

              <div className="modal-feedback">
                <button
                  className={`modal-feedback-btn ${feedbackGiven === 1 ? 'active' : ''}`}
                  onClick={() => handleFeedback(1)}
                  aria-label="I liked this"
                  title="I liked this"
                >
                  {feedbackGiven === 1 ? '👍' : '👍'}
                </button>
                <button
                  className={`modal-feedback-btn ${feedbackGiven === -1 ? 'active-down' : ''}`}
                  onClick={() => handleFeedback(-1)}
                  aria-label="Not for me"
                  title="Not for me"
                >
                  👎
                </button>
              </div>
            </div>
          </div>

          <p className="modal-overview">{overview}</p>
        </div>
      </div>
    </div>
  )
}
