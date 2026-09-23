import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import type { AlbumBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, Loading } from '../components/common/Ui'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'

const PAGE_SIZE = 50

export function ShelfPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const [albums, setAlbums] = useState<AlbumBrief[]>([])
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

  const onLoadMore = () => {
    if (loadingMore || !hasMore) return
    void load(albums.length, false)
  }

  return (
    <div className="p-8 pb-28">
      <h1 className="text-2xl font-bold text-neutral-50">唱片架</h1>
      <p className="mt-1 text-sm text-neutral-500">收藏的专辑 · 最近 50 张</p>

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
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-6 py-2 text-sm text-neutral-200 hover:border-accent/50 hover:text-accent-soft disabled:opacity-50"
                >
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
