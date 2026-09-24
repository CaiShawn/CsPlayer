import { useEffect, useRef } from 'react'
import { useContextMenuStore } from '../../stores/contextMenuStore'
import { usePlayerStore } from '../../stores/playerStore'
import { artistNames } from '../../utils/format'

export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playing = usePlayerStore((s) => s.playing)
  const queueVisible = usePlayerStore((s) => s.queueVisible)
  const toggleQueue = usePlayerStore((s) => s.toggleQueue)
  const setQueueVisible = usePlayerStore((s) => s.setQueueVisible)
  const jumpTo = usePlayerStore((s) => s.jumpTo)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const clearQueue = usePlayerStore((s) => s.clearQueue)
  const panelRef = useRef<HTMLDivElement>(null)

  /* 面板外 pointerdown 即收起 + Esc 收起（设计 §4.1 b）：
   *  - 命中在面板内 / 右键菜单根内则不收起（菜单点击不误收起）；
   *  - 不加遮罩，不拦截页面交互；副作用（点歌曲行顺带收起）为可接受的抽屉语义。 */
  useEffect(() => {
    if (!queueVisible) return
    const onDown = (e: PointerEvent) => {
      // 仅左键收起：右键（弹右键菜单）不影响队列
      if (e.button !== 0) return
      const t = e.target as HTMLElement | null
      // 面板内 / 右键菜单内 / 队列开关按钮：不在此收起（开关按钮交给自身 click 去 toggle，
      // 否则 pointerdown 先关、click 又开，点按钮无效）
      if (
        t &&
        (panelRef.current?.contains(t) ||
          t.closest('[data-cs-context-menu]') ||
          t.closest('[data-cs-queue-toggle]'))
      )
        return
      setQueueVisible(false)
    }
    // Esc：capture 阶段先于右键菜单的关闭逻辑读到菜单状态，菜单开着时 Esc 先关菜单
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (useContextMenuStore.getState().open) return
      setQueueVisible(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [queueVisible, setQueueVisible])

  if (!queueVisible) return null

  return (
    <div
      ref={panelRef}
      className="fixed bottom-20 right-0 top-16 z-50 flex w-80 flex-col border-l border-neutral-800 bg-[var(--surface-panel)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="text-sm text-neutral-200">播放队列（{queue.length}）</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearQueue}
            className="text-xs text-neutral-500 hover:text-neutral-200"
          >
            清空
          </button>
          <button
            type="button"
            onClick={toggleQueue}
            className="text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">队列为空</div>
        )}
        {queue.map((song, index) => (
          <div
            key={`${song.id}-${index}`}
            onDoubleClick={() => jumpTo(index)}
            onContextMenu={(e) =>
              useContextMenuStore.getState().openForEvent(e, {
                kind: 'song',
                song,
                queueIndex: index,
              })
            }
            className={`group flex items-center gap-2 px-4 py-[var(--space-row-y)] text-sm ${
              index === currentIndex
                ? 'bg-accent/10 text-accent-soft'
                : 'text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            <span className="w-5 shrink-0 text-xs text-neutral-600">
              {index === currentIndex && playing ? '▶' : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{song.name}</div>
              <div className="truncate text-xs text-neutral-500">
                {artistNames(song.artists)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeFromQueue(index)
              }}
              className="hidden text-xs text-neutral-500 hover:text-red-400 group-hover:block"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
