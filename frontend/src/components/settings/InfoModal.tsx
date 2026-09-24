import { useEffect, useState, type ReactNode } from 'react'

/**
 * 说明入口（i 字圆圈按钮）：点击弹出解决方案 / 长说明弹窗。
 * 用于设置行里放不下的帮助文案（如「刷新后自动播放」的浏览器侧放行步骤）。
 */
export function InfoButton({
  title,
  label = '查看说明',
  children,
}: {
  title: string
  label?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen(true)}
        className="mr-2 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-[11px] italic leading-none text-neutral-400 transition-colors hover:border-accent/60 hover:text-accent-soft"
      >
        i
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-xs leading-5 text-neutral-400">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
