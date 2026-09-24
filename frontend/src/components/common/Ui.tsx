import { useEffect, useRef } from 'react'

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-neutral-400">{text}</div>
  )
}

export function Empty({ text = '暂无数据' }: { text?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-neutral-500">{text}</div>
  )
}

export function LoadError({
  message = '加载失败',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm">
      <div className="text-red-400">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-neutral-600 px-4 py-1.5 text-neutral-200 hover:bg-neutral-800"
        >
          重试
        </button>
      )}
    </div>
  )
}

/** 内容区顶部错误条：SWR 刷新失败时保留缓存内容 + 提示 + 重试（设计 §6） */
export function ErrorBar({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full border border-red-400/40 px-3 py-0.5 text-xs hover:bg-red-500/20"
        >
          重试
        </button>
      )}
    </div>
  )
}

/** 歌曲表骨架屏：冷加载首屏用（SWR，设计 §4.3 a） */
export function SongSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-800">
      <div className="h-9 border-b border-neutral-800 bg-neutral-900/80" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-neutral-900 px-3 py-4">
          <div className="h-3 w-6 shrink-0 animate-pulse rounded bg-neutral-800" />
          <div className="h-3 flex-[3] animate-pulse rounded bg-neutral-800" />
          <div className="h-3 flex-1 animate-pulse rounded bg-neutral-800" />
          <div className="hidden h-3 flex-1 animate-pulse rounded bg-neutral-800 md:block" />
          <div className="h-3 w-8 shrink-0 animate-pulse rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  )
}

/** 卡片网格骨架屏：冷加载首屏用（SWR，设计 §4.3 a） */
export function CardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-cover)] p-3">
          <div className="aspect-square w-full animate-pulse rounded-[var(--radius-cover)] bg-neutral-800" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-neutral-800" />
          <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  )
}

/** 轻提示：3s 后自动消失（可点 ✕ 提前关闭） */
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  // 用 ref 持有最新 onClose，避免父组件重渲染（回调身份变化）重置计时器
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => onCloseRef.current(), 3000)
    return () => window.clearTimeout(t)
  }, [message])

  if (!message) return null
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-100 shadow-lg">
      {message}
      <button className="ml-3 text-neutral-400 hover:text-neutral-200" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
