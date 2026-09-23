export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTime(sec: number): string {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function artistNames(artists: { name: string }[] | undefined | null): string {
  return (artists ?? []).map((a) => a.name).join(' / ')
}
