import { create } from 'zustand'
import { authApi, ApiError } from '../api'
import {
  loadAccount,
  removeAccount,
  upsertAccount,
  type SavedAccount,
} from '../utils/cred'
import type { UserProfile } from '../types'
import { useLikesStore } from './likesStore'
import { usePlayerStore } from './playerStore'

/** 切换 / 退出等手动动作序号（§3.6.3）：restore 结果落库前复查，
 *  防止过期结果覆盖手动切换后的新状态 */
let switchEpoch = 0

/** 按目标账号 inflight 去重（§3.6.2）：并发 401 对同一账号只打一次 restore，
 *  而手动切换（目标不同账号）不被误合并 */
const inflightRestores = new Map<string, Promise<UserProfile>>()

function restoreKey(target: SavedAccount): string {
  // v1 迁移条目 userId 暂缺（0），退化用 MUSIC_U 作键，避免不同条目被误合并
  return target.userId > 0 ? `id:${target.userId}` : `cred:${target.cred.MUSIC_U}`
}

/** restore 纯取数（共用同一入口 /api/auth/restore），状态写入由调用方按 epoch 复查后落库 */
function restoreFetch(target: SavedAccount): Promise<UserProfile> {
  const key = restoreKey(target)
  const existing = inflightRestores.get(key)
  if (existing) return existing
  const p = authApi.restore(target.cred).then((r) => r.user)
  inflightRestores.set(key, p)
  const done = () => {
    if (inflightRestores.get(key) === p) inflightRestores.delete(key)
  }
  p.then(done, done)
  return p
}

export type SwitchResult = 'ok' | 'expired' | 'error'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  initialized: boolean
  /** bump to force library pages refetch (account switch) */
  dataVersion: number
  /** 手动切换账号进行中：挂起 401 自动恢复（§3.6.1） */
  switching: boolean
  fetchMe: () => Promise<void>
  loginSuccess: (user: UserProfile) => void
  /** 用浏览器保存的凭证静默恢复会话（缺省 = active 账号）；成功 true，失败 false */
  restoreSession: (userId?: number) => Promise<boolean>
  /** 一键切换到已保存账号（免扫码）；失败分级：expired（凭证过期）/ error */
  switchAccount: (userId: number) => Promise<SwitchResult>
  /** 移除已保存账号；移除的是当前账号则等价 logout()（吊销凭证） */
  removeSavedAccount: (userId: number) => Promise<void>
  /** 彻底退出当前账号：上游吊销 + 移除当前条目（其余账号保留，§3.4） */
  logout: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,
  dataVersion: 0,
  switching: false,

  fetchMe: async () => {
    set({ loading: true })
    try {
      const user = await authApi.me()
      // 会话仍有效：正常进入，不触碰凭证库（§4.4）
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

  restoreSession: (userId?: number) => {
    const target = userId === undefined ? loadAccount() : loadAccount(userId)
    if (!target) return Promise.resolve(false)
    const epoch = switchEpoch
    return (async () => {
      try {
        const user = await restoreFetch(target)
        // 落库前复查（§3.6.3）：期间发生手动切换 / 退出 → 过期结果不覆盖新状态
        if (epoch !== switchEpoch) return false
        // 覆盖更新 = 凭证刷新 + 昵称头像同步 + v1 迁移条目身份回填
        upsertAccount(user, target.cred)
        useLikesStore.getState().clear()
        set((s) => ({
          user,
          initialized: true,
          loading: false,
          dataVersion: s.dataVersion + 1,
        }))
        return true
      } catch (e) {
        // 该账号凭证过期（401）→ 仅移除该条目，其他账号不动（网络抖动保留待下次重试）
        if (e instanceof ApiError && e.status === 401) removeAccount(target.userId)
        return false
      }
    })()
  },

  switchAccount: (userId: number) => {
    const target = loadAccount(userId)
    if (!target) return Promise.resolve<SwitchResult>('error')
    const epoch = ++switchEpoch
    set({ switching: true })
    return (async (): Promise<SwitchResult> => {
      try {
        const user = await restoreFetch(target)
        if (epoch !== switchEpoch) return 'error'
        // touch + 身份回填 + 置 active；全程不触碰其他账号凭证（§3.3）
        upsertAccount(user, target.cred)
        useLikesStore.getState().clear()
        set((s) => ({
          user,
          initialized: true,
          dataVersion: s.dataVersion + 1,
        }))
        return 'ok'
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          removeAccount(target.userId) // 仅该账号失效移除
          return 'expired'
        }
        return 'error' // 不动凭证库
      } finally {
        if (epoch === switchEpoch) set({ switching: false })
      }
    })()
  },

  removeSavedAccount: async (userId: number) => {
    // 「移除当前账号」等价 logout()（吊销凭证）；其余条目纯本地删除、不吊销（§3.4）
    const active = loadAccount()
    const currentId = get().user?.userId
    const isCurrent =
      userId === currentId || (currentId !== undefined && active?.userId === userId)
    if (isCurrent) {
      await get().logout()
      return
    }
    removeAccount(userId)
  },

  logout: async () => {
    switchEpoch++ // 在途 restore 结果全部作废，避免退出后被旧结果拉回
    try {
      await authApi.logout() // 上游吊销当前账号凭证（§3.4 / S0-1）
    } catch {
      // ignore
    }
    // 彻底退出 = 吊销当前账号 + 仅移除当前条目；其余已保存账号不受影响（§3.4）
    const uid = get().user?.userId
    const entry = (uid !== undefined ? loadAccount(uid) : null) ?? loadAccount()
    if (entry) removeAccount(entry.userId)
    useLikesStore.getState().clear()
    usePlayerStore.getState().clearQueue()
    set({ user: null, switching: false, initialized: true })
  },

  clear: () => {
    useLikesStore.getState().clear()
    usePlayerStore.getState().clearQueue()
    set({ user: null, switching: false })
  },
}))
