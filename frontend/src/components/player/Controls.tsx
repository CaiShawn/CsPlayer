import { usePlayerStore } from '../../stores/playerStore'
import { formatTime } from '../../utils/format'

export function ProgressBar() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const seek = usePlayerStore((s) => s.seek)

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex w-full items-center gap-2 text-xs text-neutral-400">
      <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.floor(pct * 10)}
        onChange={(e) => {
          const ratio = Number(e.target.value) / 1000
          if (duration > 0) seek(ratio * duration)
        }}
        className="h-1 w-full cursor-pointer accent-emerald-500"
      />
      <span className="w-10 tabular-nums">{formatTime(duration)}</span>
    </div>
  )
}

export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMute}
        className="text-neutral-400 hover:text-neutral-100"
        title={muted ? '取消静音' : '静音'}
      >
        {muted || volume === 0 ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={muted ? 0 : Math.floor(volume * 100)}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        className="h-1 w-20 accent-emerald-500"
      />
    </div>
  )
}

export function PlayModeButton() {
  const playMode = usePlayerStore((s) => s.playMode)
  const togglePlayMode = usePlayerStore((s) => s.togglePlayMode)

  const icon: Record<string, string> = {
    order: '→',
    'list-loop': '∞',
    single: '①',
    shuffle: '⇄',
  }

  return (
    <button
      type="button"
      onClick={togglePlayMode}
      className="rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
      title="播放模式"
    >
      <span className="text-lg leading-none">{icon[playMode]}</span>
    </button>
  )
}
