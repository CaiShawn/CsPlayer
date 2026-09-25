import { create } from 'zustand'
import {
  defaultContextMenuPrefs,
  normalizeContextMenu,
} from '../contextMenu/defaults'
import type { ContextKind, ContextMenuPrefs } from '../contextMenu/types'
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
export type CoverRadius = 'none' | 'md' | 'lg'
export type UnplayableAction = 'skip' | 'stop'
export type LyricFontSize = 'sm' | 'md' | 'lg'

export interface AppearancePrefs {
  accentPreset: AccentPresetName | 'custom'
  /** 自定义颜色（HEX6），仅 accentPreset === 'custom' 时生效 */
  customColor: string
  coverRadius: CoverRadius
}

export interface PlaybackPrefs {
  rememberVolume: boolean
  unplayableAction: UnplayableAction
  restoreQueue: boolean
  autoNext: boolean
  /** 刷新恢复队列后是否自动继续播放（关闭则停在原进度待手动播放） */
  autoPlayOnRestore: boolean
}

export interface LyricPrefs {
  fontSize: LyricFontSize
  showTranslation: boolean
  highlightCurrent: boolean
}

/** 自定义背景偏好（S4，设计 §4.5）；独立 key 持久化：csplayer:prefs:background */
export interface BackgroundPrefs {
  enabled: boolean
  /** 压缩后 JPEG dataURL；'' = 无图 */
  image: string
  /** 不透明度 0–100（默认 40） */
  opacity: number
  /** 模糊 0–40px（默认 0） */
  blur: number
  /** 缩放 100–300%（默认 100） */
  scale: number
  /** 平移（px，相对居中；双击复位为 0） */
  x: number
  y: number
}

export interface Prefs {
  appearance: AppearancePrefs
  playback: PlaybackPrefs
  lyric: LyricPrefs
  /** 右键菜单配置（独立 key 持久化：csplayer:prefs:contextMenu） */
  contextMenu: ContextMenuPrefs
}

export const PREFS_VERSION = 1
export const PREFS_KEY = 'csplayer:prefs:main'
export const PREFS_BACKUP_KEY = 'csplayer:prefs:backup'
export const VOLUME_KEY = 'csplayer:prefs:volume'
/** 歌词展开/收起状态（localStorage 记忆，刷新后跟随上次状态） */
export const LYRIC_COLLAPSED_KEY = 'csplayer:prefs:lyricCollapsed'
/** 队列钉住状态（S3）：'1'=钉住常驻；「清除本地数据」后回默认抽屉 */
export const QUEUE_PIN_KEY = 'csplayer:prefs:queuePin'
export const QUEUE_SESSION_KEY = 'csplayer:queue'
/** 右键菜单配置独立存储（设计 §2.2），schema 损坏时回落默认布局 */
export const CONTEXT_MENU_KEY = 'csplayer:prefs:contextMenu'
export const CONTEXT_MENU_VERSION = 1
/** 背景图独立存储（设计 §4.5，不进 PREFS_KEY 主信封） */
export const BACKGROUND_KEY = 'csplayer:prefs:background'
export const BACKGROUND_VERSION = 1

export const DEFAULT_PREFS: Prefs = {
  appearance: {
    accentPreset: 'emerald',
    customColor: '#10b981',
    coverRadius: 'md',
  },
  playback: {
    rememberVolume: true,
    unplayableAction: 'skip',
    restoreQueue: true,
    autoNext: true,
    autoPlayOnRestore: true,
  },
  lyric: {
    fontSize: 'md',
    showTranslation: true,
    highlightCurrent: true,
  },
  contextMenu: defaultContextMenuPrefs(),
}

export const DEFAULT_BACKGROUND: BackgroundPrefs = {
  enabled: false,
  image: '',
  opacity: 40,
  blur: 0,
  scale: 100,
  x: 0,
  y: 0,
}

interface StoredPrefs extends Prefs {
  prefsVersion: number
}

function mergePrefs(raw: Partial<Prefs> | undefined): Prefs {
  return {
    appearance: { ...DEFAULT_PREFS.appearance, ...raw?.appearance },
    playback: { ...DEFAULT_PREFS.playback, ...raw?.playback },
    lyric: { ...DEFAULT_PREFS.lyric, ...raw?.lyric },
    contextMenu: normalizeContextMenu(raw?.contextMenu),
  }
}

/** 右键菜单配置独立读取：损坏 / 非法内容直接回落默认布局 */
function readContextMenuPrefs(): ContextMenuPrefs {
  try {
    const raw = localStorage.getItem(CONTEXT_MENU_KEY)
    if (!raw) return defaultContextMenuPrefs()
    return normalizeContextMenu(JSON.parse(raw))
  } catch {
    return defaultContextMenuPrefs()
  }
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(min, Math.min(max, n))
}

/** 背景偏好独立读取：损坏 / 非法内容静默回默认（设计 S4-1） */
function readBackgroundPrefs(): BackgroundPrefs {
  try {
    const raw = localStorage.getItem(BACKGROUND_KEY)
    if (!raw) return { ...DEFAULT_BACKGROUND }
    const p = JSON.parse(raw) as Partial<BackgroundPrefs>
    return {
      enabled: p.enabled === true,
      image: typeof p.image === 'string' && p.image.startsWith('data:image/') ? p.image : '',
      opacity: clampNum(p.opacity, 0, 100, DEFAULT_BACKGROUND.opacity),
      blur: clampNum(p.blur, 0, 40, DEFAULT_BACKGROUND.blur),
      scale: clampNum(p.scale, 100, 300, DEFAULT_BACKGROUND.scale),
      x: clampNum(p.x, -4000, 4000, 0),
      y: clampNum(p.y, -4000, 4000, 0),
    }
  } catch {
    return { ...DEFAULT_BACKGROUND }
  }
}

function saveBackgroundNow(bg: BackgroundPrefs): boolean {
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify({ version: BACKGROUND_VERSION, ...bg }))
    return true
  } catch {
    // 存储满 / 被禁用：静默失败（调用方提示「存储空间不足」），内存态继续生效
    return false
  }
}

/** 滑杆 / 拖拽高频变更时防抖持久化（含大图 dataURL，避免每次 pointermove 全量写） */
let bgSaveTimer: number | null = null
function scheduleBackgroundSave(bg: BackgroundPrefs): void {
  if (bgSaveTimer !== null) window.clearTimeout(bgSaveTimer)
  bgSaveTimer = window.setTimeout(() => {
    bgSaveTimer = null
    saveBackgroundNow(bg)
  }, 200)
}

function flushBackgroundSave(bg: BackgroundPrefs): void {
  if (bgSaveTimer === null) return
  window.clearTimeout(bgSaveTimer)
  bgSaveTimer = null
  saveBackgroundNow(bg)
}

/** 读取 prefs；版本不兼容 / 内容损坏时重置为默认并把旧内容备份到 PREFS_BACKUP_KEY。 */
function loadPrefs(): Prefs {
  const contextMenu = readContextMenuPrefs()
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return mergePrefs({ contextMenu })
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>
    if (parsed.prefsVersion !== PREFS_VERSION) {
      localStorage.setItem(PREFS_BACKUP_KEY, raw)
      const restored = mergePrefs({ contextMenu })
      savePrefs(restored)
      return restored
    }
    return mergePrefs({ ...parsed, contextMenu })
  } catch {
    // storage 被禁用 / 内容损坏：静默降级为默认
    return mergePrefs({ contextMenu })
  }
}

function savePrefs(prefs: Prefs): void {
  const { contextMenu, ...main } = prefs
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ prefsVersion: PREFS_VERSION, ...main }))
    localStorage.setItem(
      CONTEXT_MENU_KEY,
      JSON.stringify({ version: CONTEXT_MENU_VERSION, ...contextMenu }),
    )
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

/** 把外观偏好写入 DOM：CSS 变量（主题色）+ data 属性（封面圆角） */
export function applyAppearance(appearance: AppearancePrefs): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const palette = resolvePalette(appearance)
  root.style.setProperty('--color-accent', palette.accent)
  root.style.setProperty('--color-accent-text', palette.text)
  root.style.setProperty('--color-accent-soft', palette.soft)
  root.style.setProperty('--color-accent-hover', palette.hover)
  root.dataset.coverRadius = appearance.coverRadius
}

/* ---------------------------------------------------------------------------
 * Store
 * ------------------------------------------------------------------------ */

interface SettingsState {
  prefs: Prefs
  /** 背景偏好（独立 key 持久化，不进 prefs 主信封） */
  background: BackgroundPrefs
  updateAppearance: (patch: Partial<AppearancePrefs>) => void
  updatePlayback: (patch: Partial<PlaybackPrefs>) => void
  updateLyric: (patch: Partial<LyricPrefs>) => void
  /** 背景参数变更（滑杆 / 拖拽 / 开关）：即时生效 + 防抖持久化 */
  updateBackground: (patch: Partial<BackgroundPrefs>) => void
  /** 设置背景图（压缩后 dataURL）：立即持久化，失败返回 false（调用方提示） */
  setBackgroundImage: (image: string) => boolean
  /** 移除背景图（保留其他参数） */
  removeBackgroundImage: () => void
  /** 右键菜单：勾选显示 / 隐藏 */
  toggleContextAction: (kind: ContextKind, id: string) => void
  /** 右键菜单：拖拽排序（from/to 为 order 下标） */
  moveContextAction: (kind: ContextKind, from: number, to: number) => void
  /** 右键菜单：恢复默认布局（不传 kind = 全部对象类型） */
  resetContextMenu: (kind?: ContextKind) => void
  /** 「恢复默认」：prefs 一键重置 */
  resetPrefs: () => void
  /** 「清除本地数据」：prefs / 备份 / 音量 / 队列快照一次清空（队列内存由调用方清） */
  clearLocalData: () => void
}

const initialPrefs = loadPrefs()
const initialBackground = readBackgroundPrefs()

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prefs: initialPrefs,
  background: initialBackground,

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

  updateBackground: (patch: Partial<BackgroundPrefs>): void => {
    const background = { ...get().background, ...patch }
    scheduleBackgroundSave(background)
    set({ background })
  },

  setBackgroundImage: (image: string): boolean => {
    const background = { ...get().background, image }
    set({ background })
    return saveBackgroundNow(background)
  },

  removeBackgroundImage: (): void => {
    const background = { ...get().background, image: '' }
    set({ background })
    saveBackgroundNow(background)
  },

  toggleContextAction: (kind, id) => {
    const current = useSettingsStore.getState().prefs
    const group = current.contextMenu[kind]
    const hidden = group.hidden.includes(id)
      ? group.hidden.filter((x) => x !== id)
      : [...group.hidden, id]
    const prefs: Prefs = {
      ...current,
      contextMenu: { ...current.contextMenu, [kind]: { ...group, hidden } },
    }
    savePrefs(prefs)
    set({ prefs })
  },

  moveContextAction: (kind, from, to) => {
    const current = useSettingsStore.getState().prefs
    const group = current.contextMenu[kind]
    const n = group.order.length
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return
    const order = [...group.order]
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    const prefs: Prefs = {
      ...current,
      contextMenu: { ...current.contextMenu, [kind]: { ...group, order } },
    }
    savePrefs(prefs)
    set({ prefs })
  },

  resetContextMenu: (kind) => {
    const current = useSettingsStore.getState().prefs
    const defaults = defaultContextMenuPrefs()
    const contextMenu = kind
      ? { ...current.contextMenu, [kind]: defaults[kind] }
      : defaults
    const prefs: Prefs = { ...current, contextMenu }
    savePrefs(prefs)
    set({ prefs })
  },

  resetPrefs: () => {
    const prefs = mergePrefs(undefined)
    applyAppearance(prefs.appearance)
    savePrefs(prefs)
    // 背景偏好属偏好非凭证：「恢复默认」一并清除（设计 §4.5）
    removeKey(localStorage, BACKGROUND_KEY)
    set({ prefs, background: { ...DEFAULT_BACKGROUND } })
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
    set({ prefs, background: { ...DEFAULT_BACKGROUND } })
  },
}))

// 关页 / 刷新前兜底持久化待写入的背景偏好（防抖窗口内丢失）
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flushBackgroundSave(useSettingsStore.getState().background))
}

// 启动即应用主题色 / 圆角
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
