import { useState } from 'react'
import {
  actionById,
  displayNameOf,
} from '../../contextMenu/actions'
import type { ContextKind } from '../../contextMenu/types'
import { CONTEXT_KINDS, CONTEXT_KIND_LABEL } from '../../contextMenu/types'
import { useContextMenuStore } from '../../stores/contextMenuStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Segmented, SettingSection, Switch } from './controls'

/**
 * 需要额外说明的条目：在小标题后以 ⓘ 提示（hover 看全文），不再占一整行 hint。
 * 仅保留必要项（复制链接的复制目标易误解）。
 */
const ACTION_HINT: Record<string, string> = {
  copyLink: '复制网易云音乐网页版链接，一键保存到剪贴板。',
}

/**
 * 设置 → 右键菜单：按对象类型勾选显示 / 隐藏、拖拽排序、恢复默认布局。
 * 拖拽期间锁定菜单（不弹出），见 contextMenuStore.setLocked。
 */
export function ContextMenuSettings() {
  const prefs = useSettingsStore((s) => s.prefs.contextMenu)
  const toggleContextAction = useSettingsStore((s) => s.toggleContextAction)
  const moveContextAction = useSettingsStore((s) => s.moveContextAction)
  const resetContextMenu = useSettingsStore((s) => s.resetContextMenu)
  const setLocked = useContextMenuStore((s) => s.setLocked)
  const [kind, setKind] = useState<ContextKind>('song')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const group = prefs[kind]
  const move = (from: number, to: number) => moveContextAction(kind, from, to)

  return (
    <SettingSection
      id="contextMenu"
      title="右键菜单"
      desc="歌曲、专辑、歌单上的右键菜单条目可勾选显隐、拖拽排序，修改立即生效"
    >
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="右键菜单对象类型"
            value={kind}
            onChange={setKind}
            options={CONTEXT_KINDS.map((k) => ({ value: k, label: CONTEXT_KIND_LABEL[k] }))}
          />
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`恢复「${CONTEXT_KIND_LABEL[kind]}」右键菜单的默认布局？`)) {
                resetContextMenu(kind)
              }
            }}
            className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
          >
            恢复默认布局
          </button>
        </div>

        <div className="mt-3 space-y-1">
          {group.order.map((id, index) => {
            const action = actionById(id)
            if (!action) return null
            const visible = !group.hidden.includes(id)
            const label = displayNameOf(action) // 统一为「小图标 + 小标题」单行（与 分享卡片 / 查看来源 一致）
            const hint = ACTION_HINT[id]
            const dragging = dragIndex === index
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDragIndex(index)
                  setLocked(true) // 拖拽排序期间禁止弹出菜单
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOverIndex(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex != null) move(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragEnd={() => {
                  setLocked(false)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                className={[
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                  dragging
                    ? 'border-accent/50 bg-neutral-800/80 opacity-60'
                    : overIndex === index && dragIndex != null && dragIndex !== index
                      ? 'border-accent/40 bg-neutral-900'
                      : 'border-neutral-800 bg-neutral-950/40',
                  visible ? '' : 'opacity-60',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  title="拖拽排序"
                  className="cursor-grab text-sm leading-none text-neutral-600"
                >
                  ⠿
                </span>
                <span className="w-4 shrink-0 text-center text-xs leading-none text-neutral-500">
                  {action.icon}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm leading-5 text-neutral-100">
                    {label}
                  </span>
                  {hint && (
                    <span
                      title={hint}
                      aria-label={hint}
                      className="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-neutral-600 text-[9px] font-medium leading-none text-neutral-400"
                    >
                      i
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`${label} 上移`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="px-1 text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${label} 下移`}
                    disabled={index === group.order.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="px-1 text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <Switch
                  label={`在菜单中显示「${label}」`}
                  checked={visible}
                  onChange={() => toggleContextAction(kind, id)}
                />
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-xs leading-5 text-neutral-500">
          菜单末尾固定「自定义此菜单…」入口；隐藏全部条目时不会出现空菜单。
        </p>
      </div>
    </SettingSection>
  )
}
