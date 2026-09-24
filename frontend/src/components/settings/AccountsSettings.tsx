import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import {
  clearAccounts,
  loadAccounts,
  sortAccountsByRecent,
  type SavedAccount,
} from '../../utils/cred'
import { SettingRow, SettingSection } from './controls'

function formatUsedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return '—'
  }
}

/**
 * 设置 · 「账号凭证」卡（v0.1.5 §5.3）：本机凭证库的查看 / 单个移除 / 一键清空。
 * 「缓存 → 清除本地数据」只清 csplayer: 前缀偏好/队列，不动这里的凭证库（§3.7）。
 */
export function AccountsSettings() {
  const user = useAuthStore((s) => s.user)
  const removeSavedAccount = useAuthStore((s) => s.removeSavedAccount)
  const logout = useAuthStore((s) => s.logout)

  const [rows, setRows] = useState<SavedAccount[]>(() =>
    sortAccountsByRecent(loadAccounts().accounts),
  )
  const [activeId, setActiveId] = useState<number | null>(() => loadAccounts().activeId)

  const reload = () => {
    const data = loadAccounts()
    setRows(sortAccountsByRecent(data.accounts))
    setActiveId(data.activeId)
  }

  const onRemove = async (account: SavedAccount) => {
    const isCurrent = account.userId === user?.userId || account.userId === activeId
    if (isCurrent) {
      // 移除当前账号 = 彻底退出（吊销凭证），二次确认
      if (!window.confirm('这是当前使用中的账号：移除将退出登录并吊销其凭证，下次需重新扫码。继续？'))
        return
      await removeSavedAccount(account.userId) // 等价 logout()，页面随登录态跳转登录页
      return
    }
    await removeSavedAccount(account.userId) // 纯本地删除，不吊销
    reload()
  }

  const onClearAll = async () => {
    if (
      !window.confirm(
        '将移除全部已保存账号的凭证：当前账号退出登录并吊销凭证，其余仅删除本机记录。不可恢复，继续？',
      )
    )
      return
    await logout() // 吊销当前账号 + 移除当前条目 + 清会话/队列
    clearAccounts() // 其余条目本地删除
    reload()
  }

  return (
    <SettingSection id="accounts" title="账号凭证" desc="本机保存的登录凭证管理">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 text-xs text-neutral-500">
          暂无已保存账号；扫码登录后凭证会保存在本机，切换账号免扫码。
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((account) => {
            const isCurrent = account.userId === user?.userId || account.userId === activeId
            return (
              <div
                key={account.userId}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3"
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
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-neutral-100">
                      {account.nickname || '未命名账号'}
                    </span>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent-soft">
                        使用中
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    UID:{account.userId > 0 ? account.userId : '未知'} · 上次使用{' '}
                    {formatUsedAt(account.lastUsedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onRemove(account)}
                  className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:border-red-500/40 hover:text-red-400"
                >
                  移除
                </button>
              </div>
            )
          })}
        </div>
      )}

      <SettingRow
        label="清除全部凭证"
        hint="移除所有已保存账号（当前账号退出登录并吊销凭证），下次启动需重新扫码"
      >
        <button
          type="button"
          onClick={() => void onClearAll()}
          disabled={rows.length === 0}
          className="rounded-full border border-red-500/40 bg-neutral-900 px-4 py-1.5 text-xs text-red-400 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          清除全部凭证
        </button>
      </SettingRow>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-xs leading-5 text-neutral-500">
        凭证保存在本机浏览器（localStorage），不上传后端；移除后需重新扫码。
        「缓存 → 清除本地数据」只清偏好与队列快照，<span className="text-neutral-400">不影响这里的凭证</span>
        ；凭证的清除入口只有本卡与「退出登录」。
      </div>
    </SettingSection>
  )
}
