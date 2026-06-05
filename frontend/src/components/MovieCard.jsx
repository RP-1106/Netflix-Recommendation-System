import { useState, useEffect } from 'react'
import { getTMDBData } from '../api/client'
import './MovieCard.css'

export default function MovieCard({ movie, onMovieClick, showFeedback = false, modelVariant, onFeedback }) {
  const [tmdbData, setTmdbData] = useState(null)
  const [hovered, setHovered]   = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null)

  useEffect(() => {
    let cancelled = false
    getTMDBData(movie.title, movie.release_year).then(data => {
      if (!cancelled) setTmdbData(data)
    })
    return () => { cancelled = true }
  }, [movie.title, movie.release_year])

  const handleFeedback = (e, signal) => {
    e.stopPropagation()
    setFeedbackGiven(signal)
    onFeedback?.(movie.item_id, signal, modelVariant)
  }

  const posterUrl = tmdbData?.posterUrl

  return (
    <div
      className={`movie-card ${hovered ? 'hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onMovieClick?.(movie, tmdbData)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onMovieClick?.(movie, tmdbData)}
      aria-label={`${movie.title}, ${movie.release_year}`}
    >
      <div className="card-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title} loading="lazy" />
        ) : (
          <div className="card-placeholder">
            <span>{movie.title}</span>
          </div>
        )}
        <div className="card-overlay" />
      </div>

      <div className="card-info">
        <h3 className="card-title">{movie.title}</h3>
        <div className="card-meta">
          <span className="card-year">{movie.release_year}</span>
          {tmdbData?.rating && (
            <span className="card-rating">★ {tmdbData.rating}</span>
          )}
        </div>
        <div className="card-genres">
          {movie.genres?.slice(0, 2).map(g => (
            <span key={g} className="genre-tag">{g}</span>
          ))}
        </div>

        {showFeedback && (
          <div className="card-feedback">
            <button
              className={`feedback-btn ${feedbackGiven === 1 ? 'active-up' : ''}`}
              onClick={e => handleFeedback(e, 1)}
              aria-label="Thumbs up"
            >👍</button>
            <button
              className={`feedback-btn ${feedbackGiven === -1 ? 'active-down' : ''}`}
              onClick={e => handleFeedback(e, -1)}
              aria-label="Thumbs down"
            >👎</button>
          </div>
        )}
      </div>
    </div>
  )
}
