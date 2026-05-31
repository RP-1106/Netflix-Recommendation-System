import { useState, useEffect, useRef } from 'react'
import './SearchBar.css'

const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3ZDM4ZGZkN2MwN2ZhZjQzOWNkN2M5NGVmOGRkMzMzNiIsIm5iZiI6MTc3NTExOTIxOC43NTEwMDAyLCJzdWIiOiI2OWNlMmI3MjA2MTI1YWNhNWZkMjhkNzUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.xiwle-ORjQsdoW5wGqJYUtIuQLByHo7le0XjHtLfNYQ'
const API_BASE  = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function searchCatalogue(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&top_k=5`)
    const data = await res.json()
    return (data.results || []).map(r => ({
      ...r,
      _source: 'catalogue',
      poster_path: null,
      release_date: r.release_year ? `${r.release_year}-01-01` : null,
      vote_average: null,
      overview: `${r.genres?.join(', ')} • ${r.release_year || ''}`,
    }))
  } catch { return [] }
}

async function searchTMDB(query) {
  try {
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } })
    const data = await res.json()
    return (data.results || []).slice(0, 5).map(r => ({ ...r, _source: 'tmdb' }))
  } catch { return [] }
}

export default function SearchBar({ onSearch, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'catalogue' | 'tmdb'
  const inputRef   = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.length < 2) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const [catalogueRes, tmdbRes] = await Promise.all([
        searchCatalogue(query),
        searchTMDB(query),
      ])

      // Deduplicate by title — prefer catalogue results
      const seen = new Set()
      const merged = []
      for (const r of [...catalogueRes, ...tmdbRes]) {
        const key = (r.title || '').toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(r)
        }
      }
      setResults(merged.slice(0, 8))
      setLoading(false)
    }, 350)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleSelect = (result) => {
    const isCatalogue = result._source === 'catalogue'
    const movie = {
      item_id:      isCatalogue ? result.item_id : `tmdb_${result.id}`,
      item_idx:     isCatalogue ? result.item_idx : -1,
      title:        result.title,
      release_year: result.release_year || result.release_date?.split('-')[0],
      genres:       result.genres || [],
      log_popularity: result.log_popularity || Math.log(result.popularity || 1),
    }
    const tmdbData = isCatalogue ? null : {
      tmdbId:      result.id,
      posterUrl:   result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
      backdropUrl: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null,
      overview:    result.overview,
      rating:      result.vote_average?.toFixed(1),
    }
    onSearch?.(movie, tmdbData)
    onClose?.()
  }

  const getPosterUrl = (result) => {
    if (result._source === 'tmdb' && result.poster_path)
      return `https://image.tmdb.org/t/p/w92${result.poster_path}`
    return null
  }

  const getYear = (result) =>
    result.release_year || result.release_date?.split('-')[0] || ''

  const getSubtitle = (result) => {
    if (result._source === 'catalogue')
      return `${result.genres?.slice(0,2).join(' · ')} • In catalogue`
    return result.overview?.slice(0, 60) + (result.overview?.length > 60 ? '…' : '') || ''
  }

  return (
    <div className="searchbar-wrap" style={{ position: 'relative', zIndex: 9999 }}>
      <div className="searchbar-input-wrap">
        <span className="searchbar-icon">🔍</span>
        <input
          ref={inputRef}
          className="searchbar-input"
          type="text"
          placeholder="Titles, moods, genres..."
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
          position: 'fixed',
          top: '68px',
          right: '60px',
          left: 'auto',
          width: '380px',
          background: '#141414',
          border: '1px solid #333',
          borderRadius: '4px',
          zIndex: 9999,
          maxHeight: '520px',
          overflowY: 'auto',
        }}>
          {loading && <div className="search-loading">Searching catalogue + TMDB...</div>}

          {results.length > 0 && (
            <div style={{ padding: '6px 12px 2px', fontSize: '11px', color: '#666', borderBottom: '1px solid #222' }}>
              {results.filter(r => r._source === 'catalogue').length} catalogue · {results.filter(r => r._source === 'tmdb').length} TMDB
            </div>
          )}

          {results.map((result, i) => (
            <div
              key={`${result._source}-${result.item_id || result.id}-${i}`}
              className="search-result-item"
              onClick={() => handleSelect(result)}
            >
              {getPosterUrl(result) ? (
                <img
                  src={getPosterUrl(result)}
                  alt={result.title}
                  className="search-result-poster"
                />
              ) : (
                <div className="search-result-poster search-result-placeholder"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  🎬
                </div>
              )}
              <div className="search-result-info">
                <span className="search-result-title">{result.title}</span>
                <span className="search-result-year">{getYear(result)}</span>
                <span style={{ fontSize: '11px', color: result._source === 'catalogue' ? '#46d369' : '#888' }}>
                  {getSubtitle(result)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
