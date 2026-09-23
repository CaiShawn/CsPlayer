import { useEffect, useMemo, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { artistNames } from '../../utils/format'

export function LyricPanel() {
  const lyric = usePlayerStore((s) => s.lyric)
  const currentLyricIndex = usePlayerStore((s) => s.currentLyricIndex)
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const lyricPrefs = useSettingsStore((s) => s.prefs.lyric)
  const listRef = useRef<HTMLDivElement>(null)

  // 歌词偏好：字号 / 翻译 / 高亮
  const sizeClass =
    lyricPrefs.fontSize === 'sm'
      ? 'text-sm'
      : lyricPrefs.fontSize === 'lg'
        ? 'text-lg'
        : 'text-base'
  const highlight = lyricPrefs.highlightCurrent
  const showTrans = lyricPrefs.showTranslation
  const transMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const t of lyric.tlyric) {
      if (t.text.trim()) m.set(t.timeMs, t.text)
    }
    return m
  }, [lyric])

  const song = currentIndex >= 0 ? queue[currentIndex] : null

  useEffect(() => {
    const el = listRef.current
    if (!el || currentLyricIndex < 0) return
    const child = el.children[currentLyricIndex] as HTMLElement | undefined
    if (child) {
      child.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentLyricIndex])

  // 未播放（无曲目）不渲染
  if (!song) return null

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
      <div className="flex items-start justify-between gap-2 border-b border-neutral-800 px-4 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm text-neutral-100">{song.name}</div>
          <div className="truncate text-xs text-neutral-500">
            {artistNames(song.artists)}
          </div>
        </div>
        <button
          type="button"
          title="收起歌词"
          onClick={() => usePlayerStore.getState().setLyricCollapsed(true)}
          className="shrink-0 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
        >
          收起
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
        {lyric.lrc.length === 0 && (
          <div className="text-center text-sm text-neutral-500">暂无歌词</div>
        )}
        {!lyric.hasTime &&
          lyric.lrc.map((line, i) => (
            <p key={i} className={`mb-2 leading-6 text-neutral-400 ${sizeClass}`}>
              {line.text}
            </p>
          ))}
        {lyric.hasTime &&
          lyric.lrc.map((line, i) => {
            const active = i === currentLyricIndex
            const trans = showTrans ? transMap.get(line.timeMs) : undefined
            return (
              <p
                key={i}
                className={`mb-3 cursor-pointer leading-6 transition-colors ${sizeClass} ${
                  highlight
                    ? active
                      ? 'font-medium text-accent-soft'
                      : 'text-neutral-500 hover:text-neutral-300'
                    : 'text-neutral-200 hover:text-neutral-100'
                }`}
                onClick={() => usePlayerStore.getState().seek(line.timeMs / 1000)}
              >
                {line.text}
                {trans && (
                  <span className="mt-0.5 block text-xs leading-4 text-neutral-500">{trans}</span>
                )}
              </p>
            )
          })}
      </div>
    </aside>
  )
}
