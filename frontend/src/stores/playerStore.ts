import { create } from 'zustand'
import type { Lyric, PlayMode, QualityLevel, SongSummary } from '../types'
import { findLyricIndex } from '../utils/lyric'
import { pushRecentPlay } from '../utils/recentPlays'
import {
  LYRIC_COLLAPSED_KEY,
  QUEUE_PIN_KEY,
  QUEUE_SESSION_KEY,
  VOLUME_KEY,
  useSettingsStore,
} from './settingsStore'

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
  /** 队列内容版本号：任何队列改写（换源/增删/排序）+1；
   *  topUpQueue 补全替换前校验，避免覆盖用户中途的队列操作 */
  queueEpoch: number
  /** 队列来源标签（A2）：如「歌单《X》」，面板标题下展示；'' = 未知 */
  queueSource: string
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
  /** 队列钉住（S3）：true=右侧常驻占位（主内容缩窄、外点不收）；false=默认抽屉 */
  queuePinned: boolean
  /** session-only lyric panel collapse preference */
  lyricCollapsed: boolean
  /** bumps when a new song should be loaded into audio element */
  loadToken: number

  currentSong: () => SongSummary | null
  playSongs: (list: SongSummary[], startIndex: number, source?: string) => void
  /** 「播放全部」后台补全：全量到位后原位扩展队列（epoch 未变才替换），
   *  保持当前曲/进度/播放状态不打断（不 bump loadToken） */
  topUpQueue: (list: SongSummary[], epoch: number) => void
  enqueue: (list: SongSummary[]) => void
  /** 「下一首播放」：插入到当前曲之后（不带去重，可重复插入） */
  insertNext: (list: SongSummary[]) => void
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
  /** 拖拽排序（B2）：把 from 行移到 to 位，当前曲索引跟随修正（不重载音频） */
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  setLyric: (lyric: Lyric) => void
  syncLyricIndex: (timeSec: number) => void
  toggleQueue: () => void
  setQueueVisible: (v: boolean) => void
  /** 钉住/取消钉住（S3）：钉住时确保面板可见并收歌词（互斥） */
  toggleQueuePinned: () => void
  setQueuePinned: (v: boolean) => void
  toggleLyric: () => void
  setLyricCollapsed: (v: boolean) => void
  handleEnded: () => void
  /** 不可播放曲目：按偏好跳过到下一首（单曲循环也向后推进，避免忙循环） */
  skipUnplayable: () => void
  /** 曲目加载成功，重置不可播连续计数 */
  markPlayable: () => void
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

/* ---------------------------------------------------------------------------
 * 播放偏好联动：记住音量（localStorage）、刷新后恢复队列（sessionStorage）、
 * 记忆歌词展开/收起状态（localStorage）
 * ------------------------------------------------------------------------ */

const VOLUME_DEFAULT = 0.8

/** 歌词展开状态：默认展开；'1' = 上次为收起（刷新后跟随） */
function initialLyricCollapsed(): boolean {
  try {
    return localStorage.getItem(LYRIC_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function persistLyricCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(LYRIC_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore
  }
}

/** 队列钉住状态（S3）：默认抽屉（不钉住）；刷新跟随，「清除本地数据」后回抽屉 */
function initialQueuePinned(): boolean {
  try {
    return localStorage.getItem(QUEUE_PIN_KEY) === '1'
  } catch {
    return false
  }
}

function persistQueuePinned(pinned: boolean) {
  try {
    localStorage.setItem(QUEUE_PIN_KEY, pinned ? '1' : '0')
  } catch {
    // ignore
  }
}

function initialVolume(): number {
  try {
    if (!useSettingsStore.getState().prefs.playback.rememberVolume) return VOLUME_DEFAULT
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : VOLUME_DEFAULT
  } catch {
    return VOLUME_DEFAULT
  }
}

interface QueueSession {
  queue: SongSummary[]
  currentIndex: number
  quality: QualityLevel
  /** 刷新时刻的播放进度（秒），恢复后从该位置继续 */
  currentTime: number
  /** 队列来源标签（A2），刷新恢复后仍显示 */
  source: string
}

function readQueueSession(): QueueSession | null {
  try {
    if (!useSettingsStore.getState().prefs.playback.restoreQueue) return null
    const raw = sessionStorage.getItem(QUEUE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<QueueSession>
    if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return null
    const quality = QUALITY_LEVELS.includes(parsed.quality as QualityLevel)
      ? (parsed.quality as QualityLevel)
      : 'lossless'
    const currentIndex =
      typeof parsed.currentIndex === 'number'
        ? Math.max(0, Math.min(parsed.currentIndex, parsed.queue.length - 1))
        : 0
    const currentTime =
      typeof parsed.currentTime === 'number' && Number.isFinite(parsed.currentTime) && parsed.currentTime > 0
        ? parsed.currentTime
        : 0
    return {
      queue: parsed.queue,
      currentIndex,
      quality,
      currentTime,
      source: typeof parsed.source === 'string' ? parsed.source : '',
    }
  } catch {
    return null
  }
}

function writeQueueSession(): void {
  try {
    const s = usePlayerStore.getState()
    if (!useSettingsStore.getState().prefs.playback.restoreQueue || s.queue.length === 0) {
      sessionStorage.removeItem(QUEUE_SESSION_KEY)
      return
    }
    sessionStorage.setItem(
      QUEUE_SESSION_KEY,
      JSON.stringify({
        queue: s.queue,
        currentIndex: s.currentIndex,
        quality: s.quality,
        currentTime: s.currentTime,
        source: s.queueSource,
      }),
    )
  } catch {
    // ignore
  }
}

/** 连续不可播曲目数（整队不可播时止损，避免无限循环） */
let unplayableStreak = 0

const queueSession = readQueueSession()

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: queueSession?.queue ?? [],
  queueSource: queueSession?.source ?? '',
  currentIndex: queueSession?.currentIndex ?? -1,
  queueEpoch: 0,
  // 「刷新后自动播放」开启且有恢复队列时：刷新即自动继续播放（从原进度）
  playing: !!queueSession && useSettingsStore.getState().prefs.playback.autoPlayOnRestore,
  playMode: 'list-loop',
  quality: queueSession?.quality ?? 'lossless', // 默认 SQ（无损）
  currentTime: queueSession?.currentTime ?? 0,
  duration: 0,
  volume: initialVolume(),
  muted: false,
  lyric: emptyLyric,
  currentLyricIndex: -1,
  queueVisible: false,
  queuePinned: initialQueuePinned(),
  lyricCollapsed: initialLyricCollapsed(),
  loadToken: 0,

  currentSong: () => {
    const s = get()
    if (s.currentIndex < 0 || s.currentIndex >= s.queue.length) return null
    return s.queue[s.currentIndex]
  },

  playSongs: (list, startIndex, source) => {
    unplayableStreak = 0
    const tracks = list.length ? list : []
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1))
    set({
      queue: tracks,
      queueSource: source ?? '',
      currentIndex: tracks.length ? idx : -1,
      queueEpoch: get().queueEpoch + 1,
      playing: tracks.length > 0,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      loadToken: get().loadToken + 1,
    })
  },

  topUpQueue: (list, epoch) => {
    const s = get()
    if (s.queueEpoch !== epoch || !list.length || s.currentIndex < 0) return
    const cur = s.queue[s.currentIndex]
    const idx = cur ? list.findIndex((t) => t.id === cur.id) : -1
    // 当前曲不在全量列表里（期间被取消红心等）：放弃补全，保留现状
    if (idx < 0) return
    set({ queue: list, currentIndex: idx })
  },

  enqueue: (list) => {
    const { queue } = get()
    const existing = new Set(queue.map((s) => s.id))
    const merged = [...queue, ...list.filter((s) => !existing.has(s.id))]
    set({ queue: merged, queueEpoch: get().queueEpoch + 1 })
  },

  insertNext: (list) => {
    if (!list.length) return
    const { queue, currentIndex } = get()
    if (currentIndex < 0 || queue.length === 0) {
      set({ queue: [...queue, ...list], queueEpoch: get().queueEpoch + 1 })
      return
    }
    const merged = [...queue]
    merged.splice(currentIndex + 1, 0, ...list)
    set({ queue: merged, queueEpoch: get().queueEpoch + 1 })
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
      get().playSongs(queue, 0, get().queueSource)
      return
    }
    set({ playing: !playing })
  },

  /** 播放意图（唯一事实源，由 useAudioEngine 强制执行）；幂等写入，避免无谓通知 */
  setPlaying: (v) => {
    if (get().playing !== v) set({ playing: v })
  },
  seek: (sec) => set({ currentTime: sec }),
  setCurrentTime: (sec) => set({ currentTime: sec }),
  setDuration: (sec) => set({ duration: sec }),
  setVolume: (v) => {
    const vol = Math.max(0, Math.min(1, v))
    set({ volume: vol, muted: false })
    if (useSettingsStore.getState().prefs.playback.rememberVolume) {
      try {
        localStorage.setItem(VOLUME_KEY, String(vol))
      } catch {
        // ignore
      }
    }
  },
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
    unplayableStreak = 0
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
    const queueEpoch = s.queueEpoch + 1
    if (index === s.currentIndex) {
      currentIndex = Math.min(s.currentIndex, queue.length - 1)
      if (currentIndex < 0) {
        set({
          queue,
          currentIndex: -1,
          queueEpoch,
          playing: false,
          currentTime: 0,
          duration: 0,
          lyric: emptyLyric,
          currentLyricIndex: -1,
          // 通知引擎卸载音源（否则空队列仍可能把旧曲播回来）
          loadToken: loadToken + 1,
        })
        return
      }
      loadToken += 1
      // 换成了新曲：进度归零（否则旧曲进度会被当成新曲起点）
      set({
        queue,
        currentIndex,
        queueEpoch,
        loadToken,
        currentTime: 0,
        duration: 0,
        lyric: emptyLyric,
        currentLyricIndex: -1,
      })
      return
    } else if (index < s.currentIndex) {
      currentIndex = s.currentIndex - 1
    }
    set({ queue, currentIndex, queueEpoch, loadToken })
  },

  moveInQueue: (from, to) => {
    const s = get()
    const n = s.queue.length
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return
    const queue = [...s.queue]
    const [item] = queue.splice(from, 1)
    queue.splice(to, 0, item)
    // 当前曲索引跟随修正：被移走的是当前曲 → 目标位；否则按「先删后插」映射
    let currentIndex = s.currentIndex
    if (currentIndex >= 0) {
      if (from === currentIndex) currentIndex = to
      else {
        let i = currentIndex > from ? currentIndex - 1 : currentIndex
        if (i >= to) i += 1
        currentIndex = i
      }
    }
    set({ queue, currentIndex, queueEpoch: s.queueEpoch + 1 })
  },

  clearQueue: () =>
    set((s) => ({
      queue: [],
      queueSource: '',
      currentIndex: -1,
      queueEpoch: s.queueEpoch + 1,
      playing: false,
      currentTime: 0,
      duration: 0,
      lyric: emptyLyric,
      currentLyricIndex: -1,
      // 通知引擎卸载音源（否则空队列仍可能把旧曲播回来）
      loadToken: s.loadToken + 1,
    })),

  setLyric: (lyric) => set({ lyric, currentLyricIndex: -1 }),

  syncLyricIndex: (timeSec) => {
    const { lyric, currentLyricIndex } = get()
    if (!lyric.hasTime || !lyric.lrc.length) return
    const idx = findLyricIndex(lyric.lrc, timeSec * 1000)
    if (idx !== currentLyricIndex) set({ currentLyricIndex: idx })
  },

  toggleQueue: () => {
    const v = !get().queueVisible
    // 互斥（验收决定）：开队列收歌词
    set(v ? { queueVisible: true, lyricCollapsed: true } : { queueVisible: false })
    if (v) persistLyricCollapsed(true)
  },
  setQueueVisible: (v) => {
    if (get().queueVisible === v) return
    if (v) {
      // 互斥（验收决定）：队列打开时歌词不能同开
      set({ queueVisible: true, lyricCollapsed: true })
      persistLyricCollapsed(true)
    } else {
      set({ queueVisible: false })
    }
  },
  toggleQueuePinned: () => {
    const v = !get().queuePinned
    set({ queuePinned: v })
    persistQueuePinned(v)
    if (v && !get().queueVisible) {
      // 从关态直接钉住：拉起面板并收歌词（互斥）
      set({ queueVisible: true, lyricCollapsed: true })
      persistLyricCollapsed(true)
    }
  },
  setQueuePinned: (v) => {
    if (get().queuePinned === v) return
    set({ queuePinned: v })
    persistQueuePinned(v)
  },
  toggleLyric: () => {
    const v = !get().lyricCollapsed
    if (!v) {
      // 互斥（验收决定）：开歌词收队列
      set({ lyricCollapsed: false, queueVisible: false })
    } else {
      set({ lyricCollapsed: true })
    }
    persistLyricCollapsed(v)
  },
  setLyricCollapsed: (v) => {
    if (!v && get().queueVisible) {
      // 互斥（验收决定）：队列开着时不能展开歌词
      set({ lyricCollapsed: false, queueVisible: false })
    } else {
      set({ lyricCollapsed: v })
    }
    persistLyricCollapsed(v)
  },

  handleEnded: () => {
    const s = get()
    // 「自动续播下一首」关闭：播完停住
    if (!useSettingsStore.getState().prefs.playback.autoNext) {
      set({ playing: false, currentTime: 0 })
      return
    }
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

  skipUnplayable: () => {
    const s = get()
    const n = s.queue.length
    unplayableStreak += 1
    if (n === 0 || unplayableStreak > n) {
      unplayableStreak = 0
      set({ playing: false })
      return
    }
    // 单曲循环下不可播也向后推进，避免忙循环
    const idx = s.playMode === 'single' ? (s.currentIndex + 1) % n : nextIndex(s, true)
    if (idx < 0 || idx === s.currentIndex) {
      unplayableStreak = 0
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

  markPlayable: () => {
    unplayableStreak = 0
  },
}))

// 队列 / 进度 / 音质变化时写入 sessionStorage（受「刷新后恢复队列」开关控制）；
// 进度写入节流 ≥2s 一次，避免 timeupdate 频繁序列化整个队列
let lastSessionWrite = 0
usePlayerStore.subscribe((state, prev) => {
  const metaChanged =
    state.queue !== prev.queue ||
    state.currentIndex !== prev.currentIndex ||
    state.quality !== prev.quality
  if (!metaChanged && state.currentTime === prev.currentTime) return
  const now = Date.now()
  if (metaChanged || now - lastSessionWrite >= 2000) {
    lastSessionWrite = now
    writeQueueSession()
  }
})

// 曲目开始播放（换曲 / 选曲）时写最近播放（S3-2，设计 §4.4）：
// loadToken 递增 = 加载新曲；同曲重载（切音质）不重复记录。
// 同曲去重置顶、上限 50 由 recentPlays 保证。
usePlayerStore.subscribe((state, prev) => {
  if (state.loadToken === prev.loadToken) return
  if (state.queue === prev.queue && state.currentIndex === prev.currentIndex) return
  const song = state.currentSong()
  if (song) pushRecentPlay(song)
})

// 刷新 / 关页前兜底写一次最终进度（补偿节流漏掉的最后一段）
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => writeQueueSession())
}
