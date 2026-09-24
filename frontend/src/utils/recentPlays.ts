/** 最近播放：本地 localStorage 存 50 条歌曲，曲目开始播放时记录（设计 §4.4）
 *
 *  - 与 recentSearch.ts 同风格：仅存本机、不上传、可清空；
 *  - 同曲去重置顶、上限 50；
 *  - 订阅接口供首页「最近播放」区块即时刷新（useSyncExternalStore）。
 */

import type { SongSummary } from '../types'

const KEY = 'csplayer:prefs:recentPlays'
const MAX = 50

const listeners = new Set<() => void>()
let cache: SongSummary[] | null = null

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

function read(): SongSummary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSong).slice(0, MAX)
  } catch {
    return []
  }
}

function notify(): void {
  for (const cb of listeners) cb()
}

export function loadRecentPlays(): SongSummary[] {
  if (!cache) cache = read()
  return cache
}

export function pushRecentPlay(song: SongSummary): void {
  if (!isValidSong(song)) return
  const list = [song, ...loadRecentPlays().filter((s) => s.id !== song.id)].slice(0, MAX)
  cache = list
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignore — 存储满时仅内存生效
  }
  notify()
}

export function clearRecentPlays(): void {
  cache = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  notify()
}

export function subscribeRecentPlays(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
