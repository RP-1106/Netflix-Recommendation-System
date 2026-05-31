import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import HomePage from './pages/HomePage'

function AppRoutes() {
  const { isLoggedIn, hasProfile } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isLoggedIn
            ? <Navigate to={hasProfile ? '/home' : '/profiles'} replace />
            : <LoginPage />
        }
      />
      <Route
        path="/profiles"
        element={
          isLoggedIn ? <ProfilePage /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/home"
        element={
          !isLoggedIn
            ? <Navigate to="/login" replace />
            : !hasProfile
            ? <Navigate to="/profiles" replace />
            : <HomePage />
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={isLoggedIn ? (hasProfile ? '/home' : '/profiles') : '/login'}
            replace
          />
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}