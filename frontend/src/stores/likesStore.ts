import { create } from 'zustand'
import { libraryApi, songApi } from '../api'
import type { SongSummary } from '../types'

interface LikesState {
  ids: Set<number>
  tracks: SongSummary[]
  tracksLoaded: boolean
  toast: string
  fetchIds: () => Promise<void>
  fetchTracks: () => Promise<void>
  toggle: (song: SongSummary) => Promise<boolean>
  setToast: (msg: string) => void
  clear: () => void
}

export const useLikesStore = create<LikesState>((set, get) => ({
  ids: new Set(),
  tracks: [],
  tracksLoaded: false,
  toast: '',

  fetchIds: async () => {
    try {
      const { ids } = await libraryApi.likedIds()
      set({ ids: new Set(ids || []) })
    } catch {
      // ignore — heart state degrades to empty
    }
  },

  fetchTracks: async () => {
    try {
      const data = await libraryApi.likes()
      const tracks = data.tracks || []
      set({
        tracks,
        tracksLoaded: true,
        ids: new Set(tracks.map((t) => t.id)),
      })
    } catch (e) {
      set({ tracksLoaded: true })
      set({ toast: e instanceof Error ? e.message : '加载我喜欢失败' })
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
    set({ ids: new Set(), tracks: [], tracksLoaded: false, toast: '' }),
}))
