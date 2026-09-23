import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { labelOf, resolveActions, type ContextAction } from '../../contextMenu/actions'
import { useContextMenuStore } from '../../stores/contextMenuStore'
import { useLikesStore } from '../../stores/likesStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface Entry {
  id: string
  /** 缺省 = 固定项「自定义此菜单…」 */
  action?: ContextAction
}

const MARGIN = 8

/**
 * 通用右键菜单浮层（portal 到 body，全站唯一实例）。
 * 视口边缘自动翻转；Esc / 点击外部 / 滚动关闭；方向键 + Enter 可操作。
 */
export function ContextMenu() {
  const { open, x, y, target, close } = useContextMenuStore()
  const prefs = useSettingsStore((s) => s.prefs.contextMenu)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [active, setActive] = useState(0)

  const actions = useMemo(
    () => (target ? resolveActions(target.kind, prefs[target.kind], target) : []),
    [target, prefs],
  )
  const entries: Entry[] = useMemo(
    () => [
      ...actions.map((action) => ({ id: action.id, action })),
      { id: 'customize' },
    ],
    [actions],
  )

  // 打开后回到首项；焦点进浮层以接收方向键
  useEffect(() => {
    if (!open) return
    setActive(0)
    ref.current?.focus()
  }, [open, target])

  // 视口边缘自动翻转 + 收拢在可视区内
  useLayoutEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - rect.width - MARGIN))
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - rect.height - MARGIN))
    setPos({ left, top })
  }, [open, x, y, entries.length])

  const runEntry = (index: number) => {
    const entry = entries[index]
    if (!entry || !target) return
    if (entry.action) {
      void entry.action.run({
        target,
        navigate,
        close,
        toast: (msg) => useLikesStore.getState().setToast(msg),
      })
      return
    }
    close()
    navigate('/settings?group=contextMenu')
  }

  // Esc / 点击外部 / 滚动 / 缩放关闭；方向键 + Enter 操作
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % entries.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + entries.length) % entries.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runEntry(active)
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onScrollOrResize = () => close()
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  })

  if (!open || !target) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[100] min-w-[200px] max-w-[280px] rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl outline-none"
    >
      {entries.length === 1 && (
        <div className="px-3 py-2 text-xs text-neutral-500">已隐藏全部条目</div>
      )}
      {entries.map((entry, index) => {
        const isCustomize = !entry.action
        const danger = entry.action?.danger
        return (
          <Fragment key={entry.id}>
            {isCustomize && actions.length > 0 && (
              <div className="my-1 border-t border-neutral-800" />
            )}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onMouseEnter={() => setActive(index)}
              onClick={() => runEntry(index)}
              className={[
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                index === active ? 'bg-neutral-800' : '',
                danger ? 'text-red-400' : isCustomize ? 'text-neutral-400' : 'text-neutral-200',
              ].join(' ')}
            >
              <span
                className={`w-4 shrink-0 text-center text-xs leading-none ${
                  danger ? 'text-red-400/80' : 'text-neutral-500'
                }`}
              >
                {entry.action ? entry.action.icon : '⚙'}
              </span>
              <span className="truncate">
                {entry.action ? labelOf(entry.action, target) : '自定义此菜单…'}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>,
    document.body,
  )
}
