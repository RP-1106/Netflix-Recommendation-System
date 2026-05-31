import './HeroSection.css'

export default function HeroSection({ movie, tmdbData, onPlay, onMoreInfo }) {
  if (!movie) return null

  return (
    <div className="hero">
      {/* Backdrop */}
      {tmdbData?.backdropUrl ? (
        <img
          className="hero-backdrop"
          src={tmdbData.backdropUrl}
          alt={movie.title}
        />
      ) : (
        <div className="hero-backdrop-placeholder" />
      )}

      {/* Gradient overlays */}
      <div className="hero-gradient-bottom" />
      <div className="hero-gradient-left" />

      {/* Content */}
      <div className="hero-content">
        <h1 className="hero-title">{movie.title}</h1>

        {tmdbData?.overview && (
          <p className="hero-overview">
            {tmdbData.overview.length > 200
              ? tmdbData.overview.slice(0, 200) + '…'
              : tmdbData.overview}
          </p>
        )}

        <div className="hero-actions">
          <button className="hero-btn hero-btn-play" onClick={onPlay}>
            ▶  Play
          </button>
          <button className="hero-btn hero-btn-info" onClick={onMoreInfo}>
            ⓘ  More Info
          </button>
        </div>

        {tmdbData?.rating && (
          <div className="hero-rating">
            <span className="hero-rating-score">★ {tmdbData.rating}</span>
            <span className="hero-rating-label">Rating</span>
          </div>
        )}
      </div>
    </div>
  )
}
