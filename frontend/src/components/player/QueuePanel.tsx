import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { SongSummary } from '../../types'
import { useContextMenuStore } from '../../stores/contextMenuStore'
import { usePlayerStore } from '../../stores/playerStore'
import { artistNames } from '../../utils/format'

/* ---------------------------------------------------------------------------
 * 播放队列面板
 *   C1 性能：行 memo 化 + 稳定 key（id#重复序号）——切歌只重渲染旧/新两行，
 *        删行/拖拽不重建整列 DOM；
 *   B1 跟随滚动：切歌 / 打开面板时把当前曲滚入视野（仅在不可见时滚动）；
 *   A2 来源标签：标题下显示队列来自哪个歌单/专辑/页面；
 *   B2 拖拽排序：行可拖拽换位（store.moveInQueue 修正当前曲索引，不重载音频）。
 * ------------------------------------------------------------------------ */

type DropSide = 'top' | 'bottom'

interface QueueRowProps {
  song: SongSummary
  index: number
  isCurrent: boolean
  playing: boolean
  /** 拖拽插入位置指示：'top' = 落在该行上方，'bottom' = 下方 */
  dropSide: DropSide | null
  onJump: (index: number) => void
  onRemove: (index: number) => void
  onRowContextMenu: (e: ReactMouseEvent, song: SongSummary, index: number) => void
  onDragStart: (index: number) => void
  onDragHover: (index: number) => void
  onDropAt: (index: number) => void
  onDragEnd: () => void
}

const QueueRow = memo(function QueueRow({
  song,
  index,
  isCurrent,
  playing,
  dropSide,
  onJump,
  onRemove,
  onRowContextMenu,
  onDragStart,
  onDragHover,
  onDropAt,
  onDragEnd,
}: QueueRowProps) {
  return (
    <div
      data-cs-queue-row={index}
      data-cs-current={isCurrent ? '' : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index)) // Firefox 需要 setData 才启动拖拽
        onDragStart(index)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragHover(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDropAt(index)
      }}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onJump(index)}
      onContextMenu={(e) => onRowContextMenu(e, song, index)}
      className={`group relative flex cursor-grab select-none items-center gap-2 px-4 py-[var(--space-row-y)] text-sm active:cursor-grabbing ${
        isCurrent
          ? 'bg-accent/10 text-accent-soft'
          : 'text-neutral-300 hover:bg-neutral-900'
      }`}
    >
      {/* 拖拽插入位置指示 */}
      {dropSide === 'top' && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
      {dropSide === 'bottom' && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
      <span className="w-5 shrink-0 text-xs text-neutral-600">
        {isCurrent && playing ? '▶' : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{song.name}</div>
        <div className="truncate text-xs text-neutral-500">{artistNames(song.artists)}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(index)
        }}
        className="hidden text-xs text-neutral-500 hover:text-red-400 group-hover:block"
      >
        ✕
      </button>
    </div>
  )
})

export function QueuePanel() {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const queueSource = usePlayerStore((s) => s.queueSource)
  const playing = usePlayerStore((s) => s.playing)
  const queueVisible = usePlayerStore((s) => s.queueVisible)
  const queuePinned = usePlayerStore((s) => s.queuePinned)
  const toggleQueuePinned = usePlayerStore((s) => s.toggleQueuePinned)
  const toggleQueue = usePlayerStore((s) => s.toggleQueue)
  const setQueueVisible = usePlayerStore((s) => s.setQueueVisible)
  const clearQueue = usePlayerStore((s) => s.clearQueue)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // C1：稳定 key（同 id 重复曲目加序号），删行/拖拽不重建整列 DOM
  const rowKeys = useMemo(() => {
    const seen = new Map<number, number>()
    return queue.map((s) => {
      const n = seen.get(s.id) ?? 0
      seen.set(s.id, n + 1)
      return `${s.id}#${n}`
    })
  }, [queue])

  // B2：拖拽状态（ref 供回调读取，state 只驱动指示条重渲染）
  const dragFromRef = useRef<number | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // B1：切歌 / 打开面板时把当前曲滚入视野（已在视野内则不动，避免打断手动滚动）
  useEffect(() => {
    if (!queueVisible) return
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('[data-cs-current]')
    if (!list || !row) return
    const delta = row.getBoundingClientRect().top - list.getBoundingClientRect().top
    if (delta < 0 || delta + row.offsetHeight > list.clientHeight) {
      list.scrollTop += delta - (list.clientHeight - row.offsetHeight) / 2
    }
  }, [queueVisible, currentIndex])

  // 稳定回调（memo 行的 props 不随渲染变化）
  const onJump = useCallback((index: number) => {
    usePlayerStore.getState().jumpTo(index)
  }, [])
  const onRemove = useCallback((index: number) => {
    usePlayerStore.getState().removeFromQueue(index)
  }, [])
  const onRowContextMenu = useCallback(
    (e: ReactMouseEvent, song: SongSummary, index: number) => {
      useContextMenuStore.getState().openForEvent(e, {
        kind: 'song',
        song,
        queueIndex: index,
      })
    },
    [],
  )
  const onDragStart = useCallback((index: number) => {
    dragFromRef.current = index
    setDragFrom(index)
  }, [])
  const onDragHover = useCallback(
    (index: number) => setDragOver((cur) => (cur === index ? cur : index)),
    [],
  )
  const onDropAt = useCallback((index: number) => {
    const from = dragFromRef.current
    dragFromRef.current = null
    setDragFrom(null)
    setDragOver(null)
    if (from != null) usePlayerStore.getState().moveInQueue(from, index)
  }, [])
  const onDragEnd = useCallback(() => {
    dragFromRef.current = null
    setDragFrom(null)
    setDragOver(null)
  }, [])

  const dropSideOf = (index: number): DropSide | null => {
    if (dragFrom == null || dragOver == null || dragFrom === dragOver) return null
    if (index !== dragOver) return null
    // moveInQueue(from, to) = 先删后插：目标位落在 to 索引处
    return dragFrom < dragOver ? 'bottom' : 'top'
  }

  /* 面板外 pointerdown 即收起 + Esc 收起（设计 §4.1 b）：
   *  - 命中在面板内 / 右键菜单根内则不收起（菜单点击不误收起）；
   *  - 不加遮罩，不拦截页面交互；副作用（点歌曲行顺带收起）为可接受的抽屉语义；
   *  - 钉住态（S3）：常驻，外点 / Esc 均不收起。 */
  useEffect(() => {
    if (!queueVisible || queuePinned) return
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
  }, [queueVisible, queuePinned, setQueueVisible])

  if (!queueVisible) return null

  return (
    <div
      ref={panelRef}
      className={
        queuePinned
          ? 'flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950'
          : 'fixed bottom-20 right-0 top-16 z-50 flex w-80 flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl'
      }
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm text-neutral-200">播放队列（{queue.length}）</div>
          {/* A2：队列来源标签 */}
          {queueSource && (
            <div className="mt-0.5 truncate text-xs text-neutral-500">来自 {queueSource}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={toggleQueuePinned}
            title={queuePinned ? '取消钉住（回到抽屉）' : '钉住到右侧（常驻）'}
            className={
              queuePinned
                ? 'text-accent hover:text-accent-soft'
                : 'text-neutral-500 hover:text-neutral-200'
            }
          >
            <IconPin />
          </button>
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
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {queue.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-neutral-500">队列为空</div>
        )}
        {queue.map((song, index) => (
          <QueueRow
            key={rowKeys[index]}
            song={song}
            index={index}
            isCurrent={index === currentIndex}
            playing={playing}
            dropSide={dropSideOf(index)}
            onJump={onJump}
            onRemove={onRemove}
            onRowContextMenu={onRowContextMenu}
            onDragStart={onDragStart}
            onDragHover={onDragHover}
            onDropAt={onDropAt}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  )
}

/** 图钉图标（与细线图标同风格：stroke 1.3 / 16px） */
function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5.5 2.5h5l-.7 4 2.7 2.2v1H3.5v-1L6.2 6.5z" />
      <path d="M8 9.7V13.5" />
    </svg>
  )
}
