import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi, PAGE_SIZE } from '../api'
import type { AlbumBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, Loading, LoadingMore } from '../components/common/Ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'
import { useUiStore } from '../stores/uiStore'
import { COLLAGE_MAX, COLLAGE_MIN } from '../utils/shareCard'

export function ShelfPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const [albums, setAlbums] = useState<AlbumBrief[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState('')
  const [error, setError] = useState('')

  // S2-2 搜索：前端过滤；首搜自动补齐全量（limit=200 分批，后端上限），边拉边显、拉完内存缓存
  // （仅搜已加载会漏掉未滚动到的收藏，结果不可信；后端加参数也得拉全量，成本同源）
  const [query, setQuery] = useState('')
  const [loadingAll, setLoadingAll] = useState(false)
  const albumsRef = useRef<AlbumBrief[]>([]) // 镜像（补齐循环内去重用，避免在 setState updater 里做带副作用的计数）
  albumsRef.current = albums
  const albumsCountRef = useRef(0) // 已加载张数（补齐循环内同步推进）
  const hasMoreRef = useRef(false) // 补齐循环读 ref，避免 state 变更反复取消重启
  const totalRef = useRef(0)
  const fetchingAllRef = useRef(false)
  const kwRef = useRef('') // 循环内读最新搜索词（清空即停拉）
  const kw = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      kw
        ? albums.filter(
            (a) => a.name.toLowerCase().includes(kw) || a.artistName.toLowerCase().includes(kw),
          )
        : albums,
    [albums, kw],
  )

  // S2-3 多选：hover 勾选圈，选中顺序即拼贴顺序
  const [picked, setPicked] = useState<AlbumBrief[]>([])
  const hasSelection = picked.length > 0

  const togglePick = useCallback((a: AlbumBrief) => {
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.id === a.id)
      if (i >= 0) return prev.filter((p) => p.id !== a.id)
      if (prev.length >= COLLAGE_MAX) {
        useUiStore.getState().setToast(`拼贴卡最多选 ${COLLAGE_MAX} 张`)
        return prev
      }
      return [...prev, a]
    })
  }, [])

  const load = useCallback(async (offset: number, replace: boolean) => {
    if (replace) {
      setLoading(true)
      setError('')
      setLoadMoreError('')
    } else {
      setLoadingMore(true)
    }
    try {
      const data = await libraryApi.albums(offset, PAGE_SIZE)
      const items = data.items || []
      setAlbums((prev) => (replace ? items : [...prev, ...items]))
      albumsCountRef.current = replace ? items.length : albumsCountRef.current + items.length
      totalRef.current = data.total || 0
      hasMoreRef.current = items.length > 0 && !!data.hasMore
      setTotal(Math.max(totalRef.current, albumsCountRef.current))
      // 零进展防护：无新条目时 offset 不会推进，按到尾处理（防连续加载链死循环）
      setHasMore(hasMoreRef.current)
    } catch (e) {
      if (replace) setError(e instanceof Error ? e.message : '加载失败')
      // 断链：续拉失败不自动重试（观察器停发），哨兵位展示错误 + 重试
      else setLoadMoreError(e instanceof Error ? e.message : '加载更多失败')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // 搜索补齐全量：输入非空且还有未加载部分时，分批（limit=200）拉到尾；
  // 条件全部走 ref（state 变更不重启循环）；kwRef 清空即停拉；换账号（dataVersion）时由重载流程中止
  kwRef.current = kw
  useEffect(() => {
    if (!kw || fetchingAllRef.current) return
    if (!hasMoreRef.current || albumsCountRef.current >= totalRef.current) return
    fetchingAllRef.current = true
    setLoadingAll(true)
    ;(async () => {
      try {
        while (fetchingAllRef.current && kwRef.current) {
          const data = await libraryApi.albums(albumsCountRef.current, 200)
          const items = data.items || []
          if (!fetchingAllRef.current || !kwRef.current) return
          if (items.length === 0) {
            hasMoreRef.current = false
            setHasMore(false)
            return
          }
          // 计数在 updater 外做：StrictMode 会双调用 updater，内部改 ref 会被多记一倍
          const seen = new Set(albumsRef.current.map((p) => p.id))
          const fresh = items.filter((i) => !seen.has(i.id))
          if (fresh.length) {
            albumsCountRef.current += fresh.length
            const append = fresh
            setAlbums((prev) => [...prev, ...append])
          }
          totalRef.current = Math.max(data.total || 0, totalRef.current, albumsCountRef.current)
          setTotal(totalRef.current)
          if (!data.hasMore || items.length < 200) {
            hasMoreRef.current = false
            setHasMore(false)
            return
          }
        }
      } catch (e) {
        if (kwRef.current)
          useUiStore
            .getState()
            .setToast(e instanceof Error ? e.message : '加载全部收藏失败，可重试搜索')
      } finally {
        fetchingAllRef.current = false
        setLoadingAll(false)
      }
    })()
  }, [kw])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      fetchingAllRef.current = false // 数据版本变更：中止补齐循环，避免旧账号数据混入
      await load(0, true)
    })()
    return () => {
      cancelled = true
    }
  }, [dataVersion, load])

  // 分批加载：滚动到底自动续拉下一批；失败断链（loadMoreError）停发，待手动重试；
  // 搜索过滤态隐藏哨兵（过滤只针对已加载范围，续拉语义混乱）
  const sentinelRef = useInfiniteScroll(
    () => {
      if (loadingMore || !hasMore || loadMoreError || kw) return
      void load(albums.length, false)
    },
    hasMore && !loadingMore && !loadMoreError && !kw,
  )

  const openCollage = () => {
    if (picked.length < COLLAGE_MIN) return
    useUiStore.getState().openShareCard({ kind: 'collage', albums: [...picked] })
  }

  return (
    <div className="p-8 pb-24">
      <h1 className="text-2xl font-bold text-neutral-50">唱片墙</h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {loadingAll
            ? `正在加载全部收藏（${albums.length} / ${total}）…`
            : kw
              ? `匹配 ${visible.length} 张 · 共 ${Math.max(total, albums.length)} 张`
              : `收藏的专辑${total > 0 ? ` · 共 ${total} 张` : ''}`}
          {hasSelection ? ` · 已选 ${picked.length} 张` : ''}
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索已加载的专辑或歌手"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent/50 focus:outline-none sm:w-72"
        />
      </div>

      <div className="mt-6">
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="text-center text-sm text-red-400">{error}</div>
        ) : albums.length === 0 ? (
          <Empty text="暂无收藏的专辑" />
        ) : visible.length === 0 ? (
          loadingAll ? (
            <Loading text="正在加载全部收藏…" />
          ) : (
            <Empty text={`没有匹配的专辑（已搜索全部 ${albums.length} 张）`} />
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {visible.map((a) => {
                const isPicked = picked.some((p) => p.id === a.id)
                return (
                  <Link
                    key={a.id}
                    to={`/album/${a.id}`}
                    onClick={(e) => {
                      // 多选态：点击封面=切换选中，不导航
                      if (hasSelection) {
                        e.preventDefault()
                        togglePick(a)
                      }
                    }}
                    onContextMenu={(e) =>
                      useContextMenuStore.getState().openForEvent(e, { kind: 'album', album: a })
                    }
                    className={`group rounded-[var(--radius-cover)] border p-3 transition ${
                      isPicked
                        ? 'border-transparent bg-accent/15'
                        : 'border-transparent bg-neutral-900/40 hover:border-neutral-800 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="relative overflow-hidden rounded-[var(--radius-cover)] shadow-lg shadow-black/40 transition duration-200 group-hover:-translate-y-[12px] group-hover:shadow-xl group-hover:shadow-black/50">
                      <Cover url={a.coverUrl} className="aspect-square w-full" />
                      {/* 光泽：右上斜向高光，hover 增强 */}
                      <span className="pointer-events-none absolute inset-0 rounded-[var(--radius-cover)] bg-gradient-to-br from-white/[0.08] via-transparent to-transparent opacity-50 transition group-hover:opacity-100" />
                      {/* 勾选圈：hover 浮现；选中常驻；独立命中区不触发导航 */}
                      <span
                        role="checkbox"
                        aria-checked={isPicked}
                        aria-label={isPicked ? `取消选择 ${a.name}` : `选择 ${a.name}`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          togglePick(a)
                        }}
                        className={`absolute left-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border text-xs transition ${
                          isPicked
                            ? 'border-transparent bg-accent text-neutral-950 opacity-100'
                            : `border-white/60 bg-black/40 text-transparent ${
                                hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                    <div className="mt-2 truncate text-sm text-neutral-100">{a.name}</div>
                    <div className="mt-0.5 truncate text-xs text-neutral-500">{a.artistName}</div>
                  </Link>
                )
              })}
            </div>
            {/* 分批加载哨兵：整块底部空白（列表底 → 播放条上沿）即本元素 h-36=144px，
                「加载中」在空白正中垂直居中；-mb-28 抵消 pb-24×2 超出播放条的 112px，
                整体留白不变（哨兵上沿仍在列表底部，滚动触发时机不受影响） */}
            {hasMore && !kw && (
              <div ref={sentinelRef} className="-mb-28 flex h-36 items-center justify-center">
                {loadingMore ? (
                  <LoadingMore />
                ) : loadMoreError ? (
                  <button
                    type="button"
                    onClick={() => void load(albums.length, false)}
                    className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    {loadMoreError} · 点击重试
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {/* 多选操作条：悬浮于播放条上方 */}
      {hasSelection && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-neutral-800 bg-neutral-900/95 px-5 py-2.5 shadow-xl backdrop-blur">
            <span className="text-sm text-neutral-200">
              已选 <span className="font-medium text-accent">{picked.length}</span> 张
              {picked.length < COLLAGE_MIN && (
                <span className="ml-1 text-xs text-neutral-500">（再选 1 张起可拼贴）</span>
              )}
            </span>
            <button
              type="button"
              disabled={picked.length < COLLAGE_MIN}
              onClick={openCollage}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-neutral-950 transition hover:bg-accent-hover disabled:opacity-40"
            >
              分享拼贴卡
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800"
            >
              清空
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="text-neutral-500 transition hover:text-neutral-200"
              aria-label="退出多选"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
