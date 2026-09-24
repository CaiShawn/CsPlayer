import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useQrLogin } from '../../hooks/useQrLogin'
import { loadAccounts, sortAccountsByRecent, type SavedAccount } from '../../utils/cred'
import { Loading } from '../common/Ui'
import type { UserProfile } from '../../types'

type RowState = 'idle' | 'switching' | 'expired'

function Avatar({ url, size = 'h-10 w-10' }: { url: string; size?: string }) {
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-500`}
    >
      ?
    </div>
  )
}

/** 扫码新增区（展开时才挂载，沿用 v0.1.4 二维码流程；成功即入库并切换） */
function QrPanel({ onSuccess }: { onSuccess: (user: UserProfile) => void }) {
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
    <div className="mt-4 border-t border-neutral-800 pt-4 text-center">
      <div className="mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
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
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm text-neutral-950 hover:bg-accent-hover"
        >
          刷新二维码
        </button>
      )}
    </div>
  )
}

export function SwitchAccountModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const loginSuccess = useAuthStore((s) => s.loginSuccess)
  const switchAccount = useAuthStore((s) => s.switchAccount)
  const removeSavedAccount = useAuthStore((s) => s.removeSavedAccount)

  const [accounts, setAccounts] = useState<SavedAccount[]>(() =>
    sortAccountsByRecent(loadAccounts().accounts),
  )
  const [rowState, setRowState] = useState<Record<number, RowState>>({})
  const [notice, setNotice] = useState('')
  const [qrOpen, setQrOpen] = useState(() => loadAccounts().accounts.length === 0)

  const currentId = user?.userId
  const switching = Object.values(rowState).includes('switching')

  const reload = () => setAccounts(sortAccountsByRecent(loadAccounts().accounts))

  /** 点击已保存账号：一键切换（免扫码，restore 即恢复） */
  const onPick = async (account: SavedAccount) => {
    if (switching) return
    setNotice('')
    setRowState((s) => ({ ...s, [account.userId]: 'switching' }))
    const result = await switchAccount(account.userId)
    if (result === 'ok') {
      // 登录成功后自动刷新页面（验收反馈）：整页刷新，当前页内容与新账号保持一致
      window.location.reload()
      return
    }
    if (result === 'expired') {
      // 条目已在凭证库移除；弹窗内该条目标「登录已失效」并引导扫码
      setRowState((s) => ({ ...s, [account.userId]: 'expired' }))
      setNotice('该账号登录已失效，请重新扫码')
      setQrOpen(true)
    } else {
      setRowState((s) => ({ ...s, [account.userId]: 'idle' }))
      setNotice('切换失败，请重试')
    }
  }

  /** 移除：纯本地删除、不吊销；移除当前账号 = 彻底退出（等价 logout，二次确认） */
  const onRemove = async (
    e: React.MouseEvent<HTMLButtonElement>,
    account: SavedAccount,
  ) => {
    e.stopPropagation()
    if (switching) return
    const isCurrent = account.userId === currentId || account.userId === loadAccounts().activeId
    if (isCurrent) {
      if (!window.confirm('移除当前账号将退出登录并吊销其凭证，下次需重新扫码。继续？')) return
      await removeSavedAccount(account.userId)
      onClose()
      navigate('/login', { replace: true })
      return
    }
    await removeSavedAccount(account.userId)
    reload()
  }

  /** 扫码成功：凭证已入库并置 active，这里原地替换会话（不先 logout）后自动刷新页面 */
  const onScanned = (scanned: UserProfile) => {
    loginSuccess(scanned)
    // 登录成功后自动刷新页面（验收反馈）
    window.location.reload()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
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
        <p className="mt-1 text-xs text-neutral-500">点头像行一键切换，无需重新扫码</p>

        {/* 已保存账号 */}
        {accounts.length > 0 && (
          <div className="mt-4 max-h-64 space-y-1 overflow-y-auto pr-1">
            {accounts.map((account) => {
              const state: RowState = rowState[account.userId] ?? 'idle'
              const isCurrent = account.userId === currentId
              const isSwitching = state === 'switching'
              const disabled = switching || isCurrent || state === 'expired'
              return (
                <div
                  key={account.userId}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-disabled={disabled}
                  onClick={() => !disabled && void onPick(account)}
                  onKeyDown={(e) => {
                    if (disabled) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void onPick(account)
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 transition-colors ${
                    disabled
                      ? 'opacity-70'
                      : 'cursor-pointer hover:border-accent/50 hover:bg-neutral-800/60'
                  }`}
                >
                  <Avatar url={account.avatarUrl} />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-neutral-100">
                      {account.nickname || '未命名账号'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      UID:{account.userId > 0 ? account.userId : '未知'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {state === 'expired' ? (
                      <span className="text-xs text-red-400">登录已失效</span>
                    ) : isSwitching ? (
                      <span className="text-xs text-accent-soft">切换中…</span>
                    ) : isCurrent ? (
                      <span className="text-xs text-accent-soft">使用中</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => void onRemove(e, account)}
                      disabled={switching}
                      className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-red-400 disabled:opacity-50"
                    >
                      移除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {notice && <p className="mt-3 text-xs text-red-400">{notice}</p>}

        {/* 扫码新增 */}
        <button
          type="button"
          onClick={() => setQrOpen((v) => !v)}
          className="mt-4 w-full rounded-xl border border-dashed border-neutral-700 py-2 text-sm text-neutral-300 hover:border-accent/50 hover:text-accent-soft"
        >
          {qrOpen ? '− 收起扫码登录' : '+ 扫码登录其他账号'}
        </button>
        {qrOpen && <QrPanel onSuccess={onScanned} />}

        <p className="mt-4 text-center text-[10px] leading-4 text-neutral-600">
          凭证保存在本机浏览器（localStorage），不上传后端，可随时移除
        </p>
      </div>
    </div>
  )
}
