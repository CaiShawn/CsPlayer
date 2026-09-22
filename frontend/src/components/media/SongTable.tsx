import type { SongSummary } from '../../types'
import { artistNames, formatDuration } from '../../utils/format'

interface Props {
  tracks: SongSummary[]
  currentId?: number
  playing?: boolean
  onPlay: (index: number) => void
}

export function SongTable({ tracks, currentId, playing, onPlay }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/80 text-neutral-400">
          <tr>
            <th className="w-12 px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">标题</th>
            <th className="px-3 py-2 text-left font-medium">歌手</th>
            <th className="hidden px-3 py-2 text-left font-medium md:table-cell">专辑</th>
            <th className="w-16 px-3 py-2 text-right font-medium">时长</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((song, index) => {
            const active = song.id === currentId
            const disabled = !song.playable
            return (
              <tr
                key={`${song.id}-${index}`}
                onDoubleClick={() => !disabled && onPlay(index)}
                className={[
                  'cursor-pointer transition-colors',
                  active
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'hover:bg-neutral-800/60',
                  disabled ? 'opacity-40' : '',
                ].join(' ')}
              >
                <td className="px-3 py-2 text-neutral-500">
                  {active && playing ? (
                    <span className="text-emerald-400">▶</span>
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="max-w-[240px] truncate px-3 py-2">
                  <span className="text-neutral-100">{song.name}</span>
                  {disabled && (
                    <span className="ml-2 text-xs text-red-400">
                      {song.reason || '不可播'}
                    </span>
                  )}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-neutral-400">
                  {artistNames(song.artists)}
                </td>
                <td className="hidden max-w-[160px] truncate px-3 py-2 text-neutral-500 md:table-cell">
                  {song.albumName}
                </td>
                <td className="px-3 py-2 text-right text-neutral-500">
                  {formatDuration(song.durationMs)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
