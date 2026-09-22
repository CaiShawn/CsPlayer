import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import type { AlbumBrief, PlaylistBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, Loading } from '../components/common/Ui'
import { useAuthStore } from '../stores/authStore'

const PAGE_SIZE = 50

export function LibraryPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const [created, setCreated] = useState<PlaylistBrief[]>([])
  const [subscribed, setSubscribed] = useState<PlaylistBrief[]>([])
  const [albums, setAlbums] = useState<AlbumBrief[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const loadAlbums = useCallback(async (offset: number, replace: boolean) => {
    if (replace) setError('')
    else setLoadingMore(true)
    try {
      const data = await libraryApi.albums(offset, PAGE_SIZE)
      const items = data.items || []
      setAlbums((prev) => (replace ? items : [...prev, ...items]))
      setHasMore(!!data.hasMore)
    } catch (e) {
      if (replace) setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [pl, al] = await Promise.all([
          libraryApi.playlists(),
          libraryApi.albums(0, PAGE_SIZE),
        ])
        if (cancelled) return
        setCreated(pl.created || [])
        setSubscribed(pl.subscribed || [])
        setAlbums(al.items || [])
        setHasMore(!!al.hasMore)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataVersion, loadAlbums])

  const onLoadMoreAlbums = () => {
    if (loadingMore || !hasMore) return
    void loadAlbums(albums.length, false)
  }

  if (loading) return <Loading />
  if (error)
    return (
      <div className="p-8 text-center text-sm text-red-400">{error}</div>
    )

  return (
    <div className="space-y-10 p-8 pb-28">
      <Section title="我创建的歌单">
        {created.length === 0 ? (
          <Empty text="暂无创建的歌单" />
        ) : (
          <CardGrid>
            {created.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section title="我收藏的歌单">
        {subscribed.length === 0 ? (
          <Empty text="暂无收藏的歌单" />
        ) : (
          <CardGrid>
            {subscribed.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section title="收藏的专辑">
        {albums.length === 0 ? (
          <Empty text="暂无收藏的专辑" />
        ) : (
          <>
            <CardGrid>
              {albums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </CardGrid>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMoreAlbums}
                  disabled={loadingMore}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-6 py-2 text-sm text-neutral-200 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50"
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  )
}

function PlaylistCard({ playlist }: { playlist: PlaylistBrief }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="group rounded-xl border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
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
      className="group rounded-xl border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
    >
      <Cover url={album.coverUrl} className="aspect-square w-full" />
      <div className="mt-2 truncate text-sm text-neutral-100">{album.name}</div>
      <div className="mt-0.5 truncate text-xs text-neutral-500">{album.artistName}</div>
    </Link>
  )
}
