import { useAuthStore } from '../../stores/authStore'
import { useLikesStore } from '../../stores/likesStore'
import { useQrLogin } from '../../hooks/useQrLogin'
import { Loading } from '../common/Ui'
import type { UserProfile } from '../../types'

export function SwitchAccountModal({ onClose }: { onClose: () => void }) {
  const loginSuccess = useAuthStore((s) => s.loginSuccess)

  const onSuccess = (user: UserProfile) => {
    // 扫新码成功后替换会话，不先 logout
    loginSuccess(user)
    void useLikesStore.getState().fetchIds()
    onClose()
  }

  const { qrimg, status, error, refresh } = useQrLogin(onSuccess, { fresh: true })

  const statusText =
    status === 'loading'
      ? '正在获取二维码…'
      : status === 'waiting'
        ? '请使用网易云音乐 App 扫码切换账号'
        : status === 'scanned'
          ? '已扫码，请在手机上确认'
          : status === 'expired'
            ? '二维码已过期'
            : status === 'rate_limited'
              ? '请求过于频繁，稍后自动重试'
              : '登录成功'

  const showRefresh =
    status === 'expired' || (!!error && status !== 'waiting' && status !== 'scanned')

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">切换账号</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">扫码成功后原地替换当前会话</p>

        <div className="mx-auto mt-5 flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
          {status === 'loading' ? (
            <Loading text="" />
          ) : qrimg && status !== 'expired' ? (
            <img src={qrimg} alt="切换账号二维码" className="h-full w-full object-contain" />
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
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm text-neutral-950 hover:bg-emerald-400"
          >
            刷新二维码
          </button>
        )}
      </div>
    </div>
  )
}
