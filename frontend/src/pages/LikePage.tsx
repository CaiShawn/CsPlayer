import { useEffect } from 'react'
import type { SongSummary } from '../types'
import { Empty, ErrorBar, LoadError, LoadingMore, SongSkeleton } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'

export function LikePage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const tracks = useLikesStore((s) => s.tracks)
  const tracksLoaded = useLikesStore((s) => s.tracksLoaded)
  const tracksError = useLikesStore((s) => s.tracksError)
  const total = useLikesStore((s) => s.total)
  const hasMore = useLikesStore((s) => s.hasMore)
  const loadingMore = useLikesStore((s) => s.loadingMore)
  const ids = useLikesStore((s) => s.ids)
  const fetchIds = useLikesStore((s) => s.fetchIds)
  const fetchTracks = useLikesStore((s) => s.fetchTracks)
  const fetchMoreTracks = useLikesStore((s) => s.fetchMoreTracks)
  const toggle = useLikesStore((s) => s.toggle)

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  useEffect(() => {
    void fetchTracks(dataVersion)
    void fetchIds(dataVersion)
  }, [dataVersion, fetchTracks, fetchIds])

  // 分批加载：滚动到底自动续拉后 30 首
  const sentinelRef = useInfiniteScroll(
    () => void fetchMoreTracks(dataVersion),
    tracksLoaded && hasMore && !loadingMore,
  )

  // 曲目数：ids 为全量红心集合（拉全前 total 为上游 hint）
  const count = ids.size > 0 ? ids.size : total

  const playAll = () => {
    // 播放当前已加载的（分批前缀）可播曲目
    const playable = tracks.filter((t) => t.playable)
    if (!playable.length) return
    usePlayerStore.getState().playSongs(playable, 0)
  }

  const onPlay = (index: number) => {
    const playable = tracks.filter((t) => t.playable)
    const song = tracks[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore.getState().playSongs(playable, Math.max(0, start))
  }

  const onToggleLike = (song: SongSummary) => {
    void toggle(song)
  }

  return (
    <div className="p-8 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">我喜欢</h1>
          <p className="mt-1 text-sm text-neutral-500">
            云端「我喜欢的音乐」{tracksLoaded && count > 0 ? ` · ${count} 首` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={playAll}
          disabled={!tracks.some((t) => t.playable)}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-accent-hover disabled:opacity-40"
        >
          ▶ 播放全部
        </button>
      </div>

      <div className="mt-6">
        {/* SWR（§4.3 a）：有缓存直接渲染 + 顶部错误条提示刷新失败；无缓存才出骨架 */}
        {tracksError && tracksLoaded && (
          <ErrorBar
            message={`${tracksError}（当前显示的是上次缓存内容）`}
            onRetry={() => void fetchTracks(dataVersion)}
          />
        )}
        {!tracksLoaded && !tracksError ? (
          <SongSkeleton />
        ) : !tracksLoaded ? (
          <LoadError message={tracksError} onRetry={() => void fetchTracks(dataVersion)} />
        ) : tracks.length === 0 ? (
          <Empty text="暂无喜欢的歌曲" />
        ) : (
          <SongTable
            tracks={tracks}
            currentId={currentId}
            playing={playing}
            onPlay={onPlay}
            likedIds={ids}
            onToggleLike={onToggleLike}
          />
        )}
        {/* 分批加载哨兵：紧凑空挡（h-8），滚动到底自动续拉并在空挡内高亮提示加载中 */}
        {tracksLoaded && hasMore && (
          <div ref={sentinelRef}>{loadingMore && <LoadingMore />}</div>
        )}
      </div>
    </div>
  )
}
