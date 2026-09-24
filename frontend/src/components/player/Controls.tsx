import { useEffect, useRef, useState } from 'react'
import { Slider } from '../common/Slider'
import { usePlayerStore, PLAY_MODE_LABEL, QUALITY_LABEL, QUALITY_LEVELS } from '../../stores/playerStore'
import { formatTime } from '../../utils/format'

export function ProgressBar() {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const seek = usePlayerStore((s) => s.seek)

  const pct = duration > 0 ? currentTime / duration : 0

  return (
    <div className="flex w-full items-center gap-2 text-xs text-neutral-400">
      <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
      <Slider
        className="flex-1"
        value={pct}
        disabled={duration <= 0}
        label="播放进度"
        onChange={(v) => {
          if (duration > 0) seek(v * duration)
        }}
      />
      <span className="w-10 tabular-nums">{formatTime(duration)}</span>
    </div>
  )
}

/* 静音钮三态图标（静音 / 低 / 高，S1-3） */
function VolumeIcon({ state }: { state: 'muted' | 'low' | 'high' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h2.5L9 3v10L5.5 10H3z" />
      {state === 'muted' ? (
        <path d="M11.5 6.5l3 3M14.5 6.5l-3 3" />
      ) : (
        <>
          <path d="M10.8 6.2a3 3 0 010 3.6" />
          {state === 'high' && <path d="M12.6 4.8a5.2 5.2 0 010 6.4" />}
        </>
      )}
    </svg>
  )
}

export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)
  /** 静音前音量（音量为 0 时恢复用，设计 §4.2.3） */
  const preMuteRef = useRef<number | null>(null)

  const iconState: 'muted' | 'low' | 'high' =
    muted || volume === 0 ? 'muted' : volume < 0.5 ? 'low' : 'high'

  // 切静音：记住静音前音量（store 的 muted 不清 volume，取消静音天然恢复准确）；
  // 取消静音 / 音量为 0 时点击：回到记忆音量（无记录则 50%）
  const handleMute = () => {
    const s = usePlayerStore.getState()
    if (s.muted) {
      s.setVolume(s.volume > 0 ? s.volume : (preMuteRef.current ?? 0.5))
      return
    }
    if (s.volume > 0) {
      preMuteRef.current = s.volume
      toggleMute()
    } else {
      setVolume(preMuteRef.current ?? 0.5)
    }
  }

  return (
    // gap-3：静音图标 ↔ 音量滑条 12px（与滑条右侧到「词」的间距对齐）
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleMute}
        className="text-neutral-400 hover:text-neutral-100"
        title={muted ? '取消静音' : '静音'}
        aria-label={muted ? '取消静音' : '静音'}
      >
        <VolumeIcon state={iconState} />
      </button>
      <Slider
        // -mr-2：吃掉「词」按钮 px-2 的左内边距，滑轨 → 「词」字形同样 12px
        className="w-20 -mr-2"
        value={muted ? 0 : volume}
        onChange={setVolume}
        label="音量"
        format={(v) => (muted ? '静音' : `${Math.round(v * 100)}%`)}
        wheel
        keyboard={false} /* 键盘调音量暂时关闭，随 v0.1.7 快捷键扩展回归；恢复 = 删掉这一行 */
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
                lv === quality ? 'text-accent-text' : 'text-neutral-200'
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
