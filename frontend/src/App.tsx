import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { setUnauthorizedHandler } from './api'
import { useAuthStore } from './stores/authStore'
import { usePlayerStore } from './stores/playerStore'
import { MainLayout } from './components/layout/MainLayout'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { LikePage } from './pages/LikePage'
import { RecordPage } from './pages/RecordPage'
import { ShelfPage } from './pages/ShelfPage'
import { LibraryPage } from './pages/LibraryPage'
import { AlbumPage, PlaylistPage } from './pages/DetailPages'
import { Loading } from './components/common/Ui'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  useEffect(() => {
    if (!initialized) void fetchMe()
  }, [initialized, fetchMe])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <Loading text="正在检查登录状态…" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear()
      usePlayerStore.getState().clearQueue()
      navigate('/login', { replace: true })
    })
  }, [clear, navigate])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="like" element={<LikePage />} />
        <Route path="record" element={<RecordPage />} />
        <Route path="shelf" element={<ShelfPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
