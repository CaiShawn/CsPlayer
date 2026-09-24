import { useEffect, useState } from 'react'
import type { SongSummary } from '../types'
import { Empty, ErrorBar, LoadError, LoadingMore, SongSkeleton } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'

export function LikePage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const tracks = useLikesStore((s) => s.tracks)
  const tracksLoaded = useLikesStore((s) => s.tracksLoaded)
  const tracksError = useLikesStore((s) => s.tracksError)
  const total = useLikesStore((s) => s.total)
  const hasMore = useLikesStore((s) => s.hasMore)
  const loadingMore = useLikesStore((s) => s.loadingMore)
  const loadMoreError = useLikesStore((s) => s.loadMoreError)
  const ids = useLikesStore((s) => s.ids)
  const fetchIds = useLikesStore((s) => s.fetchIds)
  const fetchTracks = useLikesStore((s) => s.fetchTracks)
  const fetchMoreTracks = useLikesStore((s) => s.fetchMoreTracks)
  const fetchAllTracks = useLikesStore((s) => s.fetchAllTracks)
  const retryLoadMore = useLikesStore((s) => s.retryLoadMore)
  const setToast = useUiStore((s) => s.setToast)
  const toggle = useLikesStore((s) => s.toggle)

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  useEffect(() => {
    void fetchTracks(dataVersion)
    void fetchIds(dataVersion)
  }, [dataVersion, fetchTracks, fetchIds])

  // 分批加载：滚动到底自动续拉下一批；失败断链（loadMoreError）停发，待手动重试
  const sentinelRef = useInfiniteScroll(
    () => void fetchMoreTracks(dataVersion),
    tracksLoaded && hasMore && !loadingMore && !loadMoreError,
  )

  // 曲目数：ids 为全量红心集合（拉全前 total 为上游 hint）
  const count = ids.size > 0 ? ids.size : total

  const [toppingUp, setToppingUp] = useState(false)

  const playAll = () => {
    // 立即用已加载前缀开播（不等全量），随后台补全为整份歌单并原位扩展队列
    const playable = tracks.filter((t) => t.playable)
    if (!playable.length) return
    usePlayerStore.getState().playSongs(playable, 0, '我喜欢的音乐')
    const epoch = usePlayerStore.getState().queueEpoch
    setToppingUp(true)
    void (async () => {
      try {
        const all = (await fetchAllTracks(dataVersion)).filter((t) => t.playable)
        // epoch 不变才替换（队列被动过则放弃补全，不覆盖用户操作）；
        // 当前曲/进度/播放状态原位保留
        usePlayerStore.getState().topUpQueue(all, epoch)
      } catch (e) {
        // 补全失败不打断播放（当前前缀继续）；不可播曲目照旧过滤
        setToast(e instanceof Error ? e.message : '补全播放列表失败')
      } finally {
        setToppingUp(false)
      }
    })()
  }

  const onPlay = (index: number) => {
    const playable = tracks.filter((t) => t.playable)
    const song = tracks[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), '我喜欢的音乐')
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
            {toppingUp ? ' · 正在补全播放列表…' : ''}
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
        {/* 分批加载哨兵：整块底部空白（列表底 → 播放条上沿）即本元素 h-36=144px，
            「加载中」在空白正中垂直居中；-mb-28 抵消 pb-24×2 超出播放条的 112px，
            整体留白不变（哨兵上沿仍在列表底部，滚动触发时机不受影响） */}
        {tracksLoaded && hasMore && (
          <div ref={sentinelRef} className="-mb-28 flex h-36 items-center justify-center">
            {loadingMore ? (
              <LoadingMore />
            ) : loadMoreError ? (
              <button
                type="button"
                onClick={() => void retryLoadMore(dataVersion)}
                className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                {loadMoreError} · 点击重试
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
