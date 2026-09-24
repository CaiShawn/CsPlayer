import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { isEditableTarget, useContextMenuStore } from '../../stores/contextMenuStore'
import { usePlayerStore } from '../../stores/playerStore'
import {
  clearRecentSearch,
  loadRecentSearch,
  pushRecentSearch,
} from '../../utils/recentSearch'
import { SwitchAccountModal } from './SwitchAccountModal'

export function TopBar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const onSettings = location.pathname === '/settings'
  // 记录进入设置前的页面（含查询串），齿轮再点一下即返回
  const prevPathRef = useRef('/home')
  useEffect(() => {
    if (!onSettings) prevPathRef.current = location.pathname + location.search
  }, [location.pathname, location.search, onSettings])
  const [menuOpen, setMenuOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* ------------------------------------------------------------------
   * 搜索：防抖 300ms、Enter 提交跳 /search?q=、最近搜索 10 条
   * ---------------------------------------------------------------- */
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [recents, setRecents] = useState<string[]>(() => loadRecentSearch())
  const [showRecent, setShowRecent] = useState(false)
  const onSearchPage = location.pathname === '/search'
  const currentQ = useMemo(
    () => new URLSearchParams(location.search).get('q')?.trim() ?? '',
    [location.search],
  )

  // 顶栏输入与结果页关键字双向同步（URL 为准；输入中不反向覆盖）
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(currentQ)
  }, [currentQ])

  // 结果页内改关键字：防抖 300ms 即时重搜（replace 不污染历史）
  useEffect(() => {
    if (!onSearchPage) return
    const t = window.setTimeout(() => {
      const kw = value.trim()
      if (kw === currentQ) return
      navigate(kw ? `/search?q=${encodeURIComponent(kw)}` : '/search', { replace: true })
    }, 300)
    return () => window.clearTimeout(t)
  }, [value, onSearchPage, currentQ, navigate])

  // 全局快捷键：/ 或 Ctrl+K 聚焦搜索框（输入框内不劫持）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && key === 'k')) {
        e.preventDefault()
        useContextMenuStore.getState().close()
        inputRef.current?.focus()
        inputRef.current?.select()
        setShowRecent(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // 点击搜索区以外关闭最近搜索面板
  useEffect(() => {
    if (!showRecent) return
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current?.contains(e.target as Node)) return
      setShowRecent(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showRecent])

  const submitSearch = (raw: string) => {
    const kw = raw.trim()
    if (!kw) {
      inputRef.current?.focus()
      return
    }
    setValue(kw)
    setRecents(pushRecentSearch(kw))
    setShowRecent(false)
    navigate(`/search?q=${encodeURIComponent(kw)}`)
  }

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
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-800 bg-[var(--surface-bar)] px-4">
      {/* 品牌区可点击回首页（S1-1）：已在首页则回顶，避免拖选文字（select-none） */}
      <button
        type="button"
        aria-label="回到首页"
        onClick={() => {
          if (location.pathname === '/home') {
            document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            navigate('/home')
          }
        }}
        className="min-w-0 select-none rounded-md px-1 py-0.5 text-left"
      >
        <div className="text-base font-semibold tracking-wide text-accent-text">CsPlayer</div>
        <div className="truncate text-[10px] leading-3 text-neutral-500">
          Third-party web player for NCM
        </div>
      </button>

      <div ref={searchWrapRef} className="relative mx-auto w-full max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitSearch(value)
          }}
          className="flex items-center rounded-full border border-neutral-800 bg-neutral-900/60 px-4 py-1.5 focus-within:border-accent/50"
        >
          <span className="mr-2 text-neutral-500" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setShowRecent(true)}
            placeholder="搜索歌曲 / 专辑 / 歌手 / 歌单（/ 或 Ctrl+K）"
            aria-label="搜索"
            className="w-full bg-transparent text-sm text-neutral-300 outline-none placeholder:text-neutral-600"
          />
          {value && (
            <button
              type="button"
              aria-label="清空搜索"
              title="清空"
              onClick={() => {
                setValue('')
                inputRef.current?.focus()
              }}
              className="ml-2 shrink-0 text-neutral-500 transition-colors hover:text-neutral-200"
            >
              {/* 细线 ×（替代原生 search 清除钮） */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 3 L9 9 M9 3 L3 9" />
              </svg>
            </button>
          )}
        </form>

        {showRecent && !value.trim() && recents.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-xs text-neutral-500">最近搜索</span>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearch()
                  setRecents([])
                }}
                className="text-xs text-neutral-500 hover:text-neutral-200"
              >
                清空
              </button>
            </div>
            {recents.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => submitSearch(kw)}
                className="block w-full truncate px-4 py-1.5 text-left text-sm text-neutral-300 hover:bg-neutral-800"
              >
                {kw}
              </button>
            ))}
          </div>
        )}
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
        onClick={() => navigate(onSettings ? prevPathRef.current : '/settings')}
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
