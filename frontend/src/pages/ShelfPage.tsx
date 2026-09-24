import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import type { AlbumBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, Loading } from '../components/common/Ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'

/** 单批条数（与后端 PAGE 一致）：滚动到底自动续拉，不一次拉全量 */
const PAGE_SIZE = 30

export function ShelfPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const [albums, setAlbums] = useState<AlbumBrief[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (offset: number, replace: boolean) => {
    if (replace) {
      setLoading(true)
      setError('')
    } else {
      setLoadingMore(true)
    }
    try {
      const data = await libraryApi.albums(offset, PAGE_SIZE)
      const items = data.items || []
      setAlbums((prev) => (replace ? items : [...prev, ...items]))
      setTotal(data.total || 0)
      setHasMore(!!data.hasMore)
    } catch (e) {
      if (replace) setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await load(0, true)
    })()
    return () => {
      cancelled = true
    }
  }, [dataVersion, load])

  // 分批加载：滚动到底自动续拉后 30 张
  const sentinelRef = useInfiniteScroll(
    () => {
      if (loadingMore || !hasMore) return
      void load(albums.length, false)
    },
    hasMore && !loadingMore,
  )

  return (
    <div className="p-8 pb-24">
      <h1 className="text-2xl font-bold text-neutral-50">唱片架</h1>
      <p className="mt-1 text-sm text-neutral-500">
        收藏的专辑{total > 0 ? ` · 共 ${total} 张` : ''}
      </p>

      <div className="mt-6">
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="text-center text-sm text-red-400">{error}</div>
        ) : albums.length === 0 ? (
          <Empty text="暂无收藏的专辑" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {albums.map((a) => (
                <Link
                  key={a.id}
                  to={`/album/${a.id}`}
                  onContextMenu={(e) =>
                    useContextMenuStore.getState().openForEvent(e, { kind: 'album', album: a })
                  }
                  className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
                >
                  <Cover url={a.coverUrl} className="aspect-square w-full" />
                  <div className="mt-2 truncate text-sm text-neutral-100">{a.name}</div>
                  <div className="mt-0.5 truncate text-xs text-neutral-500">{a.artistName}</div>
                </Link>
              ))}
            </div>
            {/* 分批加载哨兵：紧凑空挡（h-8），滚动到底自动续拉并在空挡内提示加载中 */}
            {hasMore && (
              <div
                ref={sentinelRef}
                className="flex h-8 items-center justify-center text-xs text-neutral-500"
              >
                {loadingMore ? '加载中…' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
