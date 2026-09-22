import { usePlayerStore } from '../../stores/playerStore'
import { artistNames } from '../../utils/format'
import { Cover } from '../common/Cover'
import { PlayModeButton, ProgressBar, VolumeControl } from './Controls'

export function PlayerBar() {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playing = usePlayerStore((s) => s.playing)
  const playMode = usePlayerStore((s) => s.playMode)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const toggleQueue = usePlayerStore((s) => s.toggleQueue)
  const toggleLyric = usePlayerStore((s) => s.toggleLyric)

  const song = currentIndex >= 0 ? queue[currentIndex] : null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-20 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center gap-4 px-4">
        {/* song info */}
        <div className="flex min-w-0 w-56 items-center gap-3">
          <Cover url={song?.coverUrl || ''} className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm text-neutral-100">
              {song?.name || '未在播放'}
            </div>
            <div className="truncate text-xs text-neutral-500">
              {song ? artistNames(song.artists) : '—'}
            </div>
          </div>
        </div>

        {/* transport */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <PlayModeButton />
            <button
              type="button"
              onClick={prev}
              className="px-2 text-neutral-300 hover:text-white"
              title="上一首"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
              title={playing ? '暂停' : '播放'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={next}
              className="px-2 text-neutral-300 hover:text-white"
              title="下一首"
            >
              ⏭
            </button>
            <span className="w-16 text-xs text-neutral-500">
              {playMode === 'order'
                ? '顺序'
                : playMode === 'list-loop'
                  ? '列表循环'
                  : playMode === 'single'
                    ? '单曲'
                    : '随机'}
            </span>
          </div>
          <ProgressBar />
        </div>

        {/* right tools */}
        <div className="flex w-56 items-center justify-end gap-3">
          <VolumeControl />
          <button
            type="button"
            onClick={toggleLyric}
            className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            词
          </button>
          <button
            type="button"
            onClick={toggleQueue}
            className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            队列
          </button>
        </div>
      </div>
    </div>
  )
}
