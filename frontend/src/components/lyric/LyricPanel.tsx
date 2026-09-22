import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { artistNames } from '../../utils/format'

export function LyricPanel() {
  const lyric = usePlayerStore((s) => s.lyric)
  const currentLyricIndex = usePlayerStore((s) => s.currentLyricIndex)
  const lyricVisible = usePlayerStore((s) => s.lyricVisible)
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const listRef = useRef<HTMLDivElement>(null)

  const song = currentIndex >= 0 ? queue[currentIndex] : null

  useEffect(() => {
    const el = listRef.current
    if (!el || currentLyricIndex < 0) return
    const child = el.children[currentLyricIndex] as HTMLElement | undefined
    if (child) {
      child.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentLyricIndex])

  if (!lyricVisible) return null

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 px-4 py-4">
        <div className="text-sm text-neutral-100">{song?.name || '未在播放'}</div>
        <div className="text-xs text-neutral-500">
          {song ? artistNames(song.artists) : '—'}
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6">
        {lyric.lrc.length === 0 && (
          <div className="text-center text-sm text-neutral-500">暂无歌词</div>
        )}
        {!lyric.hasTime &&
          lyric.lrc.map((line, i) => (
            <p key={i} className="mb-2 text-sm leading-6 text-neutral-400">
              {line.text}
            </p>
          ))}
        {lyric.hasTime &&
          lyric.lrc.map((line, i) => (
            <p
              key={i}
              className={`mb-3 cursor-pointer text-sm leading-6 transition-colors ${
                i === currentLyricIndex
                  ? 'text-lg font-medium text-emerald-300'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
              onClick={() => usePlayerStore.getState().seek(line.timeMs / 1000)}
            >
              {line.text}
            </p>
          ))}
      </div>
    </aside>
  )
}
