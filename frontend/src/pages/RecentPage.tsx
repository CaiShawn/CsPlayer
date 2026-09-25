import { useState, useSyncExternalStore } from 'react'
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
 * 最近播放（/recent，侧栏「近来听」，设计 S4）：本地记录提为独立路由
 *   单曲 50 首（点击续播、右键沿用歌曲菜单）/ 专辑 10 张 / 歌单 10 张（点击进详情）；
 *   三栏 Tab 切换（同 SearchPage 体例），每栏独立「清空」；
 *   仅保存在本机浏览器（useSyncExternalStore 订阅即时刷新）。
 * ------------------------------------------------------------------------ */

type RecentTab = 'song' | 'album' | 'playlist'

const TABS: { id: RecentTab; label: string; hint: string }[] = [
  { id: 'song', label: '单曲', hint: '最近 50 首' },
  { id: 'album', label: '专辑', hint: '最近 10 张' },
  { id: 'playlist', label: '歌单', hint: '最近 10 张' },
]

export function RecentPage() {
  const [tab, setTab] = useState<RecentTab>('song')
  const songs = useSyncExternalStore(subscribeRecentPlays, loadRecentPlays)
  const albums = useSyncExternalStore(subscribeRecentAlbums, loadRecentAlbums)
  const playlists = useSyncExternalStore(subscribeRecentPlaylists, loadRecentPlaylists)

  const playRecent = (index: number) => {
    const playable = songs.filter((t) => t.playable)
    const song = songs[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), '最近播放')
  }

  const counts: Record<RecentTab, number> = {
    song: songs.length,
    album: albums.length,
    playlist: playlists.length,
  }
  const clears: Record<RecentTab, (() => void) | undefined> = {
    song: songs.length ? clearRecentPlays : undefined,
    album: albums.length ? clearRecentAlbums : undefined,
    playlist: playlists.length ? clearRecentPlaylists : undefined,
  }
  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="p-8 pb-10">
      <h1 className="text-2xl font-bold text-neutral-50">最近播放</h1>

      {/* Tab 行（SearchPage 体例）+ 右侧提示 / 清空 */}
      <div className="mt-4 flex items-end justify-between border-b border-neutral-800">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                tab === t.id
                  ? 'border-accent text-accent-soft'
                  : 'border-transparent text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <span className="text-xs text-neutral-500">{active.hint}</span>
          {clears[tab] && (
            <button
              type="button"
              onClick={clears[tab]}
              className="text-xs text-neutral-500 hover:text-neutral-200"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {counts[tab] === 0 ? (
        <EmptyBox
          text={
            tab === 'song'
              ? '还没有播放记录，听过的歌会出现在这里'
              : tab === 'album'
                ? '还没有专辑播放记录'
                : '还没有歌单播放记录'
          }
        />
      ) : tab === 'song' ? (
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
      ) : tab === 'album' ? (
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
      ) : (
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
      )}
    </div>
  )
}

/** 空态（带边框卡片式，同 HomePage 最近播放区块体例） */
function EmptyBox({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
      {text}
    </div>
  )
}
