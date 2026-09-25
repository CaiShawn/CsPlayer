/**
 * 右键菜单动作注册表：id → { label, icon, kinds, run }。
 * 只依赖 playerStore / likesStore / api / 路由跳转，不新开服务层。
 */
import type { NavigateFunction } from 'react-router-dom'
import { libraryApi } from '../api'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'
import type { QueueSource, SongSummary } from '../types'
import { copyText } from '../utils/clipboard'
import type { ContextGroupPrefs, ContextKind, ContextTarget } from './types'

export type { ContextTarget } from './types'

export interface ActionContext {
  target: ContextTarget
  navigate: NavigateFunction
  close: () => void
  toast: (msg: string) => void
}

export interface ContextAction {
  id: string
  /** 静态文案，或按目标动态生成（如 喜欢 / 取消喜欢） */
  label: string | ((target: ContextTarget) => string)
  /** 设置页展示名（label 为函数时提供） */
  name?: string
  icon: string
  /** 适用对象类型 */
  kinds: ContextKind[]
  /** 仅播放队列项（目标带 queueIndex 的歌曲） */
  queueOnly?: boolean
  /** 危险动作：弱化红色 */
  danger?: boolean
  /** 运行时二次过滤（如缺少 albumId / artistId） */
  when?: (target: ContextTarget) => boolean
  run: (ctx: ActionContext) => void | Promise<void>
}

/* ------------------------------------------------------------------ */
/* 目标辅助                                                            */
/* ------------------------------------------------------------------ */

function albumIdOf(target: ContextTarget): number {
  if (target.kind === 'song') return target.song.albumId
  if (target.kind === 'album') return target.album.id
  return 0
}

function artistIdOf(target: ContextTarget): number {
  if (target.kind === 'song') return target.song.artists[0]?.id ?? 0
  if (target.kind === 'album') return target.album.artistId
  return 0
}

/** 队列来源（A2，S4 结构化）：播放队列面板标题下展示；专辑 / 歌单带 id 支持「查看来源」 */
function sourceOf(target: ContextTarget): QueueSource {
  if (target.kind === 'album')
    return { label: `专辑《${target.album.name}》`, kind: 'album', id: target.album.id }
  if (target.kind === 'playlist')
    return { label: `歌单《${target.playlist.name}》`, kind: 'playlist', id: target.playlist.id }
  return { label: '单曲' }
}

/** 目标对应的完整歌曲列表（专辑 / 歌单实时取详情，动作不新开服务层） */
async function collectTracks(target: ContextTarget): Promise<SongSummary[]> {
  if (target.kind === 'song') return [target.song]
  if (target.kind === 'album') {
    const detail = await libraryApi.albumDetail(target.album.id)
    return detail.tracks
  }
  const detail = await libraryApi.playlistDetail(target.playlist.id)
  return detail.tracks
}

export function isQueueTarget(target: ContextTarget): boolean {
  return target.kind === 'song' && target.queueIndex != null
}

/** wyy（网易云）网页版外链：复制链接目标 */
const NCM_WEB_ORIGIN = 'https://music.163.com'

function ncmWebLinkOf(target: ContextTarget): string {
  if (target.kind === 'album') return `${NCM_WEB_ORIGIN}/album?id=${target.album.id}`
  if (target.kind === 'playlist') return `${NCM_WEB_ORIGIN}/playlist?id=${target.playlist.id}`
  return target.song.id > 0 ? `${NCM_WEB_ORIGIN}/song?id=${target.song.id}` : ''
}

function startList(tracks: SongSummary[], from?: SongSummary) {
  const playable = tracks.filter((t) => t.playable)
  const start = from ? Math.max(0, playable.findIndex((t) => t.id === from.id)) : 0
  return { playable, start }
}

/* ------------------------------------------------------------------ */
/* 内置动作（顺序即默认布局，与设计 §2.2 矩阵一致）                        */
/* ------------------------------------------------------------------ */

export const CONTEXT_ACTIONS: ContextAction[] = [
  {
    id: 'play',
    label: '播放',
    icon: '▶',
    kinds: ['song', 'album', 'playlist'],
    run: async ({ target, close, toast }) => {
      close()
      const player = usePlayerStore.getState()
      if (isQueueTarget(target) && target.kind === 'song') {
        player.jumpTo(target.queueIndex as number)
        return
      }
      try {
        const tracks = await collectTracks(target)
        const { playable, start } = startList(
          tracks,
          target.kind === 'song' ? target.song : undefined,
        )
        if (!playable.length) {
          toast('没有可播放的歌曲')
          return
        }
        player.playSongs(playable, start, sourceOf(target))
      } catch (e) {
        toast(e instanceof Error ? e.message : '播放失败')
      }
    },
  },
  {
    id: 'playNext',
    label: '下一首播放',
    icon: '⏭',
    kinds: ['song', 'album', 'playlist'],
    run: async ({ target, close, toast }) => {
      close()
      try {
        const tracks = await collectTracks(target)
        const playable = tracks.filter((t) => t.playable)
        if (!playable.length) {
          toast('没有可播放的歌曲')
          return
        }
        usePlayerStore.getState().insertNext(playable)
        toast(playable.length > 1 ? `已加入下一首播放（${playable.length} 首）` : '已加入下一首播放')
      } catch (e) {
        toast(e instanceof Error ? e.message : '操作失败')
      }
    },
  },
  {
    id: 'addQueue',
    label: '加入队列末尾',
    icon: '＋',
    kinds: ['song', 'album', 'playlist'],
    run: async ({ target, close, toast }) => {
      close()
      try {
        const tracks = await collectTracks(target)
        const playable = tracks.filter((t) => t.playable)
        if (!playable.length) {
          toast('没有可播放的歌曲')
          return
        }
        usePlayerStore.getState().enqueue(playable)
        toast(playable.length > 1 ? `已加入播放队列（${playable.length} 首）` : '已加入播放队列')
      } catch (e) {
        toast(e instanceof Error ? e.message : '操作失败')
      }
    },
  },
  {
    id: 'removeFromQueue',
    label: '从队列移除',
    icon: '✕',
    kinds: ['song'],
    queueOnly: true,
    danger: true,
    run: ({ target, close }) => {
      close()
      if (target.kind === 'song' && target.queueIndex != null) {
        usePlayerStore.getState().removeFromQueue(target.queueIndex)
      }
    },
  },
  {
    id: 'viewSource',
    name: '查看来源',
    label: '查看来源',
    icon: '↩',
    kinds: ['song'],
    queueOnly: true,
    // 仅队列来源为可跳转对象（专辑 / 歌单详情页）时出现；近来听 / 搜索等纯标签来源不显示
    when: () => {
      const src = usePlayerStore.getState().queueSource
      return !!src && src.kind != null && src.id != null
    },
    run: ({ navigate, close }) => {
      const src = usePlayerStore.getState().queueSource
      close()
      if (!src || src.id == null) return
      if (src.kind === 'playlist') navigate(`/playlist/${src.id}`)
      else if (src.kind === 'album') navigate(`/album/${src.id}`)
    },
  },
  {
    id: 'viewAlbum',
    label: '查看专辑',
    icon: '◎',
    kinds: ['song'],
    when: (target) => albumIdOf(target) > 0,
    run: ({ target, close, navigate }) => {
      close()
      navigate(`/album/${albumIdOf(target)}`)
    },
  },
  {
    id: 'viewArtist',
    label: '查看歌手',
    icon: '♪',
    kinds: ['song', 'album'],
    when: (target) => artistIdOf(target) > 0,
    run: ({ target, close, navigate }) => {
      close()
      navigate(`/artist/${artistIdOf(target)}`)
    },
  },
  {
    id: 'copyLink',
    label: '复制链接',
    icon: '⧉',
    kinds: ['song', 'album', 'playlist'],
    run: async ({ target, close, toast }) => {
      close()
      const link = ncmWebLinkOf(target)
      if (!link) {
        toast('无可复制的链接')
        return
      }
      const ok = await copyText(link)
      toast(ok ? '已复制网易云网页版链接' : '复制失败')
    },
  },
  {
    id: 'shareCard',
    label: '分享卡片',
    icon: '◫',
    kinds: ['song', 'album', 'playlist'],
    run: ({ target, close }) => {
      close()
      // 入参直接携带现有 target 数据（设计 §1.5）；专辑缺曲目数时由弹窗补拉详情
      if (target.kind === 'song') useUiStore.getState().openShareCard({ kind: 'song', song: target.song })
      else if (target.kind === 'album') useUiStore.getState().openShareCard({ kind: 'album', album: target.album })
      else useUiStore.getState().openShareCard({ kind: 'playlist', playlist: target.playlist })
    },
  },
]

const ACTION_MAP: Record<string, ContextAction> = Object.fromEntries(
  CONTEXT_ACTIONS.map((a) => [a.id, a]),
)

export function actionById(id: string): ContextAction | undefined {
  return ACTION_MAP[id]
}

export function labelOf(action: ContextAction, target: ContextTarget): string {
  return typeof action.label === 'function' ? action.label(target) : action.label
}

/** 设置页展示名（不依赖具体目标） */
export function displayNameOf(action: ContextAction): string {
  return action.name ?? (typeof action.label === 'string' ? action.label : action.id)
}

/** 按对象过滤 + 用户配置（显隐 / 顺序）解析出本次要渲染的动作 */
export function resolveActions(
  kind: ContextKind,
  group: ContextGroupPrefs,
  target: ContextTarget,
): ContextAction[] {
  return group.order
    .filter((id) => !group.hidden.includes(id))
    .map((id) => ACTION_MAP[id])
    .filter((a): a is ContextAction => !!a && a.kinds.includes(kind))
    .filter((a) => !(a.queueOnly && !isQueueTarget(target)))
    .filter((a) => !a.when || a.when(target))
}
