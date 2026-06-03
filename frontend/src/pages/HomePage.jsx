import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getRecommendations, getTMDBNowPlaying, getTMDBPopular, getTMDBData, sendFeedback } from '../api/client'
import MovieRow from '../components/MovieRow'
import MovieModal from '../components/MovieModal'
import HeroSection from '../components/HeroSection'
import './HomePage.css'

export default function HomePage({ onWatchTogether }) {
  const { sessionId, watchHistory, continueWatching, watchAgain, watchedMovies, addToContinueWatching } = useAuth()

  const [recommendations, setRecommendations] = useState([])
  const [modelVariant, setModelVariant]       = useState('bert4rec')
  const [nowPlaying, setNowPlaying]           = useState([])
  const [popular, setPopular]                 = useState([])
  const [selectedMovie, setSelectedMovie]     = useState(null)
  const [selectedTmdb, setSelectedTmdb]       = useState(null)
  const [loading, setLoading]                 = useState(true)
  const [refreshCount, setRefreshCount]       = useState(0)

  const [heroItems, setHeroItems] = useState([])
  const [heroIndex, setHeroIndex] = useState(0)
  const autoAdvanceRef = useRef(null)
  const popularRef     = useRef([])

  function tmdbToMovie(t) {
    return {
      item_id: `tmdb_${t.id}`,
      item_idx: -1,
      title: t.title,
      release_year: t.release_date?.split('-')[0],
      genres: [],
      log_popularity: Math.log(t.popularity || 1),
    }
  }

  function tmdbToData(t) {
    return {
      tmdbId: t.id,
      backdropUrl: t.backdrop_path ? `https://image.tmdb.org/t/p/original${t.backdrop_path}` : null,
      posterUrl:   t.poster_path   ? `https://image.tmdb.org/t/p/w500${t.poster_path}`        : null,
      overview: t.overview,
      rating:   t.vote_average?.toFixed(1),
    }
  }

  const startAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current)
    autoAdvanceRef.current = setInterval(() => {
      setHeroIndex(i => (i + 1) % 5)
    }, 6000)
  }, [])

  useEffect(() => {
    if (heroItems.length === 0) return
    setHeroIndex(Math.floor(Math.random() * Math.min(heroItems.length, 5)))
    startAutoAdvance()
    return () => clearInterval(autoAdvanceRef.current)
  }, [heroItems, startAutoAdvance])

  const goToHero  = useCallback((i) => { setHeroIndex(i); startAutoAdvance() }, [startAutoAdvance])
  const heroPrev  = useCallback(() => { setHeroIndex(i => (i - 1 + Math.min(heroItems.length, 5)) % Math.min(heroItems.length, 5)); startAutoAdvance() }, [heroItems.length, startAutoAdvance])
  const heroNext  = useCallback(() => { setHeroIndex(i => (i + 1) % Math.min(heroItems.length, 5)); startAutoAdvance() }, [heroItems.length, startAutoAdvance])

  // Load TMDB once on mount
  useEffect(() => {
    const loadTMDB = async () => {
      try {
        const [playingRes, popularRes] = await Promise.all([getTMDBNowPlaying(), getTMDBPopular()])
        setNowPlaying(playingRes.map(tmdbToMovie))
        setPopular(popularRes.map(tmdbToMovie))
        popularRef.current = popularRes
        const heroFallback = popularRes.filter(m => m.backdrop_path).slice(0, 5)
          .map(m => ({ movie: tmdbToMovie(m), tmdbData: tmdbToData(m) }))
        setHeroItems(heroFallback)
      } catch (e) { console.error('TMDB load failed:', e) }
      setLoading(false)
    }
    loadTMDB()
  }, [])

  // Load recommendations when history or refreshCount changes
  useEffect(() => {
    const loadRecs = async () => {
      const storedHistory = localStorage.getItem('nf_history')
      const freshHistory  = storedHistory ? JSON.parse(storedHistory) : []
      if (freshHistory.length === 0) return
      try {
        const recRes = await getRecommendations(freshHistory, sessionId, 20)
        const recs   = recRes.recommendations || []
        setRecommendations(recs)
        setModelVariant(recRes.model_variant)
        if (recs.length > 0) {
          const heroRecs = await Promise.all(
            recs.slice(0, 5).map(async (movie) => {
              const tmdbData = await getTMDBData(movie.title, movie.release_year)
              return tmdbData?.backdropUrl ? { movie, tmdbData } : null
            })
          )
          const valid = heroRecs.filter(Boolean)
          if (valid.length >= 2) setHeroItems(valid)
        }
      } catch (e) { console.error('Recommendations failed:', e) }
    }
    loadRecs()
  }, [sessionId, refreshCount])

  const handleMovieClick = useCallback((movie, tmdbData) => {
    setSelectedMovie(movie)
    setSelectedTmdb(tmdbData || null)
    setRefreshCount(c => c + 1)
  }, [])

  const handleFeedback = useCallback(async (movieId, signal, variant) => {
    try { await sendFeedback(sessionId, movieId, signal, variant || modelVariant) }
    catch (e) { console.error('Feedback error:', e) }
  }, [sessionId, modelVariant])

  const continueWatchingMovies = continueWatching.map(cw => cw.movie)
  // watchAgain is now managed by AuthContext
  const unwatchedRecs  = recommendations.filter(m => !watchedMovies.has(m.title))
  const currentHero    = heroItems[heroIndex] || null

  return (
    <div className="home-page">
      {currentHero && (
        <div className="hero-carousel">
          <HeroSection
            movie={currentHero.movie}
            tmdbData={currentHero.tmdbData}
            onPlay={() => { addToContinueWatching(currentHero.movie); handleMovieClick(currentHero.movie, currentHero.tmdbData) }}
            onMoreInfo={() => handleMovieClick(currentHero.movie, currentHero.tmdbData)}
          />
          {heroItems.length > 1 && (
            <>
              <button className="hero-arrow hero-arrow-left" onClick={heroPrev} aria-label="Previous">‹</button>
              <button className="hero-arrow hero-arrow-right" onClick={heroNext} aria-label="Next">›</button>
            </>
          )}
          {heroItems.length > 1 && (
            <div className="hero-dots">
              {heroItems.slice(0, 5).map((_, i) => (
                <button key={i} className={`hero-dot ${i === heroIndex ? 'active' : ''}`}
                  onClick={() => goToHero(i)} aria-label={`Go to slide ${i + 1}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`home-rows ${loading ? 'loading' : ''}`}>
        {continueWatchingMovies.length > 0 && (
          <MovieRow title="Continue Watching" movies={continueWatchingMovies}
            onMovieClick={handleMovieClick} showFeedback modelVariant={modelVariant} onFeedback={handleFeedback} />
        )}
        {unwatchedRecs.length > 0 && (
          <MovieRow title="Recommended For You" movies={unwatchedRecs}
            onMovieClick={handleMovieClick} showFeedback modelVariant={modelVariant} onFeedback={handleFeedback} />
        )}
        {watchHistory.length < 3 && (
          <MovieRow title="Popular on NETFLX" movies={popular} onMovieClick={handleMovieClick} />
        )}
        <MovieRow title="New Releases"  movies={nowPlaying}          onMovieClick={handleMovieClick} />
        <MovieRow title="Trending Now"  movies={popular.slice(10,30)} onMovieClick={handleMovieClick} />
        {watchAgain.length > 0 && (
          <MovieRow title="Watch Again" movies={watchAgain} onMovieClick={handleMovieClick} />
        )}
      </div>

      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          tmdbData={selectedTmdb}
          modelVariant={modelVariant}
          onClose={() => { setSelectedMovie(null); setSelectedTmdb(null) }}
          onWatchTogether={(party) => { setSelectedMovie(null); onWatchTogether?.(party) }}
        />
      )}
    </div>
  )
}