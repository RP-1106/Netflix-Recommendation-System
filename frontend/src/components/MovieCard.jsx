import { useState, useEffect } from 'react'
import { getTMDBData } from '../api/client'
import './MovieCard.css'

export default function MovieCard({ movie, onMovieClick, showFeedback, onFeedback, modelVariant }) {
  const [tmdbData, setTmdbData] = useState(null)
  const [hovered, setHovered]   = useState(false)

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
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={title}
          className="movie-card-poster"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="movie-card-placeholder">
          <span className="movie-card-title-fallback">{title}</span>
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