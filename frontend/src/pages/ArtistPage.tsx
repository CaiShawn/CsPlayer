import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PAGE_SIZE, searchApi } from '../api'
import type { AlbumBrief, ArtistDetail, SongSummary } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, LoadError, Loading } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useContextMenuStore } from '../stores/contextMenuStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'

/** 歌手页（只读最小闭环）：热门歌曲 + 专辑列表（每页 PAGE_SIZE 张，可加载更多），不做关注 / 收藏 */
export function ArtistPage() {
  const { id } = useParams()
  const likedIds = useLikesStore((s) => s.ids)
  const toggleLike = useLikesStore((s) => s.toggle)
  const [detail, setDetail] = useState<ArtistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const [albums, setAlbums] = useState<AlbumBrief[]>([])
  const [albumTotal, setAlbumTotal] = useState(0)
  const [albumHasMore, setAlbumHasMore] = useState(false)
  const [albumsLoading, setAlbumsLoading] = useState(true)
  const [albumsError, setAlbumsError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [albumReload, setAlbumReload] = useState(0)

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await searchApi.artist(Number(id))
        if (!cancelled) setDetail(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, reload])

  // 专辑列表：分页拉取（每页 PAGE_SIZE 张）
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setAlbumsLoading(true)
      setAlbumsError('')
      setMoreError('')
      try {
        const data = await searchApi.artistAlbums(Number(id), 0, PAGE_SIZE)
        if (cancelled) return
        setAlbums(data.items)
        setAlbumTotal(data.total)
        setAlbumHasMore(data.hasMore)
      } catch (e) {
        if (!cancelled) setAlbumsError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setAlbumsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, albumReload])

  const onLoadMoreAlbums = async () => {
    if (loadingMore || !albumHasMore || !id) return
    setLoadingMore(true)
    setMoreError('')
    try {
      const data = await searchApi.artistAlbums(Number(id), albums.length, PAGE_SIZE)
      setAlbums((prev) => {
        const seen = new Set(prev.map((a) => a.id))
        return [...prev, ...data.items.filter((a) => !seen.has(a.id))]
      })
      setAlbumTotal(data.total)
      setAlbumHasMore(data.hasMore)
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : '加载失败，请重试')
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <Loading />
  if (error)
    return <LoadError message={error} onRetry={() => setReload((n) => n + 1)} />
  if (!detail) return <Empty text="歌手不存在" />

  const hotSongs: SongSummary[] = detail.hotSongs

  const playAll = () => {
    const playable = hotSongs.filter((t) => t.playable)
    if (playable.length)
      usePlayerStore
        .getState()
        .playSongs(playable, 0, detail ? `歌手《${detail.name}》` : '热门歌曲')
  }

  const onPlay = (index: number) => {
    const playable = hotSongs.filter((t) => t.playable)
    const song = hotSongs[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore
      .getState()
      .playSongs(playable, Math.max(0, start), detail ? `歌手《${detail.name}》` : '热门歌曲')
  }

  return (
    <div className="p-8 pb-28">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-full bg-neutral-800 shadow-xl">
          {detail.avatarUrl ? (
            <img src={detail.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-neutral-600">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-neutral-500">歌手</div>
          <h1 className="mt-1 truncate text-2xl font-bold text-neutral-50">{detail.name}</h1>
          {detail.alias && <div className="mt-1 text-sm text-neutral-500">{detail.alias}</div>}
          {detail.briefDesc && (
            <p className="mt-3 line-clamp-4 max-w-2xl whitespace-pre-line text-xs leading-5 text-neutral-500">
              {detail.briefDesc}
            </p>
          )}
          <button
            type="button"
            onClick={playAll}
            disabled={!hotSongs.some((t) => t.playable)}
            className="mt-5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-accent-hover disabled:opacity-40"
          >
            ▶ 播放热门歌曲
          </button>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">
          热门歌曲{hotSongs.length ? `（${hotSongs.length}）` : ''}
        </h2>
        {hotSongs.length === 0 ? (
          <Empty text="暂无热门歌曲" />
        ) : (
          <SongTable
            tracks={hotSongs}
            currentId={currentId}
            playing={playing}
            onPlay={onPlay}
            likedIds={likedIds}
            onToggleLike={(song) => void toggleLike(song)}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">
          专辑{albumTotal ? `（${albumTotal}）` : albums.length ? `（${albums.length}）` : ''}
        </h2>
        {albumsLoading ? (
          <Loading />
        ) : albumsError ? (
          <LoadError message={albumsError} onRetry={() => setAlbumReload((n) => n + 1)} />
        ) : albums.length === 0 ? (
          <Empty text="暂无专辑" />
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
            {(albumHasMore || moreError) && (
              <div className="mt-8 flex flex-col items-center gap-2">
                {moreError && <div className="text-xs text-red-400">{moreError}</div>}
                {albumHasMore && (
                  <button
                    type="button"
                    onClick={() => void onLoadMoreAlbums()}
                    disabled={loadingMore}
                    className="rounded-full border border-neutral-700 bg-neutral-900 px-6 py-2 text-sm text-neutral-200 hover:border-accent/50 hover:text-accent-soft disabled:opacity-50"
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
