import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import type { AlbumBrief, PlaylistBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { CardGridSkeleton, Empty, ErrorBar } from '../components/common/Ui'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'

const PAGE_SIZE = 50

interface LibraryData {
  created: PlaylistBrief[]
  subscribed: PlaylistBrief[]
  albums: AlbumBrief[]
  hasMore: boolean
}

/** SWR 内存快照（§4.3 a）：二次进入立即渲染缓存内容（<100ms），后台静默刷新；
 *  按 authStore.dataVersion 归属，切账号不串数据。 */
let snapshot: { version: number; data: LibraryData } | null = null

export function LibraryPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const cached = snapshot?.version === dataVersion ? snapshot.data : null
  const [data, setData] = useState<LibraryData | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const load = useCallback(async () => {
    const warm = snapshot?.version === dataVersion ? snapshot.data : null
    // SWR：有缓存先显缓存（静默刷新）；无缓存/切账号 → 骨架屏
    if (warm) setData(warm)
    else {
      setData(null)
      setLoading(true)
    }
    setError('')
    try {
      const [pl, al] = await Promise.all([
        libraryApi.playlists(),
        libraryApi.albums(0, PAGE_SIZE),
      ])
      const first = al.items || []
      // 静默刷新保留用户已「加载更多」的尾部专辑（分页由用户驱动，避免闪烁/丢滚动位置）
      const tail =
        warm && warm.albums.length > first.length
          ? warm.albums.slice(first.length)
          : []
      const headIds = new Set(first.map((a) => a.id))
      const next: LibraryData = {
        created: pl.created || [],
        subscribed: pl.subscribed || [],
        albums: [...first, ...tail.filter((a) => !headIds.has(a.id))],
        hasMore: !!al.hasMore,
      }
      snapshot = { version: dataVersion, data: next }
      setData(next)
      setError('')
    } catch (e) {
      // SWR：失败保留上次缓存（若有），由顶部错误条提示 + 重试
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dataVersion])

  useEffect(() => {
    void load()
  }, [load, reloadTick])

  const onLoadMoreAlbums = async () => {
    if (!data || loadingMore || !data.hasMore) return
    setLoadingMore(true)
    try {
      const al = await libraryApi.albums(data.albums.length, PAGE_SIZE)
      setData((prev) => {
        if (!prev) return prev
        const next: LibraryData = {
          ...prev,
          albums: [...prev.albums, ...(al.items || [])],
          hasMore: !!al.hasMore,
        }
        if (snapshot?.version === dataVersion) snapshot = { version: dataVersion, data: next }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <LibrarySkeleton />
  if (!data) {
    return (
      <div className="p-8">
        <ErrorBar
          message={error || '加载失败'}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-10 p-8 pb-28">
      {error && (
        <ErrorBar
          message={`${error}（当前显示的是上次缓存内容）`}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      )}
      <Section title="我创建的歌单">
        {data.created.length === 0 ? (
          <Empty text="暂无创建的歌单" />
        ) : (
          <CardGrid>
            {data.created.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section title="我收藏的歌单">
        {data.subscribed.length === 0 ? (
          <Empty text="暂无收藏的歌单" />
        ) : (
          <CardGrid>
            {data.subscribed.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section title="收藏的专辑">
        {data.albums.length === 0 ? (
          <Empty text="暂无收藏的专辑" />
        ) : (
          <>
            <CardGrid>
              {data.albums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </CardGrid>
            {data.hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => void onLoadMoreAlbums()}
                  disabled={loadingMore}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-6 py-2 text-sm text-neutral-200 hover:border-accent/50 hover:text-accent-soft disabled:opacity-50"
                >
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  )
}

/** 冷加载骨架屏：三节布局与真实内容一致，首屏即刻可交互（§4.3 a） */
function LibrarySkeleton() {
  return (
    <div className="space-y-10 p-8 pb-28">
      {[0, 1, 2].map((i) => (
        <section key={i}>
          <div className="mb-4 h-5 w-28 animate-pulse rounded bg-neutral-800" />
          <CardGridSkeleton count={5} />
        </section>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-neutral-100">{title}</h2>
      {children}
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  )
}

function PlaylistCard({ playlist }: { playlist: PlaylistBrief }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      onContextMenu={(e) =>
        useContextMenuStore.getState().openForEvent(e, { kind: 'playlist', playlist })
      }
      className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
    >
      <Cover url={playlist.coverUrl} className="aspect-square w-full" />
      <div className="mt-2 truncate text-sm text-neutral-100">{playlist.name}</div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {playlist.trackCount} 首
        {playlist.subscribed ? ` · ${playlist.creatorName}` : ''}
      </div>
    </Link>
  )
}

function AlbumCard({ album }: { album: AlbumBrief }) {
  return (
    <Link
      to={`/album/${album.id}`}
      onContextMenu={(e) =>
        useContextMenuStore.getState().openForEvent(e, { kind: 'album', album })
      }
      className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
    >
      <Cover url={album.coverUrl} className="aspect-square w-full" />
      <div className="mt-2 truncate text-sm text-neutral-100">{album.name}</div>
      <div className="mt-0.5 truncate text-xs text-neutral-500">{album.artistName}</div>
    </Link>
  )
}
