/** 最近搜索：本地 localStorage 存 10 条，可清空（设计 §2.1） */

const KEY = 'csplayer:prefs:recentSearch'
const MAX = 10

export function loadRecentSearch(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is string => typeof k === 'string' && k.length > 0).slice(0, MAX)
  } catch {
    return []
  }
}

export function pushRecentSearch(kw: string): string[] {
  const key = kw.trim()
  if (!key) return loadRecentSearch()
  const list = [key, ...loadRecentSearch().filter((k) => k !== key)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
  return list
}

export function clearRecentSearch(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
