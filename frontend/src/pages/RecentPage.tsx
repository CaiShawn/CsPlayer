import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import type { AlbumBrief, PlaylistBrief, SongSummary } from '../types'
import { Cover } from '../components/common/Cover'
import { useContextMenuStore } from '../stores/contextMenuStore'
import { usePlayerStore } from '../stores/playerStore'
import { artistNames, formatDuration } from '../utils/format'
import {
  clearRecentAlbums,
  clearRecentPlays,
  clearRecentPlaylists,
  loadRecentAlbums,
  loadRecentPlays,
  loadRecentPlaylists,
  subscribeRecentAlbums,
  subscribeRecentPlays,
  subscribeRecentPlaylists,
} from '../utils/recentPlays'

/* ---------------------------------------------------------------------------
 * 近来听（/recent，设计 S4）：最近播放的本地记录提为独立路由
 *   单曲 50 首（点击续播、右键沿用歌曲菜单）/ 专辑 10 张 / 歌单 10 张（点击进详情）；
 *   仅保存在本机浏览器、可分区清空（useSyncExternalStore 订阅即时刷新）。
 * ------------------------------------------------------------------------ */

export function RecentPage() {
  const songs = useSyncExternalStore(subscribeRecentPlays, loadRecentPlays)
  const albums = useSyncExternalStore(subscribeRecentAlbums, loadRecentAlbums)
  const playlists = useSyncExternalStore(subscribeRecentPlaylists, loadRecentPlaylists)

  const playRecent = (index: number) => {
    const playable = songs.filter((t) => t.playable)
    const song = songs[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), '近来听')
  }

  return (
    <div className="p-8 pb-28">
      <h1 className="text-2xl font-bold text-neutral-50">近来听</h1>
      <p className="mt-1 text-xs text-neutral-500">只保存在本机浏览器，不上传</p>

      {/* 单曲（50） */}
      <Section
        title="单曲"
        hint="最近播放 · 最多 50 首"
        count={songs.length}
        onClear={songs.length ? clearRecentPlays : undefined}
        empty="还没有播放记录，听过的歌会出现在这里"
      >
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800">
          {songs.map((song: SongSummary, index) => (
            <button
              key={`${song.id}-${index}`}
              type="button"
              onClick={() => playRecent(index)}
              onContextMenu={(e) =>
                useContextMenuStore.getState().openForEvent(e, {
                  kind: 'song',
                  song,
                  songs,
                  index,
                })
              }
              className={`group flex w-full items-center gap-3 px-4 py-[var(--space-row-y)] text-left text-sm transition-colors hover:bg-neutral-800/60 ${
                song.playable ? '' : 'opacity-40'
              }`}
            >
              <Cover url={song.coverUrl} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-neutral-100">{song.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {artistNames(song.artists)}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                {formatDuration(song.durationMs)}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* 专辑（10） */}
      <Section
        title="专辑"
        hint="最近播放 · 最多 10 张"
        count={albums.length}
        onClear={albums.length ? clearRecentAlbums : undefined}
        empty="还没有专辑播放记录"
      >
        <div className="mt-4 grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {albums.map((a: AlbumBrief) => (
            <Link
              key={a.id}
              to={`/album/${a.id}`}
              onContextMenu={(e) =>
                useContextMenuStore.getState().openForEvent(e, { kind: 'album', album: a })
              }
              className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
            >
              <Cover url={a.coverUrl} className="aspect-square w-full" />
              <div className="mt-2 truncate text-sm text-neutral-100">{a.name}</div>
              <div className="mt-0.5 truncate text-xs text-neutral-500">{a.artistName}</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* 歌单（10） */}
      <Section
        title="歌单"
        hint="最近播放 · 最多 10 张"
        count={playlists.length}
        onClear={playlists.length ? clearRecentPlaylists : undefined}
        empty="还没有歌单播放记录"
      >
        <div className="mt-4 grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {playlists.map((p: PlaylistBrief) => (
            <Link
              key={p.id}
              to={`/playlist/${p.id}`}
              onContextMenu={(e) =>
                useContextMenuStore.getState().openForEvent(e, {
                  kind: 'playlist',
                  playlist: p,
                })
              }
              className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
            >
              <Cover url={p.coverUrl} className="aspect-square w-full" />
              <div className="mt-2 truncate text-sm text-neutral-100">{p.name}</div>
              <div className="mt-0.5 truncate text-xs text-neutral-500">
                {p.trackCount} 首{p.creatorName ? ` · ${p.creatorName}` : ''}
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  count,
  onClear,
  empty,
  children,
}: {
  title: string
  hint: string
  count: number
  onClear?: () => void
  empty: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-200"
          >
            清空
          </button>
        )}
      </div>
      {count === 0 ? (
        <div className="mt-4 rounded-xl border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
          {empty}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
