/**
 * 多账号凭证库（网易云 cookie）— v0.1.5 §4.1
 *
 * 存 localStorage（key: csplayer.ncm.accounts，envelope v:2），后端零落盘。
 * 登录过的每个账号保留一份凭证（上限 10，按 lastUsedAt LRU 淘汰且永不淘汰 active），
 * 切回旧账号一键 restore、免重新扫码。
 *
 * v0.1.4 单凭证键（csplayer.ncm.cred）在首次加载时一次性迁移为单条目账号库
 * （userId 暂缺 0，首次 restore 成功后由 upsertAccount 判重合并、回填真实身份）。
 *
 * 读写全部 try/catch：storage 被禁用或内容损坏时静默降级为「需扫码」，不抛错。
 */

export type NcmCred = Record<string, string>

export interface SavedAccount {
  /** 账号主键（v1 迁移条目暂缺为 0，restore 成功后回填） */
  userId: number
  nickname: string
  avatarUrl: string
  savedAt: number
  lastUsedAt: number
  cred: NcmCred
}

/** 账号展示信息（UserProfile 的公共子集，入库所需字段） */
export interface AccountBrief {
  userId: number
  nickname: string
  avatarUrl: string
}

export interface AccountsData {
  /**
   * 当前 active 账号 userId；null = 无。
   * 移除 / 退出 active 后不自动顶替（§3.5：避免「打开变成了另一个人」），
   * 由用户在登录页 / 切换弹窗点选后重新置为 active。
   */
  activeId: number | null
  accounts: SavedAccount[]
}

const ACCOUNTS_KEY = 'csplayer.ncm.accounts'
/** v0.1.4 单凭证键，仅用于一次性迁移 */
const LEGACY_CRED_KEY = 'csplayer.ncm.cred'
const ACCOUNTS_VERSION = 2
const MAX_ACCOUNTS = 10

interface AccountsEnvelope {
  v: number
  activeId: number | null
  accounts: SavedAccount[]
}

/* ---------------------------------------------------------------------------
 * 内部工具
 * ------------------------------------------------------------------------ */

function isValidCred(cred: unknown): cred is NcmCred {
  return (
    !!cred &&
    typeof cred === 'object' &&
    typeof (cred as NcmCred).MUSIC_U === 'string' &&
    !!(cred as NcmCred).MUSIC_U
  )
}

/** 单条目清洗：MUSIC_U 非法（缺失 / 非字符串 / 空）整条丢弃（沿用 v0.1.4 规则） */
function normalizeAccount(raw: unknown): SavedAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Partial<SavedAccount>
  if (!isValidCred(a.cred)) return null
  const now = Date.now()
  return {
    userId: typeof a.userId === 'number' && Number.isFinite(a.userId) ? a.userId : 0,
    nickname: typeof a.nickname === 'string' ? a.nickname : '',
    avatarUrl: typeof a.avatarUrl === 'string' ? a.avatarUrl : '',
    savedAt: typeof a.savedAt === 'number' ? a.savedAt : now,
    lastUsedAt: typeof a.lastUsedAt === 'number' ? a.lastUsedAt : now,
    cred: { ...(a.cred as NcmCred) },
  }
}

function emptyEnvelope(): AccountsEnvelope {
  return { v: ACCOUNTS_VERSION, activeId: null, accounts: [] }
}

/** 读库；缺失 / 版本不符 / 损坏一律回 null（调用方回落空库） */
function readEnvelope(): AccountsEnvelope | null {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountsEnvelope> | null
    if (!parsed || parsed.v !== ACCOUNTS_VERSION || !Array.isArray(parsed.accounts)) return null
    const accounts = parsed.accounts
      .map(normalizeAccount)
      .filter((a): a is SavedAccount => !!a)
    const activeId =
      typeof parsed.activeId === 'number' && Number.isFinite(parsed.activeId)
        ? parsed.activeId
        : null
    return { v: ACCOUNTS_VERSION, activeId, accounts }
  } catch {
    return null
  }
}

function writeEnvelope(env: AccountsEnvelope): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(env))
  } catch {
    // ignore
  }
}

/** LRU 裁剪：超上限按 lastUsedAt 淘汰最久未用者，永不淘汰 active（§4.1） */
function trimAccounts(env: AccountsEnvelope): void {
  while (env.accounts.length > MAX_ACCOUNTS) {
    let victim: SavedAccount | null = null
    for (const a of env.accounts) {
      if (a.userId === env.activeId) continue
      if (!victim || a.lastUsedAt < victim.lastUsedAt) victim = a
    }
    if (!victim) break
    env.accounts = env.accounts.filter((a) => a !== victim)
  }
}

/**
 * v1 → v2 一次性迁移（§3.7）：检测 csplayer.ncm.cred → 包成单条目（userId 暂缺 0）
 * 写入新键 → 删旧键。任一步失败静默（下次加载再迁）。
 * 若新库已有内容（迁移残留重跑），只判重合并条目、不抢占 active。
 */
function migrateLegacy(env: AccountsEnvelope | null): AccountsEnvelope | null {
  try {
    const raw = localStorage.getItem(LEGACY_CRED_KEY)
    if (!raw) return env
    const parsed = JSON.parse(raw) as { cred?: unknown } | null
    const cred = parsed?.cred
    if (!isValidCred(cred)) {
      localStorage.removeItem(LEGACY_CRED_KEY)
      return env
    }
    const now = Date.now()
    const fresh = env === null
    const out = env ?? emptyEnvelope()
    const dup = out.accounts.find((a) => a.cred.MUSIC_U === cred.MUSIC_U)
    out.accounts = out.accounts.filter((a) => a !== dup)
    out.accounts.push({
      userId: dup?.userId ?? 0,
      nickname: dup?.nickname ?? '',
      avatarUrl: dup?.avatarUrl ?? '',
      savedAt: dup?.savedAt ?? now,
      lastUsedAt: now,
      cred: { ...cred },
    })
    // 迁移条目即 v0.1.4 的 active 凭证；仅在全新空库时置为 active
    if (fresh) out.activeId = out.accounts[out.accounts.length - 1].userId
    trimAccounts(out)
    writeEnvelope(out)
    localStorage.removeItem(LEGACY_CRED_KEY)
    return out
  } catch {
    return env
  }
}

/* ---------------------------------------------------------------------------
 * 公开 API（多账号凭证库；v0.1.4 单凭证 loadCred/saveCred/clearCred 已退役）
 * ------------------------------------------------------------------------ */

/** 读取全部账号（含 v1→v2 迁移）；损坏 / 被禁 storage 静默回空库 */
export function loadAccounts(): AccountsData {
  const env = migrateLegacy(readEnvelope())
  if (!env) return { activeId: null, accounts: [] }
  return { activeId: env.activeId, accounts: env.accounts }
}

/** 读取指定账号；缺省 = active 账号；缺失 / 无效返回 null */
export function loadAccount(userId?: number): SavedAccount | null {
  const { activeId, accounts } = loadAccounts()
  const id = userId === undefined ? activeId : userId
  if (id === undefined || id === null) return null
  return accounts.find((a) => a.userId === id) ?? null
}

/**
 * 入库（扫码成功 / restore 成功回填身份）：
 * 判重（userId 相等或 MUSIC_U 全等 → 同一账号覆盖更新）→ 置 active →
 * 刷新 lastUsedAt → LRU 裁剪。无效凭证直接丢弃，返回 null。
 */
export function upsertAccount(
  user: AccountBrief,
  cred: NcmCred | null | undefined,
): SavedAccount | null {
  if (!user || !isValidCred(cred)) return null
  try {
    const env = migrateLegacy(readEnvelope()) ?? emptyEnvelope()
    const now = Date.now()
    const userId = Number.isFinite(user.userId) ? user.userId : 0
    const byId = userId > 0 ? (env.accounts.find((a) => a.userId === userId) ?? null) : null
    const byCred = env.accounts.find((a) => a.cred.MUSIC_U === cred.MUSIC_U) ?? null
    const existing = byId ?? byCred
    const entry: SavedAccount = {
      userId,
      nickname: user.nickname || existing?.nickname || '',
      avatarUrl: user.avatarUrl || existing?.avatarUrl || '',
      savedAt: existing?.savedAt ?? now,
      lastUsedAt: now,
      cred: { ...cred },
    }
    // 同时命中 userId 与 MUSIC_U 两个旧条目时一并合并，避免重复
    env.accounts = env.accounts.filter((a) => a !== byId && a !== byCred)
    env.accounts.push(entry)
    env.activeId = entry.userId
    trimAccounts(env)
    writeEnvelope(env)
    return entry
  } catch {
    return null
  }
}

/** restore 成功后刷新 lastUsedAt / activeId（不改凭证内容） */
export function touchAccount(userId: number): void {
  try {
    const env = readEnvelope()
    if (!env) return
    const acc = env.accounts.find((a) => a.userId === userId)
    if (!acc) return
    acc.lastUsedAt = Date.now()
    env.activeId = userId
    writeEnvelope(env)
  } catch {
    // ignore
  }
}

/** 移除单个账号（纯本地删除）；移除的是 active 时不自动顶替 */
export function removeAccount(userId: number): void {
  try {
    const env = readEnvelope()
    if (!env) return
    const rest = env.accounts.filter((a) => a.userId !== userId)
    if (rest.length === env.accounts.length) return
    env.accounts = rest
    if (env.activeId === userId || !rest.some((a) => a.userId === env.activeId)) {
      env.activeId = null
    }
    trimAccounts(env)
    writeEnvelope(env)
  } catch {
    // ignore
  }
}

/** 清空凭证库（含未迁移的 v1 残留键） */
export function clearAccounts(): void {
  try {
    localStorage.removeItem(ACCOUNTS_KEY)
    localStorage.removeItem(LEGACY_CRED_KEY)
  } catch {
    // ignore
  }
}

/** 展示用：按 lastUsedAt 倒序（最近使用在前），不改动库内顺序 */
export function sortAccountsByRecent(accounts: SavedAccount[]): SavedAccount[] {
  return [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}
