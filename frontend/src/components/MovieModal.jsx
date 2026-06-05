import { useState, useEffect, useCallback } from 'react'
import { getTrailerKey, getTMDBData, sendFeedback } from '../api/client'
import { useAuth } from '../context/AuthContext'
import WatchTogetherModal from './WatchTogetherModal'
import './MovieModal.css'

export default function MovieModal({ movie, tmdbData: initialTmdbData, modelVariant, onClose, onWatchTogether, source }) {
  const { sessionId, addToContinueWatching, addToWatchAgain } = useAuth()
  const [tmdbData, setTmdbData]           = useState(initialTmdbData || null)
  const [trailerKey, setTrailerKey]       = useState(null)
  const [showTrailer, setShowTrailer]     = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null)
  const [loadingTrailer, setLoadingTrailer] = useState(false)
  const [showWatchTogether, setShowWatchTogether] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch TMDB data if not provided (fixes Issue 2 — poster consistency & Issue 4 — correct trailer)
  useEffect(() => {
    if (!initialTmdbData && movie?.title) {
      getTMDBData(movie.title, movie.release_year).then(data => {
        if (data) setTmdbData(data)
      })
    }
  }, [movie?.title, movie?.release_year, initialTmdbData])

  // Issue 3: Opening modal adds to Continue Watching (via hero Play/More Info or card click)
  // Only if source is NOT 'search_feedback' — feedback handled separately
  useEffect(() => {
    if (source !== 'feedback_only') {
      addToContinueWatching(movie)
    }
  }, [])

  // Issue 4: Fix trailer — use fetched tmdbData, search by title if needed
  const handlePlayTrailer = async () => {
    addToContinueWatching(movie)
    if (trailerKey) { setShowTrailer(true); return }
    setLoadingTrailer(true)

    // Try with current tmdbData first
    let key = tmdbData?.tmdbId ? await getTrailerKey(tmdbData.tmdbId, tmdbData.mediaType || 'movie') : null

    // If no key, fetch TMDB data by title and try again
    if (!key) {
      const fetched = await getTMDBData(movie.title, movie.release_year)
      if (fetched?.tmdbId) {
        setTmdbData(fetched)
        key = await getTrailerKey(fetched.tmdbId, fetched.mediaType || 'movie')
      }
    }

    setLoadingTrailer(false)
    if (key) {
      setTrailerKey(key)
      setShowTrailer(true)
    } else {
      const query = encodeURIComponent(`${movie.title} ${movie.release_year} official trailer`)
      window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank')
    }
  }

  // Issue 3: Feedback adds to Watch Again, removes from Continue Watching
  const handleFeedback = async (signal) => {
    setFeedbackGiven(signal)
    addToWatchAgain(movie)
    try {
      await sendFeedback(sessionId, movie.item_id, signal, modelVariant)
    } catch (e) { console.error('Feedback error:', e) }
  }

  const backdrop = tmdbData?.backdropUrl || tmdbData?.posterUrl
  const overview = tmdbData?.overview || `${movie.title} (${movie.release_year})`

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="modal-content" onClick={e => e.stopPropagation()}>

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
                {backdrop
                  ? <img src={backdrop} alt={movie.title} className="modal-backdrop-img" />
                  : <div className="modal-backdrop-placeholder" />
                }
                <div className="modal-hero-overlay" />
              </>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="modal-body">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{movie.title}</h2>
                <div className="modal-meta">
                  <span className="modal-year">{movie.release_year}</span>
                  {tmdbData?.rating && <span className="modal-rating">★ {tmdbData.rating}</span>}
                  <div className="modal-genres">
                    {movie.genres?.map(g => <span key={g} className="modal-genre-tag">{g}</span>)}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="modal-play-btn" onClick={handlePlayTrailer} disabled={loadingTrailer}>
                  {loadingTrailer ? '...' : '▶  Play Trailer'}
                </button>

                <button className="modal-watch-together-btn"
                  onClick={() => { addToContinueWatching(movie); setShowWatchTogether(true) }}
                  title="Watch with a friend">
                  👥 Watch Together
                </button>

                <div className="modal-feedback">
                  <button className={`modal-feedback-btn ${feedbackGiven === 1 ? 'active' : ''}`}
                    onClick={() => handleFeedback(1)} title="I liked this">👍</button>
                  <button className={`modal-feedback-btn ${feedbackGiven === -1 ? 'active-down' : ''}`}
                    onClick={() => handleFeedback(-1)} title="Not for me">👎</button>
                </div>
              </div>
            </div>
            <p className="modal-overview">{overview}</p>
          </div>
        </div>
      </div>

      {showWatchTogether && (
        <WatchTogetherModal
          movie={movie}
          onClose={() => setShowWatchTogether(false)}
          onPartyStart={(party) => {
            setShowWatchTogether(false)
            onClose()
            onWatchTogether?.(party)
          }}
        />
      )}
    </>
  )
}