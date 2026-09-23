import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useLikesStore } from '../../stores/likesStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { PlayerBar } from '../player/PlayerBar'
import { QueuePanel } from '../player/QueuePanel'
import { LyricPanel } from '../lyric/LyricPanel'
import { Toast } from '../common/Ui'
import { TopBar } from './TopBar'

export function MainLayout() {
  useAudioEngine()
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const fetchIds = useLikesStore((s) => s.fetchIds)
  const toast = useLikesStore((s) => s.toast)
  const setToast = useLikesStore((s) => s.setToast)
  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const lyricCollapsed = usePlayerStore((s) => s.lyricCollapsed)
  const showLyric = currentId != null && !lyricCollapsed

  useEffect(() => {
    void fetchIds()
  }, [dataVersion, fetchIds])

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto pb-24 pl-2">
          <Outlet />
        </main>
        {showLyric && <LyricPanel />}
      </div>
      <PlayerBar />
      <QueuePanel />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <nav className="flex-1 space-y-1 px-3 py-4">
        <NavItem to="/home">首页</NavItem>
        <NavItem to="/like">我喜欢</NavItem>
        <NavItem to="/shelf">唱片架</NavItem>
        <div className="my-3 border-t border-neutral-800/80" />
        <NavItem to="/library">音乐库</NavItem>
        <NavItem to="/record">自听榜</NavItem>
      </nav>
    </aside>
  )
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-accent/15 text-accent-soft'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
