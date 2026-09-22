import { create } from 'zustand'
import type { Lyric, PlayMode, QualityLevel, SongSummary } from '../types'
import { findLyricIndex } from '../utils/lyric'

const emptyLyric: Lyric = { lrc: [], tlyric: [], hasTime: true }

export const PLAY_MODES: PlayMode[] = ['order', 'list-loop', 'single', 'shuffle']

export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  order: '顺序播放',
  'list-loop': '列表循环',
  single: '单曲循环',
  shuffle: '随机播放',
}

/** 前端仅暴露三档：SQ / HQ / 标准，其余 level 由后端能力决定 */
export const QUALITY_LEVELS: QualityLevel[] = ['lossless', 'exhigh', 'standard']

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  standard: '标准',
  higher: '较高',
  exhigh: 'HQ',
  lossless: 'SQ',
  hires: 'Hi-Res',
  jyeffect: '环绕',
  sky: '沉浸',
  jymaster: '母带',
}

interface PlayerState {
  queue: SongSummary[]
  currentIndex: number
  playing: boolean
  playMode: PlayMode
  quality: QualityLevel
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  lyric: Lyric
  currentLyricIndex: number
  queueVisible: boolean
  /** session-only lyric panel collapse preference */
  lyricCollapsed: boolean
  /** bumps when a new song should be loaded into audio element */
  loadToken: number

  currentSong: () => SongSummary | null
  playSongs: (list: SongSummary[], startIndex: number) => void
  enqueue: (list: SongSummary[]) => void
  next: () => void
  prev: () => void
  togglePlay: () => void
  setPlaying: (v: boolean) => void
  seek: (sec: number) => void
  setCurrentTime: (sec: number) => void
  setDuration: (sec: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setPlayMode: (m: PlayMode) => void
  togglePlayMode: () => void
  setQuality: (q: QualityLevel) => void
  jumpTo: (index: number) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  setLyric: (lyric: Lyric) => void
  syncLyricIndex: (timeSec: number) => void
  toggleQueue: () => void
  toggleLyric: () => void
  setLyricCollapsed: (v: boolean) => void
  handleEnded: () => void
}

function randomIndex(n: number, exclude: number): number {
  if (n <= 1) return 0
  let i = exclude
  while (i === exclude) {
    i = Math.floor(Math.random() * n)
  }
  return i
}

function nextIndex(state: PlayerState, auto: boolean): number {
  const n = state.queue.length
  if (n === 0) return -1
  const i = state.currentIndex
  switch (state.playMode) {
    case 'single':
      return auto ? i : (i + 1) % n
    case 'list-loop':
      return (i + 1) % n
    case 'shuffle':
      return randomIndex(n, i)
    case 'order':
    default:
      if (i + 1 >= n) return auto ? -1 : 0
      return i + 1
  }
}

function prevIndex(state: PlayerState): number {
  const n = state.queue.length
  if (n === 0) return -1
  const i = state.currentIndex
  switch (state.playMode) {
    case 'shuffle':
      return randomIndex(n, i)
    case 'order':
      return i <= 0 ? 0 : i - 1
    default:
      return (i - 1 + n) % n
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  playing: false,
  playMode: 'list-loop',
  quality: 'lossless', // 默认 SQ（无损）
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  lyric: emptyLyric,
  currentLyricIndex: -1,
  queueVisible: false,
  lyricCollapsed: false,
  loadToken: 0,

  currentSong: () => {
    const s = get()
    if (s.currentIndex < 0 || s.currentIndex >= s.queue.length) return null
    return s.queue[s.currentIndex]
  },

  playSongs: (list, startIndex) => {
    const tracks = list.length ? list : []
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1))
    set({
      queue: tracks,
      currentIndex: tracks.length ? idx : -1,
      playing: tracks.length > 0,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: get().loadToken + 1,
    })
  },

  enqueue: (list) => {
    const { queue } = get()
    const existing = new Set(queue.map((s) => s.id))
    const merged = [...queue, ...list.filter((s) => !existing.has(s.id))]
    set({ queue: merged })
  },

  next: () => {
    const idx = nextIndex(get(), false)
    if (idx < 0) return
    set({
      currentIndex: idx,
      playing: true,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: get().loadToken + 1,
    })
  },

  prev: () => {
    const idx = prevIndex(get())
    if (idx < 0) return
    set({
      currentIndex: idx,
      playing: true,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: get().loadToken + 1,
    })
  },

  togglePlay: () => {
    const { currentIndex, queue, playing } = get()
    if (currentIndex < 0 && queue.length) {
      get().playSongs(queue, 0)
      return
    }
    set({ playing: !playing })
  },

  setPlaying: (v) => set({ playing: v }),
  seek: (sec) => set({ currentTime: sec }),
  setCurrentTime: (sec) => set({ currentTime: sec }),
  setDuration: (sec) => set({ duration: sec }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: false }),
  toggleMute: () => set({ muted: !get().muted }),

  setPlayMode: (m) => set({ playMode: m }),
  togglePlayMode: () => {
    const i = PLAY_MODES.indexOf(get().playMode)
    set({ playMode: PLAY_MODES[(i + 1) % PLAY_MODES.length] })
  },
  setQuality: (q) => {
    const s = get()
    if (s.quality === q) return
    // 切换音质后重载当前曲
    set({
      quality: q,
      currentTime: 0,
      duration: 0,
      loadToken: s.loadToken + 1,
    })
  },

  jumpTo: (index) => {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    set({
      currentIndex: index,
      playing: true,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: get().loadToken + 1,
    })
  },

  removeFromQueue: (index) => {
    const s = get()
    if (index < 0 || index >= s.queue.length) return
    const queue = s.queue.filter((_, i) => i !== index)
    let currentIndex = s.currentIndex
    let loadToken = s.loadToken
    if (index === s.currentIndex) {
      currentIndex = Math.min(s.currentIndex, queue.length - 1)
      if (currentIndex < 0) {
        set({
          queue,
          currentIndex: -1,
          playing: false,
          currentTime: 0,
          duration: 0,
          lyric: emptyLyric,
          currentLyricIndex: -1,
        })
        return
      }
      loadToken += 1
    } else if (index < s.currentIndex) {
      currentIndex = s.currentIndex - 1
    }
    set({ queue, currentIndex, loadToken })
  },

  clearQueue: () =>
    set({
      queue: [],
      currentIndex: -1,
      playing: false,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
    }),

  setLyric: (lyric) => set({ lyric, currentLyricIndex: -1 }),

  syncLyricIndex: (timeSec) => {
    const { lyric, currentLyricIndex } = get()
    if (!lyric.hasTime || !lyric.lrc.length) return
    const idx = findLyricIndex(lyric.lrc, timeSec * 1000)
    if (idx !== currentLyricIndex) set({ currentLyricIndex: idx })
  },

  toggleQueue: () => set({ queueVisible: !get().queueVisible }),
  toggleLyric: () => set({ lyricCollapsed: !get().lyricCollapsed }),
  setLyricCollapsed: (v) => set({ lyricCollapsed: v }),

  handleEnded: () => {
    const s = get()
    if (s.playMode === 'single') {
      set({ currentTime: 0, playing: true, loadToken: s.loadToken + 1 })
      return
    }
    const idx = nextIndex(s, true)
    if (idx < 0) {
      set({ playing: false })
      return
    }
    set({
      currentIndex: idx,
      playing: true,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: s.loadToken + 1,
    })
  },
}))
