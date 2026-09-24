import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi, PAGE_SIZE } from '../api'
import type { AlbumBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, Loading, LoadingMore } from '../components/common/Ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'

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
            {/* 分批加载哨兵：整块底部空白（列表底 → 播放条上沿）即本元素 h-36=144px，
                「加载中」在空白正中垂直居中；-mb-28 抵消 pb-24×2 超出播放条的 112px，
                整体留白不变（哨兵上沿仍在列表底部，滚动触发时机不受影响） */}
            {hasMore && (
              <div ref={sentinelRef} className="-mb-28 flex h-36 items-center justify-center">
                {loadingMore && <LoadingMore />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
