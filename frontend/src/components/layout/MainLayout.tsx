import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useLikesStore } from '../../stores/likesStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { ContextMenu } from '../common/ContextMenu'
import { BackgroundLayer } from '../common/BackgroundLayer'
import { PlayerBar } from '../player/PlayerBar'
import { QueuePanel } from '../player/QueuePanel'
import { LyricPanel } from '../lyric/LyricPanel'
import { Toast } from '../common/Ui'
import { TopBar } from './TopBar'

export function MainLayout() {
  useAudioEngine()
  const location = useLocation()
  const onHome = location.pathname === '/home'
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
    void fetchIds(dataVersion)
  }, [dataVersion, fetchIds])

  return (
    <>
      {/* 背景图层（S4）：置于内容层之下，默认关闭零回归 */}
      <BackgroundLayer />
      <div className="relative z-[1] flex h-screen flex-col bg-[var(--surface-base)] text-neutral-100">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main
            className={`min-w-0 flex-1 overflow-y-auto pb-24 pl-2 ${onHome ? 'scrollbar-none' : ''}`}
          >
            <Outlet />
          </main>
          {showLyric && <LyricPanel />}
        </div>
        <PlayerBar />
        <QueuePanel />
        {/* 全站唯一右键菜单实例（portal） */}
        <ContextMenu />
        <Toast message={toast} onClose={() => setToast('')} />
      </div>
    </>
  )
}

function Sidebar() {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-neutral-800 bg-[var(--surface-bar)]">
      <nav className="flex-1 space-y-1 px-3 py-4">
        <NavItem to="/home" icon={<IconHome />}>首页</NavItem>
        <NavItem to="/like" icon={<IconHeart />}>我喜欢</NavItem>
        <div className="my-3 border-t border-neutral-800/80" />
        <NavItem to="/library" icon={<IconList />}>音乐库</NavItem>
        <NavItem to="/record" icon={<IconChart />}>自听榜</NavItem>
        <NavItem to="/shelf" icon={<IconDisc />}>唱片架</NavItem>
      </nav>
    </aside>
  )
}

/* 细线图标（暂用占位风格，后续迭代替换）：与音量图标同风格（stroke 1.3 / 16px） */
function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 7.5 8 3l5.5 4.5" />
      <path d="M4 8.5V13h8V8.5" />
    </svg>
  )
}

function IconHeart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 13C4 10.5 2.5 8.5 3.2 6.4c.6-1.7 2.6-2.1 3.8-.8l1 1 1-1c1.2-1.3 3.2-.9 3.8.8.7 2.1-.8 4.1-4.8 6.6z" />
    </svg>
  )
}

function IconDisc() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 12.5v-3M8 12.5v-6M12.5 12.5v-8" />
    </svg>
  )
}

function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-accent/15 text-accent-soft'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100'
        }`
      }
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      {children}
    </NavLink>
  )
}
