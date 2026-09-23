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

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
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
