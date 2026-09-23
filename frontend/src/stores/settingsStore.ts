import { create } from 'zustand'
import {
  ACCENT_PRESETS,
  buildAccentPalette,
  presetPalette,
  type AccentPalette,
} from '../utils/color'

/* ---------------------------------------------------------------------------
 * 偏好（prefs）schema 与持久化：localStorage，key 前缀 csplayer:prefs:*
 * ------------------------------------------------------------------------ */

export type AccentPresetName = 'emerald' | 'cyan' | 'blue' | 'violet' | 'rose' | 'amber' | 'orange'
export type Density = 'comfortable' | 'compact'
export type CoverRadius = 'none' | 'md' | 'lg'
export type UnplayableAction = 'skip' | 'stop'
export type LyricFontSize = 'sm' | 'md' | 'lg'

export interface AppearancePrefs {
  accentPreset: AccentPresetName | 'custom'
  /** 自定义颜色（HEX6），仅 accentPreset === 'custom' 时生效 */
  customColor: string
  density: Density
  coverRadius: CoverRadius
}

export interface PlaybackPrefs {
  rememberVolume: boolean
  unplayableAction: UnplayableAction
  restoreQueue: boolean
  autoNext: boolean
}

export interface LyricPrefs {
  fontSize: LyricFontSize
  showTranslation: boolean
  highlightCurrent: boolean
}

export interface Prefs {
  appearance: AppearancePrefs
  playback: PlaybackPrefs
  lyric: LyricPrefs
}

export const PREFS_VERSION = 1
export const PREFS_KEY = 'csplayer:prefs:main'
export const PREFS_BACKUP_KEY = 'csplayer:prefs:backup'
export const VOLUME_KEY = 'csplayer:prefs:volume'
export const QUEUE_SESSION_KEY = 'csplayer:queue'

export const DEFAULT_PREFS: Prefs = {
  appearance: {
    accentPreset: 'emerald',
    customColor: '#10b981',
    density: 'comfortable',
    coverRadius: 'md',
  },
  playback: {
    rememberVolume: true,
    unplayableAction: 'skip',
    restoreQueue: true,
    autoNext: true,
  },
  lyric: {
    fontSize: 'md',
    showTranslation: true,
    highlightCurrent: true,
  },
}

interface StoredPrefs extends Prefs {
  prefsVersion: number
}

function mergePrefs(raw: Partial<Prefs> | undefined): Prefs {
  return {
    appearance: { ...DEFAULT_PREFS.appearance, ...raw?.appearance },
    playback: { ...DEFAULT_PREFS.playback, ...raw?.playback },
    lyric: { ...DEFAULT_PREFS.lyric, ...raw?.lyric },
  }
}

/** 读取 prefs；版本不兼容 / 内容损坏时重置为默认并把旧内容备份到 PREFS_BACKUP_KEY。 */
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>
    if (parsed.prefsVersion !== PREFS_VERSION) {
      localStorage.setItem(PREFS_BACKUP_KEY, raw)
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ prefsVersion: PREFS_VERSION, ...DEFAULT_PREFS }),
      )
      return { ...DEFAULT_PREFS }
    }
    return mergePrefs(parsed)
  } catch {
    // storage 被禁用 / 内容损坏：静默降级为默认
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ prefsVersion: PREFS_VERSION, ...prefs }))
  } catch {
    // ignore
  }
}

/* ---------------------------------------------------------------------------
 * 主题色（强调色）应用
 * ------------------------------------------------------------------------ */

/** 解析当前外观偏好对应的调色板 */
export function resolvePalette(appearance: AppearancePrefs): AccentPalette {
  if (appearance.accentPreset === 'custom') {
    return buildAccentPalette(appearance.customColor) ?? presetPalette(ACCENT_PRESETS[0])
  }
  const preset = ACCENT_PRESETS.find((p) => p.name === appearance.accentPreset)
  return presetPalette(preset ?? ACCENT_PRESETS[0])
}

/** 把外观偏好写入 DOM：CSS 变量（主题色）+ data 属性（密度 / 封面圆角） */
export function applyAppearance(appearance: AppearancePrefs): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const palette = resolvePalette(appearance)
  root.style.setProperty('--color-accent', palette.accent)
  root.style.setProperty('--color-accent-text', palette.text)
  root.style.setProperty('--color-accent-soft', palette.soft)
  root.style.setProperty('--color-accent-hover', palette.hover)
  root.dataset.density = appearance.density
  root.dataset.coverRadius = appearance.coverRadius
}

/* ---------------------------------------------------------------------------
 * Store
 * ------------------------------------------------------------------------ */

interface SettingsState {
  prefs: Prefs
  updateAppearance: (patch: Partial<AppearancePrefs>) => void
  updatePlayback: (patch: Partial<PlaybackPrefs>) => void
  updateLyric: (patch: Partial<LyricPrefs>) => void
  /** 「恢复默认」：prefs 一键重置 */
  resetPrefs: () => void
  /** 「清除本地数据」：prefs / 备份 / 音量 / 队列快照一次清空（队列内存由调用方清） */
  clearLocalData: () => void
}

const initialPrefs = loadPrefs()

export const useSettingsStore = create<SettingsState>((set) => ({
  prefs: initialPrefs,

  updateAppearance: (patch) => {
    const current = useSettingsStore.getState().prefs
    const prefs: Prefs = { ...current, appearance: { ...current.appearance, ...patch } }
    applyAppearance(prefs.appearance)
    savePrefs(prefs)
    set({ prefs })
  },

  updatePlayback: (patch) => {
    const current = useSettingsStore.getState().prefs
    const prefs: Prefs = { ...current, playback: { ...current.playback, ...patch } }
    if (!prefs.playback.rememberVolume) removeKey(localStorage, VOLUME_KEY)
    if (!prefs.playback.restoreQueue) removeKey(sessionStorage, QUEUE_SESSION_KEY)
    savePrefs(prefs)
    set({ prefs })
  },

  updateLyric: (patch) => {
    const current = useSettingsStore.getState().prefs
    const prefs: Prefs = { ...current, lyric: { ...current.lyric, ...patch } }
    savePrefs(prefs)
    set({ prefs })
  },

  resetPrefs: () => {
    const prefs = mergePrefs(undefined)
    applyAppearance(prefs.appearance)
    savePrefs(prefs)
    set({ prefs })
  },

  clearLocalData: () => {
    try {
      clearByPrefix(localStorage, 'csplayer:')
      clearByPrefix(sessionStorage, 'csplayer:')
    } catch {
      // ignore
    }
    const prefs = mergePrefs(undefined)
    applyAppearance(prefs.appearance)
    savePrefs(prefs)
    set({ prefs })
  },
}))

// 启动即应用主题色 / 密度 / 圆角
applyAppearance(initialPrefs.appearance)

function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

function clearByPrefix(storage: Storage, prefix: string): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(prefix)) keys.push(k)
  }
  for (const k of keys) storage.removeItem(k)
}
