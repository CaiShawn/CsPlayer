import { create } from 'zustand'
import type { ContextTarget } from '../contextMenu/types'

interface ContextMenuState {
  open: boolean
  /** 锚点坐标（视口坐标系，浮层 fixed 定位） */
  x: number
  y: number
  target: ContextTarget | null
  /** 锁定（如设置页拖拽排序期间）：锁定时不弹菜单 */
  locked: boolean
  openAt: (x: number, y: number, target: ContextTarget) => void
  /** 右键入口：阻止浏览器默认菜单（输入框内除外）并弹出 */
  openForEvent: (e: { preventDefault: () => void; clientX: number; clientY: number; target: EventTarget | null }, target: ContextTarget) => void
  close: () => void
  setLocked: (v: boolean) => void
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/** 输入类元素内不劫持（保留浏览器默认右键菜单 / 粘贴） */
export function isEditableTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest(EDITABLE_SELECTOR)
}

export const useContextMenuStore = create<ContextMenuState>((set, get) => ({
  open: false,
  x: 0,
  y: 0,
  target: null,
  locked: false,

  openAt: (x, y, target) => {
    if (get().locked) return
    set({ open: true, x, y, target })
  },

  openForEvent: (e, target) => {
    if (get().locked) return
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    get().openAt(e.clientX, e.clientY, target)
  },

  close: () => set({ open: false, target: null }),
  setLocked: (v) => set({ locked: v }),
}))
