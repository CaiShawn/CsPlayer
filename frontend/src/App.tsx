import { useEffect, useRef } from 'react'
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
import { RecentPage } from './pages/RecentPage'
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
  /** 切换期间被挂起的 401（§3.6.1），切换结束后统一自愈 */
  const suspendedRef = useRef(false)
  const healRef = useRef<() => void>(() => {})

  useEffect(() => {
    // 自愈：先用浏览器凭证库静默恢复 active 账号（v0.1.4 → v0.1.5 多账号库）；
    // 成功留在当前页（dataVersion 自愈），失败才清空状态并回登录页扫码
    healRef.current = () => {
      void useAuthStore
        .getState()
        .restoreSession()
        .then((restored) => {
          if (restored) return
          clear()
          usePlayerStore.getState().clearQueue()
          navigate('/login', { replace: true })
        })
    }

    setUnauthorizedHandler(() => {
      const auth = useAuthStore.getState()
      if (auth.switching) {
        // 切换进行中：挂起（不自动恢复、不跳登录页），避免旧账号在途 401 把 active 抢回
        suspendedRef.current = true
        return
      }
      healRef.current()
    })

    // 切换结束：成功时 dataVersion 已 bump（页面按新会话重拉）；
    // 失败时旧会话可能已死，对挂起的 401 统一按新 active 自愈一次
    const unsub = useAuthStore.subscribe((s, prev) => {
      if (!prev.switching || s.switching || !suspendedRef.current) return
      suspendedRef.current = false
      if (s.dataVersion === prev.dataVersion) healRef.current()
    })
    return unsub
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
        <Route path="recent" element={<RecentPage />} />
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
