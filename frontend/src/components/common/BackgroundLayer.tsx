import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'

/* ---------------------------------------------------------------------------
 * 背景图层（S4-1，设计 §4.5）：fixed 置于内容层之下，仅动 transform/filter/opacity
 *   - 平移缩放走 transform（不重排）；模糊走 filter；
 *   - 元素外扩 60px，blur 软边落在视口外；
 *   - 「背景启用」时给 <html> 打 data-bg-enabled，切半透明表面 token（S4-3）；
 *   - 默认关闭（enabled=false 或无图）：渲染空，界面与 v0.1.5 一致（零回归）。
 * ------------------------------------------------------------------------ */

export function BackgroundLayer() {
  const bg = useSettingsStore((s) => s.background)
  const active = bg.enabled && !!bg.image

  useEffect(() => {
    const root = document.documentElement
    if (active) {
      root.dataset.bgEnabled = 'on'
      // 表面与不透明度联动（验收微调）：40%（默认）→ 常规表面；100% → 黑底最淡、背景最“跳”；
      // 0–40% 区间保持常规（图片存在感本就弱）。
      const t = Math.max(0, (bg.opacity - 40) / 60)
      const mix = (a: number, b: number) => (a + (b - a) * t).toFixed(3)
      root.style.setProperty('--surface-base', `rgb(10 10 10 / ${mix(0.45, 0.3)})`)
      root.style.setProperty('--surface-bar', `rgb(10 10 10 / ${mix(0.5, 0.35)})`)
      // --surface-panel（播放队列）始终不透明，不随背景图变透（2026-09 验收反馈）
    } else {
      delete root.dataset.bgEnabled
      // 去掉内联覆盖，回落 CSS 默认实色（与 v0.1.5 一致）
      root.style.removeProperty('--surface-base')
      root.style.removeProperty('--surface-bar')
    }
  }, [active, bg.opacity])

  if (!active) return null

  // 缩放恒等于滑杆值（不随模糊跳变）；blur 软边由元素外扩 60px 兜住（max blur 40px）
  const scale = bg.scale / 100

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <img
        src={bg.image}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: '-60px',
          objectFit: 'cover',
          transform: `translate(${bg.x}px, ${bg.y}px) scale(${scale})`,
          filter: bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
          opacity: bg.opacity / 100,
          willChange: 'transform',
        }}
      />
    </div>
  )
}
