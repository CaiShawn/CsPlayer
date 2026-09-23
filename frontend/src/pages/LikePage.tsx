import { useEffect } from 'react'
import type { SongSummary } from '../types'
import { Empty, LoadError, Loading } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'

export function LikePage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const tracks = useLikesStore((s) => s.tracks)
  const tracksLoaded = useLikesStore((s) => s.tracksLoaded)
  const tracksError = useLikesStore((s) => s.tracksError)
  const ids = useLikesStore((s) => s.ids)
  const fetchTracks = useLikesStore((s) => s.fetchTracks)
  const toggle = useLikesStore((s) => s.toggle)

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  useEffect(() => {
    void fetchTracks()
  }, [dataVersion, fetchTracks])

  const playAll = () => {
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
    <div className="p-8 pb-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">我喜欢</h1>
          <p className="mt-1 text-sm text-neutral-500">
            云端「我喜欢的音乐」{tracksLoaded ? ` · ${tracks.length} 首` : ''}
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
        {!tracksLoaded ? (
          <Loading />
        ) : tracksError ? (
          <LoadError message={tracksError} onRetry={() => void fetchTracks()} />
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
      </div>
    </div>
  )
}
