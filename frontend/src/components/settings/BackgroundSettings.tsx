import { useRef, useState } from 'react'
import { Slider } from '../common/Slider'
import { useUiStore } from '../../stores/uiStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { SettingRow, SettingSection, Switch } from './controls'

/* ---------------------------------------------------------------------------
 * 自定义背景设置（S4-2，设计 §4.5）
 *   - 选图 → canvas 压缩 → dataURL 存 csplayer:prefs:background（不进主信封）；
 *   - 压缩阶梯来自 S0-2 存储实验：截图类 q0.8/1920 即达标（~100KB），
 *     高频照片类需降档（q0.7/q0.6/1600/1280）才能压进 ≤300KB 目标；
 *   - 图片仅存本机浏览器，不上传后端；预览框拖拽移动 + 双击复位。
 * ------------------------------------------------------------------------ */

/** dataURL 长度目标（≈存储体积）；超限逐档降级，全部超限才提示换图 */
const MAX_DATAURL = 300 * 1024
/** [最长边, JPEG 画质] 降级阶梯（S0-2） */
const LADDER: Array<[number, number]> = [
  [1920, 0.8],
  [1920, 0.7],
  [1920, 0.6],
  [1600, 0.5],
  [1280, 0.5],
]

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('read-error'))
    }
    img.src = url
  })
}

/** 压缩到 ≤MAX_DATAURL 的 JPEG dataURL；null = 全部降档后仍超限 */
async function compressToDataUrl(file: File): Promise<string | null> {
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  for (const [maxEdge, quality] of LADDER) {
    const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s))
    // 底色打底：透明 PNG 边缘不落黑（JPEG 无 alpha）
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_DATAURL) return dataUrl
  }
  return null
}

/** 数值滑杆行：归一化滑条 + 当前值显示（不透明度 / 模糊 / 缩放） */
function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <div className="flex w-64 items-center gap-3">
        <Slider
          className="flex-1"
          value={(value - min) / (max - min)}
          label={label}
          format={() => display}
          onChange={(v) => onChange(Math.round(min + v * (max - min)))}
        />
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-400">
          {display}
        </span>
      </div>
    </SettingRow>
  )
}

export function BackgroundSettings() {
  const bg = useSettingsStore((s) => s.background)
  const updateBackground = useSettingsStore((s) => s.updateBackground)
  const setBackgroundImage = useSettingsStore((s) => s.setBackgroundImage)
  const removeBackgroundImage = useSettingsStore((s) => s.removeBackgroundImage)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const toast = (msg: string) => useUiStore.getState().setToast(msg)

  const onPick = async (file: File | undefined) => {
    if (!file || busy) return
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件')
      return
    }
    setBusy(true)
    try {
      const dataUrl = await compressToDataUrl(file)
      if (!dataUrl) {
        toast('图片过大，请换小图（即使压缩后仍超出 300KB）')
        return
      }
      if (!setBackgroundImage(dataUrl)) {
        toast('存储空间不足，背景未能保存（本次预览仍生效）')
      }
      // 选图即生效（设计 §6 时序）
      updateBackground({ enabled: true })
    } catch {
      toast('图片读取失败，请换一张图')
    } finally {
      setBusy(false)
    }
  }

  /* 预览框拖拽移动（pointer capture）+ 双击复位（设计 §4.5） */
  const dragRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null)

  const onPreviewPointerDown = (e: React.PointerEvent) => {
    if (!bg.image) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, bx: bg.x, by: bg.y }
  }
  const onPreviewPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    updateBackground({ x: Math.round(d.bx + e.clientX - d.x), y: Math.round(d.by + e.clientY - d.y) })
  }
  const onPreviewPointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }

  const scale = bg.scale / 100 // 与背景图层一致：不随模糊跳变

  return (
    <SettingSection
      id="background"
      title="背景"
      desc="自定义背景图片：不透明度 / 模糊 / 缩放 / 移动，立即生效并持久化"
    >
      <SettingRow
        label="背景启用"
        hint="开启后界面表面变半透明以透出背景图；关闭立即回到实色界面"
      >
        <Switch
          label="背景启用"
          checked={bg.enabled}
          onChange={(enabled) => updateBackground({ enabled })}
        />
      </SettingRow>

      <SettingRow
        label="背景图片"
        hint="图片仅保存在本机浏览器（localStorage），不上传后端；保存前自动压缩（最长边 ≤1920、JPEG ≤300KB）"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPick(e.target.files?.[0])
            e.target.value = '' // 允许重选同一文件
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft disabled:opacity-40"
          >
            {busy ? '压缩中…' : bg.image ? '更换图片' : '选择图片'}
          </button>
          {bg.image && (
            <button
              type="button"
              onClick={removeBackgroundImage}
              className="rounded-full border border-red-500/40 bg-neutral-900 px-4 py-1.5 text-xs text-red-400 hover:border-red-400 hover:bg-red-500/10"
            >
              移除
            </button>
          )}
        </div>
      </SettingRow>

      {/* 位置与缩放（同一控制组） */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4">
        <div className="text-sm text-neutral-100">位置与缩放</div>
        <div className="mt-0.5 text-xs leading-4 text-neutral-500">
          在预览框内拖拽移动背景，双击复位（x {Math.round(bg.x)} / y {Math.round(bg.y)}）
        </div>
        <div
          ref={previewRef}
          onPointerDown={onPreviewPointerDown}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onPointerCancel={onPreviewPointerUp}
          onDoubleClick={() => updateBackground({ x: 0, y: 0 })}
          className={`relative mt-3 aspect-video w-full touch-none select-none overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 ${
            bg.image ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          {bg.image ? (
            <img
              src={bg.image}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                inset: -30,
                objectFit: 'cover',
                transform: `translate(${bg.x}px, ${bg.y}px) scale(${scale})`, // 1:1 跟随光标；模糊减半为视觉近似（预览尺寸远小于全屏）
                filter: bg.blur > 0 ? `blur(${bg.blur / 2}px)` : undefined,
                opacity: bg.opacity / 100,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-600">
              未选择图片 · 拖拽可移动背景位置
            </div>
          )}
        </div>
        {/* 缩放：与位置同组（预览即时反馈） */}
        <div className="mt-4 flex items-center gap-3">
          <span className="w-8 shrink-0 text-xs text-neutral-400">缩放</span>
          <Slider
            className="flex-1"
            value={(bg.scale - 100) / 200}
            label="缩放"
            format={() => `${Math.round(bg.scale)}%`}
            onChange={(v) => updateBackground({ scale: Math.round(100 + v * 200) })}
          />
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-400">
            {Math.round(bg.scale)}%
          </span>
        </div>
      </div>

      <SliderRow
        label="不透明度"
        hint="背景图可见强度（0–100%）；越高时界面黑底越淡、背景越突出（40% 为默认表面）"
        value={bg.opacity}
        min={0}
        max={100}
        display={`${Math.round(bg.opacity)}%`}
        onChange={(opacity) => updateBackground({ opacity })}
      />
      <SliderRow
        label="模糊"
        hint="背景模糊半径（0–40px）；大模糊时建议配合低不透明度"
        value={bg.blur}
        min={0}
        max={40}
        display={`${Math.round(bg.blur)}px`}
        onChange={(blur) => updateBackground({ blur })}
      />
    </SettingSection>
  )
}
