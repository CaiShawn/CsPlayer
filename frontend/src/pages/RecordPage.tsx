import { useEffect, useState } from 'react'
import { libraryApi } from '../api'
import type { RecordItem, SongSummary } from '../types'
import { Empty, Loading } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'

export function RecordPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const ids = useLikesStore((s) => s.ids)
  const toggle = useLikesStore((s) => s.toggle)

  const [type, setType] = useState<'all' | 'week'>('all')
  const [items, setItems] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await libraryApi.record(type, 50)
        if (!cancelled) setItems(data || [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataVersion, type])

  const tracks: SongSummary[] = items.map((i) => i.song)

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

  return (
    <div className="p-8 pb-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">听歌排行榜</h1>
          <p className="mt-1 text-sm text-neutral-500">
            云端听歌排行 · 按播放次数{' '}
            {items.length ? `· 共 ${items.length} 首` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-neutral-700 text-sm">
            <button
              type="button"
              onClick={() => setType('all')}
              className={`px-4 py-1.5 ${
                type === 'all'
                  ? 'bg-accent text-neutral-950'
                  : 'text-neutral-300 hover:bg-neutral-900'
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setType('week')}
              className={`px-4 py-1.5 ${
                type === 'week'
                  ? 'bg-accent text-neutral-950'
                  : 'text-neutral-300 hover:bg-neutral-900'
              }`}
            >
              最近一周
            </button>
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
      </div>

      <div className="mt-6">
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="text-center text-sm text-red-400">{error}</div>
        ) : tracks.length === 0 ? (
          <Empty text="暂无听歌记录" />
        ) : (
          <div>
            <SongTable
              tracks={tracks}
              currentId={currentId}
              playing={playing}
              onPlay={onPlay}
              likedIds={ids}
              onToggleLike={(song) => void toggle(song)}
              extraHeader={<th className="w-20 px-3 py-2 text-right font-medium">播放</th>}
              extraCell={(song) => {
                const item = items.find((i) => i.song.id === song.id)
                return (
                  <td className="px-3 py-2 text-right text-neutral-500">
                    {item?.playCount ?? 0}
                  </td>
                )
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
