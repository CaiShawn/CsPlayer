import { create } from 'zustand'
import { authApi, ApiError } from '../api'
import { clearCred, loadCred } from '../utils/cred'
import type { UserProfile } from '../types'
import { useLikesStore } from './likesStore'
import { usePlayerStore } from './playerStore'

/** 模块级 inflight 去重：并发 401 只打一次 restore（v0.1.4 S1-4） */
let inflightRestore: Promise<boolean> | null = null

interface AuthState {
  user: UserProfile | null
  loading: boolean
  initialized: boolean
  /** bump to force library pages refetch (account switch) */
  dataVersion: number
  fetchMe: () => Promise<void>
  loginSuccess: (user: UserProfile) => void
  /** 用浏览器保存的凭证静默恢复会话；成功 true，失败 false */
  restoreSession: () => Promise<boolean>
  logout: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
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
      return
    } catch {
      // 会话失效（后端重启等）→ 兑底用浏览器凭证静默恢复
    }
    const restored = await get().restoreSession()
    if (restored) {
      set({ loading: false })
    } else {
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

  restoreSession: () => {
    if (inflightRestore) return inflightRestore
    inflightRestore = (async () => {
      const cred = loadCred()
      if (!cred) return false
      try {
        const { user } = await authApi.restore(cred)
        set((s) => ({
          user,
          initialized: true,
          dataVersion: s.dataVersion + 1,
        }))
        return true
      } catch (e) {
        // 凭证已过期 / 校验失败（401）→ 丢弃凭证；网络抖动保留以便下次启动重试
        if (e instanceof ApiError && e.status === 401) clearCred()
        return false
      }
    })().finally(() => {
      inflightRestore = null
    })
    return inflightRestore
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    // 无论请求成败都丢弃凭证：登出后下次启动必须重新扫码
    clearCred()
    useLikesStore.getState().clear()
    set({ user: null })
  },

  clear: () => {
    useLikesStore.getState().clear()
    usePlayerStore.getState().clearQueue()
    set({ user: null })
  },
}))
