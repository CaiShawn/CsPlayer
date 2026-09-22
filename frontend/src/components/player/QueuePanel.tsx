import { usePlayerStore } from '../../stores/playerStore'
import { artistNames } from '../../utils/format'

export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playing = usePlayerStore((s) => s.playing)
  const queueVisible = usePlayerStore((s) => s.queueVisible)
  const toggleQueue = usePlayerStore((s) => s.toggleQueue)
  const jumpTo = usePlayerStore((s) => s.jumpTo)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const clearQueue = usePlayerStore((s) => s.clearQueue)

  if (!queueVisible) return null

  return (
    <div className="fixed bottom-20 right-0 top-16 z-50 flex w-80 flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="text-sm text-neutral-200">播放队列（{queue.length}）</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearQueue}
            className="text-xs text-neutral-500 hover:text-neutral-200"
          >
            清空
          </button>
          <button
            type="button"
            onClick={toggleQueue}
            className="text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">队列为空</div>
        )}
        {queue.map((song, index) => (
          <div
            key={`${song.id}-${index}`}
            onDoubleClick={() => jumpTo(index)}
            className={`group flex items-center gap-2 px-4 py-2 text-sm ${
              index === currentIndex
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            <span className="w-5 shrink-0 text-xs text-neutral-600">
              {index === currentIndex && playing ? '▶' : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{song.name}</div>
              <div className="truncate text-xs text-neutral-500">
                {artistNames(song.artists)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeFromQueue(index)
              }}
              className="hidden text-xs text-neutral-500 hover:text-red-400 group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
