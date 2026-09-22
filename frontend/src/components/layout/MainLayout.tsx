import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { PlayerBar } from '../player/PlayerBar'
import { QueuePanel } from '../player/QueuePanel'
import { LyricPanel } from '../lyric/LyricPanel'

export function MainLayout() {
  useAudioEngine()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const lyricVisible = usePlayerStore((s) => s.lyricVisible)

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          nickname={user?.nickname}
          avatarUrl={user?.avatarUrl}
          onLogout={async () => {
            await logout()
            usePlayerStore.getState().clearQueue()
            navigate('/login')
          }}
        />
        <main className="min-w-0 flex-1 overflow-y-auto pb-24">
          <Outlet />
        </main>
        {lyricVisible && <LyricPanel />}
      </div>
      <PlayerBar />
      <QueuePanel />
    </div>
  )
}

function Sidebar({
  nickname,
  avatarUrl,
  onLogout,
}: {
  nickname?: string
  avatarUrl?: string
  onLogout: () => void
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="px-5 py-5">
        <Link to="/library" className="text-lg font-semibold tracking-wide text-emerald-400">
          WYY Player
        </Link>
        <p className="mt-1 text-xs text-neutral-500">第三方网页播放器</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        <NavItem to="/library">我的音乐</NavItem>
      </nav>
      <div className="border-t border-neutral-800 p-4">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-xs">
              ?
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{nickname || '未登录'}</div>
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-neutral-500 hover:text-neutral-200"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
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
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
