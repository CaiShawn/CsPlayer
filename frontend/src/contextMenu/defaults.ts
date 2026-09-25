import type { ContextGroupPrefs, ContextKind, ContextMenuPrefs } from './types'
import { CONTEXT_KINDS } from './types'

/**
 * 默认布局（同时是各对象类型的合法动作 id 全集 —— 新增动作时在此登记）。
 * 顺序与设计文档 §2.2 动作矩阵一致。
 */
export const DEFAULT_CONTEXT_ORDER: Record<ContextKind, string[]> = {
  song: [
    'play',
    'playNext',
    'addQueue',
    'like',
    'removeFromQueue',
    'viewSource',
    'viewAlbum',
    'viewArtist',
    'copyLink',
    'copySongId',
    'shareCard',
  ],
  album: ['play', 'playNext', 'addQueue', 'viewArtist', 'copyLink', 'shareCard'],
  playlist: ['play', 'playNext', 'addQueue', 'copyLink', 'shareCard'],
}

function defaultGroup(kind: ContextKind): ContextGroupPrefs {
  return { order: [...DEFAULT_CONTEXT_ORDER[kind]], hidden: [] }
}

export function defaultContextMenuPrefs(): ContextMenuPrefs {
  return {
    song: defaultGroup('song'),
    album: defaultGroup('album'),
    playlist: defaultGroup('playlist'),
  }
}

/** 单组合并：丢弃未知 id、补齐新增 id（保持默认相对顺序），损坏字段回落默认 */
export function normalizeContextGroup(
  kind: ContextKind,
  raw: unknown,
): ContextGroupPrefs {
  const valid = DEFAULT_CONTEXT_ORDER[kind]
  const group = (raw ?? {}) as Partial<ContextGroupPrefs>
  const rawOrder = Array.isArray(group.order)
    ? group.order.filter((id): id is string => typeof id === 'string' && valid.includes(id))
    : []
  const order = [...rawOrder, ...valid.filter((id) => !rawOrder.includes(id))]
  const hidden = Array.isArray(group.hidden)
    ? group.hidden.filter(
        (id): id is string => typeof id === 'string' && valid.includes(id),
      )
    : []
  return { order, hidden }
}

/** prefs 合并策略：未知 / 损坏内容回落默认布局（S3-2） */
export function normalizeContextMenu(raw: unknown): ContextMenuPrefs {
  const source = (raw ?? {}) as Record<string, unknown>
  const result = {} as ContextMenuPrefs
  for (const kind of CONTEXT_KINDS) {
    result[kind] = normalizeContextGroup(kind, source[kind])
  }
  return result
}
