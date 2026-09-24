import { create } from 'zustand'
import { libraryApi, songApi } from '../api'
import type { SongSummary } from '../types'

/* ---------------------------------------------------------------------------
 * likes 单一数据源（S2-3）：SWR 语义 + 分批加载（v0.1.7）
 *   - 分批：首批 30 首，滚动到底 fetchMoreTracks 续拉 30 首（不再一次拉全量）；
 *     「播放全部」例外：fetchAllTracks 一次性取回全量以整体替换播放队列；
 *   - 二次进入「我喜欢」：缓存立即渲染（<100ms），后台静默刷新「已显示窗口」；
 *   - 刷新失败：保留上次缓存 + 页面顶部错误条 + 重试（不整页打回 Loading）；
 *   - 写操作（红心）：乐观更新本地缓存，失败回滚；
 *   - 切账号（authStore.dataVersion 变化）：丢弃缓存重拉，不串数据；
 *   - ids 是全量红心集合（/user/liked-ids）：分批后 tracks 只是前缀，
 *     不再由 tracks 全量派生；仅 likes 已拉全时短路派生（S2-3 去重）。
 * ------------------------------------------------------------------------ */

/** 单批条数（与后端 PAGE 一致） */
export const LIKES_BATCH = 30

interface LikesState {
  ids: Set<number>
  tracks: SongSummary[]
  /** 已有可用缓存（true = 页面可直接渲染缓存内容） */
  tracksLoaded: boolean
  /** 后端已知的全量曲目数（拉全前为上游 trackCount hint） */
  total: number
  /** 还有下一批可续拉 */
  hasMore: boolean
  /** 续拉下一批中（滚动加载指示） */
  loadingMore: boolean
  /** 最近一次加载/刷新失败信息（有缓存时仅顶部错误条提示） */
  tracksError: string
  /** 后台静默刷新中（不阻塞渲染） */
  refreshing: boolean
  /** 缓存所属账号的 authStore.dataVersion（切账号丢弃缓存，防串数据） */
  version: number
  toast: string
  fetchIds: (dataVersion: number) => Promise<void>
  fetchTracks: (dataVersion: number) => Promise<void>
  fetchMoreTracks: (dataVersion: number) => Promise<void>
  fetchAllTracks: (dataVersion: number) => Promise<SongSummary[]>
  toggle: (song: SongSummary) => Promise<boolean>
  setToast: (msg: string) => void
  clear: () => void
}

const NO_VERSION = -1

const EMPTY = {
  ids: new Set<number>(),
  tracks: [] as SongSummary[],
  tracksLoaded: false,
  total: 0,
  hasMore: false,
  loadingMore: false,
  tracksError: '',
  refreshing: false,
}

export const useLikesStore = create<LikesState>((set, get) => {
  /** 版本守卫：dataVersion 变化（切账号/重新登录）即丢弃全部缓存。
   *  返回 true 表示本次调用前已有同账号缓存。 */
  const guard = (dataVersion: number): boolean => {
    const s = get()
    if (s.version === dataVersion) return s.tracksLoaded
    set({ ...EMPTY, version: dataVersion })
    return false
  }

  return {
    ...EMPTY,
    version: NO_VERSION,
    toast: '',

    fetchIds: async (dataVersion) => {
      guard(dataVersion) // 仅用于切账号时丢弃缓存
      // 单一数据源去重（S2-3）：likes 已拉全时 ids 自 tracks 派生，
      // 不再打 /user/liked-ids；分批未拉全时 ids 需走全量接口
      const s = get()
      if (s.tracksLoaded && !s.hasMore) {
        set({ ids: new Set(s.tracks.map((t) => t.id)) })
        return
      }
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
        const loaded = get().tracks.length
        // 静默刷新只刷「已显示窗口」，冷加载首批 LIKES_BATCH
        const data = await libraryApi.likes(0, warm ? Math.max(LIKES_BATCH, loaded) : LIKES_BATCH)
        if (get().version !== dataVersion) return // 期间已切账号：丢弃过期结果
        const tracks = data.tracks || []
        // 有 diff 才替换列表（避免无谓重渲染打断滚动/悬停）
        const prev = get().tracks
        const same =
          prev.length === tracks.length && prev.every((t, i) => t.id === tracks[i].id)
        set({
          tracks: same ? prev : tracks,
          total: data.total || tracks.length,
          hasMore: !!data.hasMore,
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

    fetchMoreTracks: async (dataVersion) => {
      const s = get()
      if (s.version !== dataVersion) return
      if (!s.tracksLoaded || !s.hasMore || s.loadingMore) return
      set({ loadingMore: true })
      try {
        // offset = 已加载数：与服务端「我喜欢」歌单顺序一致（新红心入头顶层）
        const data = await libraryApi.likes(get().tracks.length, LIKES_BATCH)
        if (get().version !== dataVersion) return
        const items = data.tracks || []
        const known = new Set(get().tracks.map((t) => t.id))
        const append = items.filter((t) => !known.has(t.id))
        set({
          tracks: [...get().tracks, ...append],
          total: data.total || get().total,
          hasMore: !!data.hasMore,
          loadingMore: false,
        })
      } catch (e) {
        if (get().version !== dataVersion) return
        set({
          loadingMore: false,
          toast: e instanceof Error ? e.message : '加载更多失败',
        })
      }
    },

    /** 「播放全部」后台补全用：一次性取回全量曲目（分批 200 续拉，走服务端增量缓存）。
     *  不改动 tracks 懒加载窗口（列表仍分批渲染），仅返回完整列表供补全播放队列。
     *  网络失败向上抛出，由调用方提示；期间切账号返回空数组。 */
    fetchAllTracks: async (dataVersion) => {
      guard(dataVersion)
      if (get().version !== dataVersion) return []
      const all: SongSummary[] = []
      const known = new Set<number>()
      const push = (items: SongSummary[]) => {
        for (const t of items) {
          if (!known.has(t.id)) {
            known.add(t.id)
            all.push(t)
          }
        }
      }
      // 已加载前缀为底（与服务端歌单顺序一致），续拉剩余部分
      push(get().tracks)
      // offset 按服务端返回条数推进（去重不回拨，避免跳条）；单批上限 200
      for (let offset = get().tracks.length; ; ) {
        const data = await libraryApi.likes(offset, 200)
        if (get().version !== dataVersion) return [] // 期间已切账号：丢弃过期结果
        const items = data.tracks || []
        push(items)
        offset += items.length
        if (!data.hasMore || items.length === 0) break
      }
      return all
    },

    toggle: async (song) => {
      const prevIds = get().ids
      const prevTracks = get().tracks
      const prevTotal = get().total
      const wasLiked = prevIds.has(song.id)
      const nextLiked = !wasLiked

      const ids = new Set(prevIds)
      if (nextLiked) ids.add(song.id)
      else ids.delete(song.id)

      let tracks = prevTracks
      if (get().tracksLoaded) {
        // 新红心入头（与服务端歌单顺序一致），取消则移除
        tracks = nextLiked
          ? [song, ...prevTracks.filter((t) => t.id !== song.id)]
          : prevTracks.filter((t) => t.id !== song.id)
      }

      set({
        ids,
        tracks,
        total: Math.max(0, prevTotal + (nextLiked ? 1 : -1)),
      })

      try {
        await songApi.like(song.id, nextLiked)
        return nextLiked
      } catch (e) {
        set({ ids: prevIds, tracks: prevTracks, total: prevTotal })
        set({ toast: e instanceof Error ? e.message : '更新喜欢失败' })
        return wasLiked
      }
    },

    setToast: (msg) => set({ toast: msg }),
    clear: () =>
      set({
        ...EMPTY,
        ids: new Set(),
        version: NO_VERSION,
        toast: '',
      }),
  }
})
