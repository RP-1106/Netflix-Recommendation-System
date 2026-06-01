import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import HomePage from './pages/HomePage'
import TVShowsPage from './pages/TVShowsPage'
import MoviesPage from './pages/MoviesPage'
import NewPopularPage from './pages/NewPopularPage'
import MyListPage from './pages/MyListPage'
import WatchPartyPage from './pages/WatchPartyPage'
import Navbar from './components/Navbar'
import MovieModal from './components/MovieModal'

function AppShell() {
  const { user, profile } = useAuth()
  const [activePage, setActivePage]       = useState('home')
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [selectedTmdb, setSelectedTmdb]   = useState(null)
  const [watchParty, setWatchParty]       = useState(null) // {roomId, movieId, movieTitle}

  if (!user)    return <LoginPage />
  if (!profile) return <ProfilePage />

  // If in a watch party, show that page full screen
  if (watchParty) {
    return (
      <WatchPartyPage
        roomId={watchParty.roomId}
        movieId={watchParty.movieId}
        movieTitle={watchParty.movieTitle}
        onLeave={() => setWatchParty(null)}
      />
    )
  }

  const handleSearch = (movie, tmdbData) => {
    setSelectedMovie(movie)
    setSelectedTmdb(tmdbData)
  }

  const renderPage = () => {
    switch (activePage) {
      case 'tvshows':    return <TVShowsPage />
      case 'movies':     return <MoviesPage />
      case 'newpopular': return <NewPopularPage />
      case 'mylist':     return <MyListPage />
      default: return <HomePage onWatchTogether={(party) => setWatchParty(party)} />
    }
  }

  return (
    <div>
      <Navbar
        onSearch={handleSearch}
        activePage={activePage}
        onPageChange={setActivePage}
        onJoinParty={(party) => setWatchParty(party)}
      />
      {renderPage()}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          tmdbData={selectedTmdb}
          onClose={() => { setSelectedMovie(null); setSelectedTmdb(null) }}
          onWatchTogether={(party) => { setSelectedMovie(null); setWatchParty(party) }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

