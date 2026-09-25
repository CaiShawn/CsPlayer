import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { libraryApi } from '../api'
import type { PlaylistDetail, SongSummary } from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, LoadError, Loading } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'
import { pushRecentAlbum, pushRecentPlaylist } from '../utils/recentPlays'

export function PlaylistPage() {
  const { id } = useParams()
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const likedIds = useLikesStore((s) => s.ids)
  const toggleLike = useLikesStore((s) => s.toggle)
  const [detail, setDetail] = useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

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
        const data = await libraryApi.playlistDetail(Number(id))
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
  }, [id, dataVersion, reload])

  if (loading) return <Loading />
  if (error)
    return <LoadError message={error} onRetry={() => setReload((n) => n + 1)} />
  if (!detail) return <Empty text="歌单不存在" />

  const playAll = () => {
    const playable = detail.tracks.filter((t) => t.playable)
    if (!playable.length) return
    pushRecentPlaylist({
      id: detail.id,
      name: detail.name,
      coverUrl: detail.coverUrl,
      trackCount: detail.trackCount,
      creatorName: detail.creatorName,
      subscribed: detail.subscribed,
    })
    usePlayerStore.getState().playSongs(playable, 0, `歌单《${detail.name}》`)
  }

  const onPlay = (index: number) => {
    const playable = detail.tracks.filter((t) => t.playable)
    const song = detail.tracks[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    pushRecentPlaylist({
      id: detail.id,
      name: detail.name,
      coverUrl: detail.coverUrl,
      trackCount: detail.trackCount,
      creatorName: detail.creatorName,
      subscribed: detail.subscribed,
    })
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), `歌单《${detail.name}》`)
  }

  return (
    <div className="p-8 pb-28">
      <DetailHeader
        cover={detail.coverUrl}
        title={detail.name}
        subtitle={`${detail.creatorName} · ${detail.trackCount} 首`}
        description={detail.description}
        onPlayAll={playAll}
        onShare={() => useUiStore.getState().openShareCard({ kind: 'playlist', playlist: detail })}
      />
      <div className="mt-6">
        {detail.tracks.length === 0 ? (
          <Empty text="歌单暂无歌曲" />
        ) : (
          <SongTable
            tracks={detail.tracks}
            currentId={currentId}
            playing={playing}
            onPlay={onPlay}
            likedIds={likedIds}
            onToggleLike={(song) => void toggleLike(song)}
          />
        )}
      </div>
    </div>
  )
}

export function AlbumPage() {
  const { id } = useParams()
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const likedIds = useLikesStore((s) => s.ids)
  const toggleLike = useLikesStore((s) => s.toggle)
  const [detail, setDetail] = useState<{
    id: number
    name: string
    coverUrl: string
    artistId: number
    artistName: string
    description: string
    tracks: SongSummary[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

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
        const data = await libraryApi.albumDetail(Number(id))
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
  }, [id, dataVersion, reload])

  if (loading) return <Loading />
  if (error) return <LoadError message={error} onRetry={() => setReload((n) => n + 1)} />
  if (!detail) return <Empty text="专辑不存在" />

  const playAll = () => {
    const playable = detail.tracks.filter((t) => t.playable)
    if (!playable.length) return
    pushRecentAlbum({
      id: detail.id,
      name: detail.name,
      coverUrl: detail.coverUrl,
      artistId: detail.artistId,
      artistName: detail.artistName,
    })
    usePlayerStore.getState().playSongs(playable, 0, `专辑《${detail.name}》`)
  }

  const onPlay = (index: number) => {
    const playable = detail.tracks.filter((t) => t.playable)
    const song = detail.tracks[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    pushRecentAlbum({
      id: detail.id,
      name: detail.name,
      coverUrl: detail.coverUrl,
      artistId: detail.artistId,
      artistName: detail.artistName,
    })
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), `专辑《${detail.name}》`)
  }

  return (
    <div className="p-8 pb-28">
      <DetailHeader
        cover={detail.coverUrl}
        title={detail.name}
        subtitle={detail.artistName}
        description={detail.description}
        onPlayAll={playAll}
        onShare={() => useUiStore.getState().openShareCard({ kind: 'album', album: detail })}
      />
      <div className="mt-6">
        {detail.tracks.length === 0 ? (
          <Empty text="专辑暂无歌曲" />
        ) : (
          <SongTable
            tracks={detail.tracks}
            currentId={currentId}
            playing={playing}
            onPlay={onPlay}
            likedIds={likedIds}
            onToggleLike={(song) => void toggleLike(song)}
          />
        )}
      </div>
    </div>
  )
}

function DetailHeader({
  cover,
  title,
  subtitle,
  description,
  onPlayAll,
  onShare,
}: {
  cover: string
  title: string
  subtitle: string
  description?: string
  onPlayAll: () => void
  /** 可选：专辑 / 歌单页传「分享」（v0.1.8 S1）；不传则不出现按钮 */
  onShare?: () => void
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <Cover url={cover} className="h-48 w-48 shrink-0 shadow-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-neutral-500">列表</div>
        <h1 className="mt-1 truncate text-2xl font-bold text-neutral-50">{title}</h1>
        <div className="mt-2 text-sm text-neutral-400">{subtitle}</div>
        {description && (
          <p className="mt-3 line-clamp-3 max-w-2xl text-xs leading-5 text-neutral-500">
            {description}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onPlayAll}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-accent-hover"
          >
            ▶ 播放全部
          </button>
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-5 py-2 text-sm text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
            >
              ◫ 分享
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
