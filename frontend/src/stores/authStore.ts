import { create } from 'zustand'
import { authApi } from '../api'
import type { UserProfile } from '../types'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  initialized: boolean
  fetchMe: () => Promise<void>
  loginSuccess: (user: UserProfile) => void
  logout: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  fetchMe: async () => {
    set({ loading: true })
    try {
      const user = await authApi.me()
      set({ user, initialized: true, loading: false })
    } catch {
      set({ user: null, initialized: true, loading: false })
    }
  },

  loginSuccess: (user) => set({ user, initialized: true }),

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    set({ user: null })
  },

  clear: () => set({ user: null }),
}))
