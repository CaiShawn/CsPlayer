import { create } from 'zustand'
import { authApi } from '../api'
import type { UserProfile } from '../types'
import { useLikesStore } from './likesStore'
import { usePlayerStore } from './playerStore'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  initialized: boolean
  /** bump to force library pages refetch (account switch) */
  dataVersion: number
  fetchMe: () => Promise<void>
  loginSuccess: (user: UserProfile) => void
  logout: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  dataVersion: 0,

  fetchMe: async () => {
    set({ loading: true })
    try {
      const user = await authApi.me()
      set((s) => ({
        user,
        initialized: true,
        loading: false,
        dataVersion: s.dataVersion + 1,
      }))
    } catch {
      set({ user: null, initialized: true, loading: false })
    }
  },

  loginSuccess: (user) => {
    useLikesStore.getState().clear()
    set((s) => ({
      user,
      initialized: true,
      dataVersion: s.dataVersion + 1,
    }))
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    useLikesStore.getState().clear()
    set({ user: null })
  },

  clear: () => {
    useLikesStore.getState().clear()
    usePlayerStore.getState().clearQueue()
    set({ user: null })
  },
}))
