import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { usePlayerStore } from '../../stores/playerStore'
import { SwitchAccountModal } from './SwitchAccountModal'

export function TopBar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const onSettings = location.pathname === '/settings'
  const [menuOpen, setMenuOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-4">
      <div className="min-w-0 select-none">
        <div className="text-base font-semibold tracking-wide text-accent-text">CsPlayer</div>
        <div className="truncate text-[10px] leading-3 text-neutral-500">
          Third-party web player for NCM
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex items-center rounded-full border border-neutral-800 bg-neutral-900/60 px-4 py-1.5"
        >
          <span className="mr-2 text-neutral-500">⌕</span>
          <input
            type="search"
            placeholder="搜索（即将推出）"
            className="w-full bg-transparent text-sm text-neutral-300 outline-none placeholder:text-neutral-600"
          />
        </form>
      </div>

      <div className="relative flex shrink-0 items-center" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-neutral-900"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-400">
              ?
            </div>
          )}
          <span className="max-w-[240px] truncate text-sm text-neutral-200">
            {user?.nickname || '未登录'}
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => {
                setMenuOpen(false)
                setSwitchOpen(true)
              }}
            >
              切换账号
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-neutral-800"
              onClick={async () => {
                setMenuOpen(false)
                await logout()
                usePlayerStore.getState().clearQueue()
                navigate('/login', { replace: true })
              }}
            >
              退出登录
            </button>
          </div>
        )}
      </div>

      {/* 设置入口：顶栏右上角齿轮（与昵称并列） */}
      <button
        type="button"
        title="设置"
        aria-label="设置"
        onClick={() => navigate('/settings')}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-base leading-none transition-colors hover:bg-neutral-900 ${
          onSettings ? 'text-accent-text' : 'text-neutral-400 hover:text-neutral-100'
        }`}
      >
        ⚙
      </button>

      {switchOpen && <SwitchAccountModal onClose={() => setSwitchOpen(false)} />}
    </header>
  )
}
