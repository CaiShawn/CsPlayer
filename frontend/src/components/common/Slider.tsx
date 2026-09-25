import { useEffect, useRef, useState } from 'react'

/* ---------------------------------------------------------------------------
 * 自绘滑条（S1-3）：进度条 / 音量 / 设置滑杆共用视觉 token
 *   - 滑轨 h-1、滑块 hover 放大、accent 配色（与 ProgressBar 同款）；
 *   - 命中区 h-4（视觉不变、好点好拖），pointer 拖拽 + 键盘 ←/→/↑/↓；
 *   - 可选百分比/数值气泡（拖动 / 悬停显示）；可选滚轮微调（原生 passive:false）。
 * ------------------------------------------------------------------------ */

interface SliderProps {
  /** 归一化值 0..1 */
  value: number
  onChange: (v: number) => void
  /** 键盘 / 滚轮步进（归一化量，默认 0.05） */
  step?: number
  label: string
  /** 气泡内容（不传则不显示气泡） */
  format?: (v: number) => string
  /** 启用滚轮微调（仅音量等可误触安全的场景开启） */
  wheel?: boolean
  /** 键盘 ←/→/↑/↓ 微调（默认开）：聚焦时滑条自管；全局方向键由 useHotkeys 统一处理 */
  keyboard?: boolean
  disabled?: boolean
  className?: string
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function Slider({
  value,
  onChange,
  step = 0.05,
  label,
  format,
  wheel = false,
  keyboard = true,
  disabled = false,
  className = '',
}: SliderProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const showTip = !!format && (hover || dragging) && !disabled

  const ratioFromClientX = (clientX: number): number => {
    const el = wrapRef.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return value
    return clamp01((clientX - rect.left) / rect.width)
  }

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return
    onChange(clamp01(value + dir * step))
  }

  // 滚轮微调：React onWheel 为 passive，无法 preventDefault，需原生监听
  const wheelRef = useRef<(deltaY: number) => void>(() => {})
  useEffect(() => {
    wheelRef.current = (deltaY) => {
      if (disabled) return
      stepBy(deltaY > 0 ? -1 : 1)
    }
  })

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !wheel) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault() // 防页面滚动（设计 §4.2.4）
      wheelRef.current(e.deltaY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheel])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!keyboard || disabled) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      stepBy(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      stepBy(-1)
    }
  }

  const pct = Math.round(clamp01(value) * 100)

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={disabled || !keyboard ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        onChange(ratioFromClientX(e.clientX))
      }}
      onPointerMove={(e) => {
        if (!dragging || disabled) return
        onChange(ratioFromClientX(e.clientX))
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        setDragging(false)
      }}
      onPointerCancel={() => setDragging(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative flex h-4 cursor-pointer touch-none select-none items-center outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
        disabled ? 'cursor-default opacity-40' : ''
      } ${className}`}
    >
      <div className="relative h-1 w-full rounded-full bg-neutral-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-transform ${
            hover || dragging ? 'scale-125' : ''
          }`}
          style={{ left: `${pct}%` }}
        />
      </div>
      {showTip && format && (
        <div
          className="pointer-events-none absolute bottom-full z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-100 shadow"
          style={{ left: `${pct}%` }}
        >
          {format(value)}
        </div>
      )}
    </div>
  )
}
