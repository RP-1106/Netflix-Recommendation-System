import { useRef } from 'react'
import MovieCard from './MovieCard'
import './MovieRow.css'

export default function MovieRow({ title, movies, onMovieClick, showFeedback, modelVariant, onFeedback }) {
  const rowRef = useRef(null)

  const scroll = (direction) => {
    if (!rowRef.current) return
    const scrollAmount = direction === 'left' ? -600 : 600
    rowRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }

  if (!movies || movies.length === 0) return null

  return (
    <section className="movie-row">
      <h2 className="row-title">{title}</h2>
      <div className="row-container">
        <button
          className="row-btn row-btn-left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >‹</button>

        <div className="row-track" ref={rowRef}>
          {movies.map((movie, i) => (
            <MovieCard
              key={movie.item_id || movie.id || i}
              movie={movie}
              onClick={onMovieClick}
              showFeedback={showFeedback}
              modelVariant={modelVariant}
              onFeedback={onFeedback}
            />
          ))}
        </div>

        <button
          className="row-btn row-btn-right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >›</button>
      </div>
    </section>
  )
}
