import { create } from 'zustand'
import { libraryApi, songApi } from '../api'
import type { SongSummary } from '../types'

/* ---------------------------------------------------------------------------
 * likes 单一数据源（S2-3）：SWR 语义
 *   - 二次进入「我喜欢」：缓存立即渲染（<100ms），后台静默刷新，有 diff 才替换；
 *   - 刷新失败：保留上次缓存 + 页面顶部错误条 + 重试（不整页打回 Loading）；
 *   - 写操作（红心）：乐观更新本地缓存，失败回滚；
 *   - 切账号（authStore.dataVersion 变化）：丢弃缓存重拉，不串数据；
 *   - fetchIds 在 tracks 已加载时直接短路（ids 自 tracks 派生），去重数据源。
 * ------------------------------------------------------------------------ */

interface LikesState {
  ids: Set<number>
  tracks: SongSummary[]
  /** 已有可用缓存（true = 页面可直接渲染缓存内容） */
  tracksLoaded: boolean
  /** 最近一次加载/刷新失败信息（有缓存时仅顶部错误条提示） */
  tracksError: string
  /** 后台静默刷新中（不阻塞渲染） */
  refreshing: boolean
  /** 缓存所属账号的 authStore.dataVersion（切账号丢弃缓存，防串数据） */
  version: number
  toast: string
  fetchIds: (dataVersion: number) => Promise<void>
  fetchTracks: (dataVersion: number) => Promise<void>
  toggle: (song: SongSummary) => Promise<boolean>
  setToast: (msg: string) => void
  clear: () => void
}

const NO_VERSION = -1

export const useLikesStore = create<LikesState>((set, get) => {
  /** 版本守卫：dataVersion 变化（切账号/重新登录）即丢弃全部缓存。
   *  返回 true 表示本次调用前已有同账号缓存。 */
  const guard = (dataVersion: number): boolean => {
    const s = get()
    if (s.version === dataVersion) return s.tracksLoaded
    set({
      ids: new Set(),
      tracks: [],
      tracksLoaded: false,
      tracksError: '',
      refreshing: false,
      version: dataVersion,
    })
    return false
  }

  return {
    ids: new Set(),
    tracks: [],
    tracksLoaded: false,
    tracksError: '',
    refreshing: false,
    version: NO_VERSION,
    toast: '',

    fetchIds: async (dataVersion) => {
      const warm = guard(dataVersion)
      // 单一数据源去重（S2-3）：tracks 已加载时 ids 自其派生，不再打 /user/liked-ids
      if (warm) return
      try {
        const { ids } = await libraryApi.likedIds()
        if (get().version !== dataVersion) return // 期间已切账号：丢弃过期结果
        set({ ids: new Set(ids || []) })
      } catch {
        // ignore — heart state degrades to empty
      }
    },

    fetchTracks: async (dataVersion) => {
      const warm = guard(dataVersion)
      // SWR：有缓存则静默刷新（保留内容），无缓存才出骨架屏
      set(warm ? { refreshing: true } : { tracksLoaded: false, tracksError: '', refreshing: true })
      try {
        const data = await libraryApi.likes()
        if (get().version !== dataVersion) return // 期间已切账号：丢弃过期结果
        const tracks = data.tracks || []
        // 有 diff 才替换列表（避免无谓重渲染打断滚动/悬停）
        const prev = get().tracks
        const same =
          prev.length === tracks.length && prev.every((t, i) => t.id === tracks[i].id)
        set({
          tracks: same ? prev : tracks,
          ids: new Set(tracks.map((t) => t.id)),
          tracksLoaded: true,
          tracksError: '',
          refreshing: false,
        })
      } catch (e) {
        if (get().version !== dataVersion) return
        // SWR：失败保留上次缓存（tracksLoaded 不动），由页面出错误条 + 重试
        set({
          tracksError: e instanceof Error ? e.message : '加载我喜欢失败',
          refreshing: false,
        })
      }
    },

    toggle: async (song) => {
      const prevIds = get().ids
      const prevTracks = get().tracks
      const wasLiked = prevIds.has(song.id)
      const nextLiked = !wasLiked

      const ids = new Set(prevIds)
      if (nextLiked) ids.add(song.id)
      else ids.delete(song.id)

      let tracks = prevTracks
      if (get().tracksLoaded) {
        tracks = nextLiked
          ? [song, ...prevTracks.filter((t) => t.id !== song.id)]
          : prevTracks.filter((t) => t.id !== song.id)
      }

      set({ ids, tracks })

      try {
        await songApi.like(song.id, nextLiked)
        return nextLiked
      } catch (e) {
        set({ ids: prevIds, tracks: prevTracks })
        set({ toast: e instanceof Error ? e.message : '更新喜欢失败' })
        return wasLiked
      }
    },

    setToast: (msg) => set({ toast: msg }),
    clear: () =>
      set({
        ids: new Set(),
        tracks: [],
        tracksLoaded: false,
        tracksError: '',
        refreshing: false,
        version: NO_VERSION,
        toast: '',
      }),
  }
})
