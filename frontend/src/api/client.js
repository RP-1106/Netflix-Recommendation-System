import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
const TMDB_TOKEN = import.meta.env.VITE_TMDB_TOKEN

// ── FastAPI client ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// ── TMDB client ───────────────────────────────────────────────────────────────
const tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${TMDB_TOKEN}`,
    'Content-Type': 'application/json',
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// FastAPI calls
// ─────────────────────────────────────────────────────────────────────────────

export async function getRecommendations(watchHistory, sessionId, topK = 20) {
  // watchHistory is an array of either:
  //   - strings (legacy): { title: str, genres: [], release_year: null }
  //   - objects: { title, genres, release_year }
  const items = watchHistory.map(item =>
    typeof item === 'string'
      ? { title: item, genres: [], release_year: null }
      : { title: item.title, genres: item.genres || [], release_year: item.release_year || null }
  )
  const res = await api.post('/recommend', {
    watch_history: items,
    session_id: sessionId,
    top_k: topK,
  })
  return res.data
}

export async function sendFeedback(sessionId, movieId, signal, modelVariant) {
  const res = await api.post('/feedback', {
    session_id: sessionId,
    movie_id: movieId,
    signal,
    model_variant: modelVariant,
  })
  return res.data
}

export async function getGenres() {
  const res = await api.get('/genres')
  return res.data.genres
}

export async function checkHealth() {
  const res = await api.get('/health')
  return res.data
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB calls
// ─────────────────────────────────────────────────────────────────────────────

// Cache to avoid hammering TMDB API
const tmdbCache = new Map()

export async function getTMDBData(title, year) {
  const cacheKey = `${title}-${year}`
  if (tmdbCache.has(cacheKey)) return tmdbCache.get(cacheKey)

  try {
    const query = year ? `${title} ${year}` : title
    const res = await tmdb.get('/search/movie', {
      params: { query, year, language: 'en-US', page: 1 },
    })

    const results = res.data.results
    if (!results || results.length === 0) {
      tmdbCache.set(cacheKey, null)
      return null
    }

    const movie = results[0]
    const data = {
      tmdbId: movie.id,
      posterUrl: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
      backdropUrl: movie.backdrop_path
        ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
        : null,
      overview: movie.overview,
      rating: movie.vote_average?.toFixed(1),
      popularity: movie.popularity,
    }

    tmdbCache.set(cacheKey, data)
    return data
  } catch {
    tmdbCache.set(cacheKey, null)
    return null
  }
}

export async function getTrailerKey(tmdbId) {
  if (!tmdbId) return null
  try {
    const res = await tmdb.get(`/movie/${tmdbId}/videos`, {
      params: { language: 'en-US' },
    })
    const videos = res.data.results || []
    const trailer =
      videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
      videos.find(v => v.site === 'YouTube')
    return trailer ? trailer.key : null
  } catch {
    return null
  }
}

export async function searchTMDB(query) {
  if (!query || query.length < 2) return []
  try {
    const res = await tmdb.get('/search/movie', {
  params: { query: title, language: 'en-US', page: 1 },
})
    return res.data.results || []
  } catch {
    return []
  }
}

// Popular movies for first-time users (from TMDB directly)
export async function getTMDBPopular() {
  try {
    const res = await tmdb.get('/movie/popular', {
      params: { language: 'en-US', page: 1 },
    })
    return res.data.results || []
  } catch {
    return []
  }
}

export async function getTMDBNowPlaying() {
  try {
    const res = await tmdb.get('/movie/now_playing', {
      params: { language: 'en-US', page: 1 },
    })
    return res.data.results || []
  } catch {
    return []
  }
}
