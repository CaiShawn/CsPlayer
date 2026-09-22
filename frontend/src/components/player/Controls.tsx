import { useEffect, useRef, useState } from 'react'
import { usePlayerStore, PLAY_MODE_LABEL, QUALITY_LABEL, QUALITY_LEVELS } from '../../stores/playerStore'
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
      title={PLAY_MODE_LABEL[playMode]}
    >
      <span className="text-sm leading-none">{icon[playMode]}</span>
    </button>
  )
}

export function QualitySelector() {
  const quality = usePlayerStore((s) => s.quality)
  const setQuality = usePlayerStore((s) => s.setQuality)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="音质选择"
        className="rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
      >
        <span className="text-xs leading-none">{QUALITY_LABEL[quality]}</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-28 -translate-x-1/2 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
          {QUALITY_LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-neutral-800 ${
                lv === quality ? 'text-emerald-400' : 'text-neutral-200'
              }`}
              onClick={() => {
                setQuality(lv)
                setOpen(false)
              }}
            >
              {QUALITY_LABEL[lv]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
