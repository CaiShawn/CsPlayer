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
import { SettingsPage } from './pages/SettingsPage'
import { SearchPage } from './pages/SearchPage'
import { ArtistPage } from './pages/ArtistPage'
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
      // 先用浏览器保存的凭证静默恢复（v0.1.4）；成功留在当前页（dataVersion 自愈），
      // 失败才清空状态并回登录页扫码
      void useAuthStore
        .getState()
        .restoreSession()
        .then((restored) => {
          if (restored) return
          clear()
          usePlayerStore.getState().clearQueue()
          navigate('/login', { replace: true })
        })
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
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="artist/:id" element={<ArtistPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
