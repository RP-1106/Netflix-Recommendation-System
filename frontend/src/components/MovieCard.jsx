import { useState, useEffect } from 'react'
import { getTMDBData } from '../api/client'
import './MovieCard.css'

export default function MovieCard({ movie, onMovieClick, showFeedback = false, modelVariant, onFeedback }) {
  const [tmdbData, setTmdbData] = useState(null)
  const [hovered, setHovered]   = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null)

  useEffect(() => {
    if (movie?.title) {
      getTMDBData(movie.title, movie.release_year).then(data => {
        if (data) setTmdbData(data)
      })
    }
  }, [movie?.title, movie?.release_year])

  const posterUrl = tmdbData?.posterUrl || null
  const title     = movie?.title || ''

  const handleClick = () => {
    onMovieClick?.(movie, tmdbData)
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
      )}

      {hovered && (
        <div className="movie-card-overlay">
          <div className="movie-card-info">
            <span className="card-title">{title}</span>
            {movie?.release_year && <span className="card-year">{movie.release_year}</span>}
          </div>
        </div>
      )}
    </div>
  )
}