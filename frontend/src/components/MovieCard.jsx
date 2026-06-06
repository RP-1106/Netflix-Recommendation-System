import { useState, useEffect } from 'react'
import { getTMDBData } from '../api/client'
import './MovieCard.css'

export default function MovieCard({ movie, onMovieClick, showFeedback = false, modelVariant, onFeedback }) {
  const [tmdbData, setTmdbData]         = useState(null)
  const [hovered, setHovered]           = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null) // 1 = liked, -1 = disliked

  useEffect(() => {
    if (movie?.title) {
      getTMDBData(movie.title, movie.release_year).then(data => {
        if (data) setTmdbData(data)
      })
    }
  }, [movie?.title, movie?.release_year])

  const posterUrl = tmdbData?.posterUrl || null

  const handleFeedback = (e, signal) => {
    e.stopPropagation()
    setFeedbackGiven(signal)
    onFeedback?.(movie.item_id, signal, modelVariant)
  }

  return (
    <div
      className={`movie-card ${hovered ? 'hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onMovieClick?.(movie, tmdbData)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onMovieClick?.(movie, tmdbData)}
      aria-label={`${movie?.title}, ${movie?.release_year}`}
    >
      {posterUrl ? (
        <img src={posterUrl} alt={movie.title} className="movie-card-poster"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div className="movie-card-placeholder">
          <span className="movie-card-title-fallback">{movie?.title}</span>
        </div>
      )}

      {hovered && (
        <div className="movie-card-overlay">
          <div className="movie-card-info">
            <span className="card-title">{movie?.title}</span>
            {movie?.release_year && <span className="card-year">{movie.release_year}</span>}
          </div>
          {showFeedback && (
            <div className="card-feedback">
              <button
                className="card-feedback-btn"
                onClick={e => handleFeedback(e, 1)}
                title="Like"
                style={feedbackGiven === 1 ? { background: 'rgba(70,211,105,0.6)' } : {}}
              >👍</button>
              <button
                className="card-feedback-btn"
                onClick={e => handleFeedback(e, -1)}
                title="Not for me"
                style={feedbackGiven === -1 ? { background: 'rgba(229,9,20,0.6)' } : {}}
              >👎</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}