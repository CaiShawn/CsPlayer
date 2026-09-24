import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useQrLogin } from '../hooks/useQrLogin'
import { loadAccounts, sortAccountsByRecent, type SavedAccount } from '../utils/cred'
import { Loading } from '../components/common/Ui'
import type { UserProfile } from '../types'

export function LoginPage() {
  const navigate = useNavigate()
  const loginSuccess = useAuthStore((s) => s.loginSuccess)
  const switchAccount = useAuthStore((s) => s.switchAccount)

  const onSuccess = useRef((user: UserProfile) => {
    loginSuccess(user)
    navigate('/home', { replace: true })
  })
  // keep latest handlers
  onSuccess.current = (user: UserProfile) => {
    loginSuccess(user)
    navigate('/home', { replace: true })
  }

  const { qrimg, status, error, refresh } = useQrLogin((user) => onSuccess.current(user))

  /* ------------------------------------------------------------------
   * 快速登录（v0.1.5）：已保存账号一键恢复、免扫码；无账号时与 v0.1.4 完全一致
   * ---------------------------------------------------------------- */
  const [accounts, setAccounts] = useState<SavedAccount[]>(() =>
    sortAccountsByRecent(loadAccounts().accounts),
  )
  const [busyId, setBusyId] = useState<number | null>(null)
  const [quickError, setQuickError] = useState('')

  const onQuickLogin = async (account: SavedAccount) => {
    if (busyId !== null) return
    setBusyId(account.userId)
    setQuickError('')
    const result = await switchAccount(account.userId)
    if (result === 'ok') {
      navigate('/home', { replace: true })
      return
    }
    setBusyId(null)
    if (result === 'expired') {
      // 目标凭证过期：该条目即时移除（store 已删），二维码区保持可用
      setAccounts(sortAccountsByRecent(loadAccounts().accounts))
      setQuickError('登录已失效，请重新扫码')
    } else {
      setQuickError('切换失败，请重试')
    }
  }

  useEffect(() => {
    if (useAuthStore.getState().user) {
      navigate('/home', { replace: true })
    }
  }, [navigate])

  const statusText =
    status === 'loading'
      ? '正在获取二维码…'
      : status === 'waiting'
        ? '请使用网易云音乐 App 扫码登录'
        : status === 'scanned'
          ? '已扫码，请在手机上确认'
          : status === 'expired'
            ? '二维码已过期'
            : status === 'rate_limited'
              ? '请求过于频繁，稍后自动重试'
              : '登录成功'

  const showRefresh = status === 'expired' || (!!error && status !== 'waiting' && status !== 'scanned')

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center">
        <h1 className="text-xl font-semibold text-neutral-100">扫码登录</h1>
        <p className="mt-1 text-xs text-neutral-500">网易云音乐账号 · 仅用于本地播放</p>

        {accounts.length > 0 && (
          <div className="mt-6">
            <div className="text-left text-xs text-neutral-500">快速登录</div>
            <div className="mt-2 space-y-1">
              {accounts.map((account) => (
                <button
                  key={account.userId}
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void onQuickLogin(account)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-neutral-800/60 disabled:opacity-60"
                >
                  {account.avatarUrl ? (
                    <img
                      src={account.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-500">
                      ?
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-neutral-100">
                      {account.nickname || '未命名账号'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      UID:{account.userId > 0 ? account.userId : '未知'}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {busyId === account.userId ? '登录中…' : '登录'}
                  </span>
                </button>
              ))}
            </div>
            {quickError && <p className="mt-2 text-left text-xs text-red-400">{quickError}</p>}
            <div className="mt-6 flex items-center gap-3 text-[10px] text-neutral-600">
              <span className="h-px flex-1 bg-neutral-800" />
              或扫码登录
              <span className="h-px flex-1 bg-neutral-800" />
            </div>
          </div>
        )}

        <div className="mx-auto mt-6 flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
          {status === 'loading' ? (
            <Loading text="" />
          ) : qrimg && status !== 'expired' ? (
            <img src={qrimg} alt="登录二维码" className="h-full w-full object-contain" />
          ) : (
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              点击刷新二维码
            </button>
          )}
        </div>

        <p className="mt-4 text-sm text-neutral-300">{statusText}</p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        {showRefresh && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm text-neutral-950 hover:bg-accent-hover"
          >
            刷新二维码
          </button>
        )}

        <p className="mt-8 text-[10px] leading-4 text-neutral-600">
          本项目仅供学习使用，请尊重版权，支持正版音乐。
        </p>
      </div>
    </div>
  )
}
