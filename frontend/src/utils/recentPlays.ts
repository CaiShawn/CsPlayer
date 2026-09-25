/** 最近播放：本地 localStorage 记录（设计 S4「近来听」）
 *
 *  - 与 recentSearch.ts 同风格：仅存本机、不上传、可清空；
 *  - 三类记录：单曲 50 首（曲目开始播放时）、专辑 10 张 / 歌单 10 张（在详情页播放时）；
 *  - 同条去重置顶、各上限截断；
 *  - 订阅接口供首页「最近播放」区块 / 「近来听」页即时刷新（useSyncExternalStore）。
 */

import type { AlbumBrief, PlaylistBrief, SongSummary } from '../types'

const SONG_KEY = 'csplayer:prefs:recentPlays' // 既有 key（歌曲 50），不迁移
const ALBUM_KEY = 'csplayer:prefs:recentAlbums'
const PLAYLIST_KEY = 'csplayer:prefs:recentPlaylists'
const SONG_MAX = 50
const ALBUM_MAX = 10
const PLAYLIST_MAX = 10

interface RecentList<T> {
  load: () => T[]
  push: (item: T) => void
  clear: () => void
  subscribe: (cb: () => void) => () => void
}

function createRecentList<T>(
  key: string,
  max: number,
  isValid: (x: unknown) => x is T,
  idOf: (x: T) => number,
): RecentList<T> {
  const listeners = new Set<() => void>()
  let cache: T[] | null = null

  const read = (): T[] => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isValid).slice(0, max)
    } catch {
      return []
    }
  }

  const notify = (): void => {
    for (const cb of listeners) cb()
  }

  return {
    load: () => {
      if (!cache) cache = read()
      return cache
    },
    push: (item: T) => {
      if (!isValid(item)) return
      const list = [item, ...((cache ?? read()) as T[]).filter((s) => idOf(s) !== idOf(item))].slice(
        0,
        max,
      )
      cache = list
      try {
        localStorage.setItem(key, JSON.stringify(list))
      } catch {
        // ignore — 存储满时仅内存生效
      }
      notify()
    },
    clear: () => {
      cache = []
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
      notify()
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}

function isValidSong(s: unknown): s is SongSummary {
  const t = s as SongSummary | null
  return (
    !!t &&
    typeof t.id === 'number' &&
    typeof t.name === 'string' &&
    Array.isArray(t.artists) &&
    typeof t.albumName === 'string' &&
    typeof t.coverUrl === 'string'
  )
}

function isValidAlbum(a: unknown): a is AlbumBrief {
  const t = a as AlbumBrief | null
  return (
    !!t &&
    typeof t.id === 'number' &&
    typeof t.name === 'string' &&
    typeof t.coverUrl === 'string' &&
    typeof t.artistId === 'number' &&
    typeof t.artistName === 'string'
  )
}

function isValidPlaylist(p: unknown): p is PlaylistBrief {
  const t = p as PlaylistBrief | null
  return (
    !!t &&
    typeof t.id === 'number' &&
    typeof t.name === 'string' &&
    typeof t.coverUrl === 'string' &&
    typeof t.trackCount === 'number' &&
    typeof t.creatorName === 'string'
  )
}

const songs = createRecentList<SongSummary>(SONG_KEY, SONG_MAX, isValidSong, (s) => s.id)
const albums = createRecentList<AlbumBrief>(ALBUM_KEY, ALBUM_MAX, isValidAlbum, (a) => a.id)
const playlists = createRecentList<PlaylistBrief>(
  PLAYLIST_KEY,
  PLAYLIST_MAX,
  isValidPlaylist,
  (p) => p.id,
)

/* --- 单曲（50）：既有 API，HomePage / playerStore 在用 --- */
export function loadRecentPlays(): SongSummary[] {
  return songs.load()
}
export function pushRecentPlay(song: SongSummary): void {
  songs.push(song)
}
export function clearRecentPlays(): void {
  songs.clear()
}
export function subscribeRecentPlays(cb: () => void): () => void {
  return songs.subscribe(cb)
}

/* --- 专辑（10）：专辑详情页播放时记录 --- */
export function loadRecentAlbums(): AlbumBrief[] {
  return albums.load()
}
export function pushRecentAlbum(album: AlbumBrief): void {
  albums.push(album)
}
export function clearRecentAlbums(): void {
  albums.clear()
}
export function subscribeRecentAlbums(cb: () => void): () => void {
  return albums.subscribe(cb)
}

/* --- 歌单（10）：歌单详情页播放时记录 --- */
export function loadRecentPlaylists(): PlaylistBrief[] {
  return playlists.load()
}
export function pushRecentPlaylist(playlist: PlaylistBrief): void {
  playlists.push(playlist)
}
export function clearRecentPlaylists(): void {
  playlists.clear()
}
export function subscribeRecentPlaylists(cb: () => void): () => void {
  return playlists.subscribe(cb)
}
