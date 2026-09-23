import type { ReactNode } from 'react'
import type { SongSummary } from '../../types'
import { artistNames, formatDuration } from '../../utils/format'

interface Props {
  tracks: SongSummary[]
  currentId?: number
  playing?: boolean
  onPlay: (index: number) => void
  likedIds?: Set<number>
  onToggleLike?: (song: SongSummary) => void
  extraHeader?: ReactNode
  extraCell?: (song: SongSummary, index: number) => ReactNode
}

export function SongTable({
  tracks,
  currentId,
  playing,
  onPlay,
  likedIds,
  onToggleLike,
  extraHeader,
  extraCell,
}: Props) {
  const showLike = !!onToggleLike

  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/80 text-neutral-400">
          <tr>
            <th className="w-12 px-3 py-[var(--space-row-y)] text-left font-medium">#</th>
            <th className="px-3 py-[var(--space-row-y)] text-left font-medium">标题</th>
            <th className="px-3 py-[var(--space-row-y)] text-left font-medium">歌手</th>
            <th className="hidden px-3 py-[var(--space-row-y)] text-left font-medium md:table-cell">专辑</th>
            <th className="w-16 px-3 py-[var(--space-row-y)] text-right font-medium">时长</th>
            {extraHeader}
            {showLike && <th className="w-12 px-3 py-[var(--space-row-y)] text-center font-medium">红心</th>}
          </tr>
        </thead>
        <tbody>
          {tracks.map((song, index) => {
            const active = song.id === currentId
            const disabled = !song.playable
            const liked = likedIds?.has(song.id) ?? false
            return (
              <tr
                key={`${song.id}-${index}`}
                onDoubleClick={() => !disabled && onPlay(index)}
                className={[
                  'cursor-pointer transition-colors',
                  active
                    ? 'bg-accent/10 text-accent-soft'
                    : 'hover:bg-neutral-800/60',
                  disabled ? 'opacity-40' : '',
                ].join(' ')}
              >
                <td className="px-3 py-[var(--space-row-y)] text-neutral-500">
                  {active && playing ? (
                    <span className="text-accent-text">▶</span>
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="max-w-[240px] truncate px-3 py-[var(--space-row-y)]">
                  <span className="text-neutral-100">{song.name}</span>
                  {disabled && (
                    <span className="ml-2 text-xs text-red-400">
                      {song.reason || '不可播'}
                    </span>
                  )}
                </td>
                <td className="max-w-[140px] truncate px-3 py-[var(--space-row-y)] text-neutral-400">
                  {artistNames(song.artists)}
                </td>
                <td className="hidden max-w-[160px] truncate px-3 py-[var(--space-row-y)] text-neutral-500 md:table-cell">
                  {song.albumName}
                </td>
                <td className="px-3 py-[var(--space-row-y)] text-right text-neutral-500">
                  {formatDuration(song.durationMs)}
                </td>
                {extraCell?.(song, index)}
                {showLike && (
                  <td className="px-3 py-[var(--space-row-y)] text-center">
                    <button
                      type="button"
                      title={liked ? '取消喜欢' : '喜欢'}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleLike?.(song)
                      }}
                      className={`text-base leading-none ${
                        liked ? 'text-red-400' : 'text-neutral-600 hover:text-red-400'
                      }`}
                    >
                      {liked ? '♥' : '♡'}
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
