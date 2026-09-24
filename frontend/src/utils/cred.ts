/**
 * 登录凭证（网易云 cookie）本地保管 — v0.1.4 §4.1
 *
 * 存 localStorage（key: csplayer.ncm.cred），后端零落盘；重启后端后由前端
 * POST /api/auth/restore 静默重建会话，免重新扫码。
 * 读写全部 try/catch：storage 被禁用或内容损坏时静默降级为「需扫码」。
 */

export type NcmCred = Record<string, string>

const CRED_KEY = 'csplayer.ncm.cred'
const CRED_VERSION = 1

/** 读取凭证；缺失 / 损坏 / 无效（无 MUSIC_U）一律返回 null */
export function loadCred(): NcmCred | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cred?: unknown } | null
    const cred = parsed?.cred as NcmCred | undefined
    if (!cred || typeof cred !== 'object') return null
    if (typeof cred.MUSIC_U !== 'string' || !cred.MUSIC_U) return null
    return cred
  } catch {
    return null
  }
}

/** 保存凭证（扫码登录成功时覆盖写入，单凭证模型） */
export function saveCred(cred: NcmCred | null | undefined): void {
  try {
    if (!cred || typeof cred !== 'object') return
    if (typeof cred.MUSIC_U !== 'string' || !cred.MUSIC_U) return
    localStorage.setItem(CRED_KEY, JSON.stringify({ v: CRED_VERSION, cred }))
  } catch {
    // ignore
  }
}

/** 清除凭证（登出 / 恢复会话失败） */
export function clearCred(): void {
  try {
    localStorage.removeItem(CRED_KEY)
  } catch {
    // ignore
  }
}
