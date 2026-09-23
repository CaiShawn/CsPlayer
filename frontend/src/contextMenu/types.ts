import type { AlbumBrief, PlaylistBrief, SongSummary } from '../types'

/* ------------------------------------------------------------------------
 * 右键菜单共享类型（纯类型模块，禁止 import 任何 store，避免循环依赖）
 * --------------------------------------------------------------------- */

/** 可配置的对象类型（= 设置中的分组）；队列项 / 当前曲复用 song 配置 */
export type ContextKind = 'song' | 'album' | 'playlist'

export const CONTEXT_KINDS: ContextKind[] = ['song', 'album', 'playlist']

export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  song: '歌曲',
  album: '专辑',
  playlist: '歌单',
}

/**
 * 菜单触发目标。
 * song：歌曲行 / 当前曲 / 队列项（queueIndex 仅队列项存在 → 出现「从队列移除」）
 */
export type ContextTarget =
  | {
      kind: 'song'
      song: SongSummary
      /** 所在列表（用于「播放」定位起点） */
      songs?: SongSummary[]
      index?: number
      /** 播放队列内的下标（仅队列面板项） */
      queueIndex?: number
    }
  | { kind: 'album'; album: AlbumBrief }
  | { kind: 'playlist'; playlist: PlaylistBrief }

/** 每类对象的菜单配置：order 有序 = 显示顺序（含隐藏项），hidden = 隐藏的 id */
export interface ContextGroupPrefs {
  order: string[]
  hidden: string[]
}

export type ContextMenuPrefs = Record<ContextKind, ContextGroupPrefs>
