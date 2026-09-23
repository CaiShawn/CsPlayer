import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useQrLogin } from '../hooks/useQrLogin'
import { Loading } from '../components/common/Ui'
import type { UserProfile } from '../types'

export function LoginPage() {
  const navigate = useNavigate()
  const loginSuccess = useAuthStore((s) => s.loginSuccess)

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
