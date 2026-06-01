import { useState, useEffect, useRef } from 'react'
import './SearchBar.css'

const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3ZDM4ZGZkN2MwN2ZhZjQzOWNkN2M5NGVmOGRkMzMzNiIsIm5iZiI6MTc3NTExOTIxOC43NTEwMDAyLCJzdWIiOiI2OWNlMmI3MjA2MTI1YWNhNWZkMjhkNzUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.xiwle-ORjQsdoW5wGqJYUtIuQLByHo7le0XjHtLfNYQ'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function searchCatalogue(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&top_k=5`)
    const data = await res.json()
    return (data.results || []).map(r => ({
      ...r, _source: 'catalogue', _mediaType: 'movie',
      poster_path: null,
      release_date: r.release_year ? `${r.release_year}-01-01` : null,
      overview: `${r.genres?.join(', ')} • ${r.release_year || ''}`,
    }))
  } catch { return [] }
}

async function searchTMDBMovies(query) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`,
      { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }
    )
    const data = await res.json()
    return (data.results || []).slice(0, 4).map(r => ({ ...r, _source: 'tmdb', _mediaType: 'movie' }))
  } catch { return [] }
}

async function searchTMDBTV(query) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&language=en-US&page=1`,
      { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }
    )
    const data = await res.json()
    return (data.results || []).slice(0, 4).map(r => ({
      ...r,
      _source: 'tmdb',
      _mediaType: 'tv',
      title: r.name || r.original_name,
      release_date: r.first_air_date,
    }))
  } catch { return [] }
}

export default function SearchBar({ onSearch, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef    = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.length < 2) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const [catalogueRes, movieRes, tvRes] = await Promise.all([
        searchCatalogue(query),
        searchTMDBMovies(query),
        searchTMDBTV(query),
      ])

      const seen = new Set()
      const merged = []
      for (const r of [...catalogueRes, ...movieRes, ...tvRes]) {
        const key = (r.title || '').toLowerCase()
        if (!seen.has(key)) { seen.add(key); merged.push(r) }
      }
      setResults(merged.slice(0, 10))
      setLoading(false)
    }, 350)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleSelect = (result) => {
    const isCatalogue = result._source === 'catalogue'
    const isTV        = result._mediaType === 'tv'
    const movie = {
      item_id:      isCatalogue ? result.item_id : (isTV ? `tmdb_tv_${result.id}` : `tmdb_${result.id}`),
      item_idx:     isCatalogue ? result.item_idx : -1,
      title:        result.title,
      release_year: result.release_year || result.release_date?.split('-')[0],
      genres:       result.genres || [],
      log_popularity: result.log_popularity || Math.log(result.popularity || 1),
      media_type:   result._mediaType,
    }
    const tmdbData = isCatalogue ? null : {
      tmdbId:      result.id,
      mediaType:   result._mediaType,
      posterUrl:   result.poster_path   ? `https://image.tmdb.org/t/p/w500${result.poster_path}`        : null,
      backdropUrl: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}`  : null,
      overview:    result.overview,
      rating:      result.vote_average?.toFixed(1),
    }
    onSearch?.(movie, tmdbData)
    onClose?.()
  }

  const getYear = (r) => r.release_year || r.release_date?.split('-')[0] || ''

  const getLabel = (r) => {
    if (r._source === 'catalogue') return { text: 'In Catalogue', color: '#46d369' }
    if (r._mediaType === 'tv')     return { text: 'TV Show', color: '#0080ff' }
    return { text: 'Movie', color: '#888' }
  }

  return (
    <div className="searchbar-wrap" style={{ position: 'relative', zIndex: 9999 }}>
      <div className="searchbar-input-wrap">
        <input
          ref={inputRef}
          className="searchbar-input"
          type="text"
          placeholder="Search titles, moods, genres..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose?.()}
        />
        {query && (
          <button className="searchbar-clear" onClick={() => setQuery('')}>✕</button>
        )}
      </div>

      {(results.length > 0 || loading) && (
        <div style={{
          position: 'fixed', top: '68px', right: '60px',
          width: '380px', background: '#141414',
          border: '1px solid #333', borderRadius: '4px',
          zIndex: 9999, maxHeight: '520px', overflowY: 'auto',
        }}>
          {loading && <div className="search-loading">Searching...</div>}

          {results.length > 0 && (
            <div style={{ padding: '6px 12px 2px', fontSize: '11px', color: '#555', borderBottom: '1px solid #222' }}>
              {results.filter(r => r._source === 'catalogue').length} catalogue ·{' '}
              {results.filter(r => r._mediaType === 'movie' && r._source === 'tmdb').length} movies ·{' '}
              {results.filter(r => r._mediaType === 'tv').length} TV shows
            </div>
          )}

          {results.map((result, i) => {
            const label = getLabel(result)
            return (
              <div key={`${result._source}-${result.item_id || result.id}-${i}`}
                className="search-result-item" onClick={() => handleSelect(result)}>
                {result.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                    alt={result.title} className="search-result-poster" />
                ) : (
                  <div className="search-result-poster search-result-placeholder"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    {result._mediaType === 'tv' ? '📺' : '🎬'}
                  </div>
                )}
                <div className="search-result-info">
                  <span className="search-result-title">{result.title}</span>
                  <span className="search-result-year">{getYear(result)}</span>
                  <span style={{ fontSize: '11px', color: label.color }}>{label.text}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
