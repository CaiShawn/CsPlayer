import { useEffect } from 'react'
import { isEditableTarget, useContextMenuStore } from '../stores/contextMenuStore'
import { usePlayerStore } from '../stores/playerStore'
import { useUiStore } from '../stores/uiStore'

/** 快退快进步长（秒）；音量步长（归一化 0..1，与 Slider 默认 step 一致） */
const SEEK_STEP = 5
const VOLUME_STEP = 0.05

/** 全局快捷键（快捷键扩展，原分散于 TopBar 的搜索快捷键也移入统一管理）：
 *  / 或 Ctrl/Cmd+K = 聚焦搜索框，空格 = 播放/暂停，←/→ = 快退/快进，↑/↓ = 音量调节。
 *
 *  守卫（避免误伤既有交互）：
 *  - 输入类元素内不劫持（input/textarea/select/contenteditable，复用 isEditableTarget）；
 *  - 右键菜单打开时播放/音量不响应（方向键/Enter 归菜单，Esc 归关闭）；搜索快捷键
 *    不受限，沿用原行为：先关菜单再聚焦（TopBar 的聚焦动作经 uiStore.searchFocus 注册）；
 *  - 组合键（Ctrl/Alt/Meta/Shift）不劫持，保留浏览器快捷键与 Shift+Space 翻页、
 *    Shift+方向键 选择（仅搜索的 Ctrl/Cmd+K 是例外）；
 *  - 聚焦在滑条（[role="slider"]，进度条/设置滑杆）上时方向键让位给滑条自身步进，
 *    避免双步进；空格不受限（滑条无空格行为）；
 *  - 空格长按 repeat 只 preventDefault（阻止页面滚动）不重复切换；方向键允许
 *    repeat（按住连续快进/调音量）。
 *  其余场景一律 preventDefault：空格/方向键不再滚动页面，聚焦按钮仍可靠 Enter 激活。
 *  后续新增快捷键在此扩展。 */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      // / 或 Ctrl/Cmd+K：聚焦搜索框（原 TopBar 全局快捷键，行为原样平移）
      const key = e.key.toLowerCase()
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && key === 'k')) {
        e.preventDefault()
        useContextMenuStore.getState().close()
        useUiStore.getState().searchFocus?.()
        return
      }

      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (useContextMenuStore.getState().open) return

      const s = usePlayerStore.getState()

      if (e.code === 'Space') {
        e.preventDefault()
        if (e.repeat) return
        s.togglePlay()
        return
      }

      const isSlider = !!(e.target instanceof HTMLElement && e.target.closest('[role="slider"]'))

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (isSlider || s.duration <= 0) return
        e.preventDefault()
        const dir = e.key === 'ArrowRight' ? 1 : -1
        s.seek(Math.max(0, Math.min(s.duration, s.currentTime + dir * SEEK_STEP)))
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (isSlider) return
        e.preventDefault()
        const dir = e.key === 'ArrowUp' ? 1 : -1
        s.setVolume(s.volume + dir * VOLUME_STEP)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
