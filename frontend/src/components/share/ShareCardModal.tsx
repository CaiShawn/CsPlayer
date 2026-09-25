import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { ACCENT_PRESETS, normalizeHex } from '../../utils/color'
import { loadCoverImage } from '../../utils/coverImage'
import {
  buildShareCardSpec,
  exportShareCardPng,
  renderShareCard,
  sanitizeFilename,
  SHARE_CARD_RATIOS,
  SHARE_CARD_SIZES,
  type ShareCardRatio,
  type ShareCardSpec,
} from '../../utils/shareCard'
import { Loading } from '../common/Ui'

/* ---------------------------------------------------------------------------
 * 分享卡片弹窗（v0.1.8 S1，设计 §1.5）：
 *   预览（与导出同一渲染函数）+ 比例切换 + 下载 PNG。
 *   挂载于 MainLayout，自取 uiStore.shareSource，null 时不出现在 DOM。
 * ------------------------------------------------------------------------ */

const PREVIEW_W = 320 // 预览显示宽度（css px）

const RATIO_LABEL: Record<ShareCardRatio, string> = {
  '1:1': '1:1',
  '3:4': '3:4',
  '9:16': '9:16',
  '4:3': '4:3',
  '16:9': '16:9',
}

const COMMENT_MAX = 48 // 个人评论限长（设计 §1.10）

/** 当前主题 accent 的 hex（预设名 → 预设色；自定义 → 规范化 hex） */
function currentAccentHex(): string {
  const a = useSettingsStore.getState().prefs.appearance
  if (a.accentPreset === 'custom') return normalizeHex(a.customColor) ?? '#10b981'
  return ACCENT_PRESETS.find((p) => p.name === a.accentPreset)?.hex ?? '#10b981'
}

export function ShareCardModal() {
  const source = useUiStore((s) => s.shareSource)
  const close = useUiStore((s) => s.closeShareCard)

  const [ratio, setRatio] = useState<ShareCardRatio>('3:4')
  const [comment, setComment] = useState('') // 个人评论（可选，实时预览）
  const [cover, setCover] = useState<HTMLImageElement | null>(null)
  const [coverDone, setCoverDone] = useState(false) // 封面加载已完结（成功或失败）
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const accentHex = useMemo(currentAccentHex, [source]) // 打开瞬间取色；弹窗内主题不会变

  // spec：三类型全部来自 target 自身字段，同步构建；叠加评论（空 = undefined，不占位）
  const finalSpec = useMemo<ShareCardSpec | null>(() => {
    if (!source) return null
    return { ...buildShareCardSpec(source, accentHex), comment: comment.trim() || undefined }
  }, [source, accentHex, comment])

  // 切换对象时重置评论输入
  useEffect(() => {
    setComment('')
  }, [source])

  // 封面像素（失败 → null，渲染层出占位）
  useEffect(() => {
    const url = finalSpec?.coverUrl
    if (!url) {
      setCover(null)
      setCoverDone(true)
      return
    }
    let cancelled = false
    setCoverDone(false)
    void loadCoverImage(url).then((img) => {
      if (cancelled) return
      setCover(img)
      setCoverDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [finalSpec?.coverUrl])

  // 预览绘制（dpr 适配防锯齿，缩放基准为版式宽；spec/封面/比例任一变化即重绘）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !finalSpec) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const base = SHARE_CARD_SIZES[ratio]
    const scale = (PREVIEW_W * dpr) / base.w
    renderShareCard(canvas, finalSpec, ratio, cover, scale)
    canvas.style.width = `${PREVIEW_W}px`
    canvas.style.height = `${Math.round((PREVIEW_W * base.h) / base.w)}px`
  }, [finalSpec, cover, ratio])

  // Esc 关闭
  useEffect(() => {
    if (!source) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [source, close])

  if (!source) return null

  const onDownload = async () => {
    if (!finalSpec || busy) return
    setBusy(true)
    try {
      const blob = await exportShareCardPng(finalSpec, ratio, cover)
      if (!blob) {
        useUiStore.getState().setToast('导出失败，请重试')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CsPlayer - ${sanitizeFilename(finalSpec.title)}.png`
      a.click()
      URL.revokeObjectURL(url)
      useUiStore.getState().setToast('已导出分享卡片')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={close}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">分享卡片</h2>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">生成图片卡片（不含链接与二维码），保存后自行分享</p>

        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center overflow-y-auto rounded-xl bg-neutral-950/60 py-4">
          {!finalSpec || !coverDone ? (
            <Loading text="" />
          ) : (
            <canvas ref={canvasRef} className="rounded-lg shadow-lg" aria-label="分享卡片预览" />
          )}
        </div>

        {/* 个人评论（可选）：实时预览，留空不占位 */}
        <div className="relative mt-3">
          <input
            type="text"
            value={comment}
            maxLength={COMMENT_MAX}
            onChange={(e) => setComment(e.target.value)}
            placeholder="写点想说的，留在卡片上（可选）"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 pr-12 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent/50 focus:outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-neutral-600">
            {comment.length}/{COMMENT_MAX}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-neutral-800 bg-neutral-950/60 p-1">
            {SHARE_CARD_RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatio(r)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  ratio === r
                    ? 'bg-accent font-medium text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-100'
                }`}
              >
                {RATIO_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!finalSpec || !coverDone || busy}
            onClick={() => void onDownload()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? '导出中…' : '下载到本地'}
          </button>
        </div>
      </div>
    </div>
  )
}

