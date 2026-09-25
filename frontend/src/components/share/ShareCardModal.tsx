import { useEffect, useMemo, useRef, useState } from 'react'
import { libraryApi } from '../../api'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { ACCENT_PRESETS, normalizeHex } from '../../utils/color'
import { loadCoverImage } from '../../utils/coverImage'
import {
  albumSpecFromDetail,
  buildCollageSpec,
  buildShareCardSpec,
  exportShareCardBlob,
  renderCollageCard,
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
 *   预览（与导出同一渲染函数）+ 比例切换 + 下载到本地。
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
  const [spec, setSpec] = useState<ShareCardSpec | null>(null)
  const [comment, setComment] = useState('') // 个人评论（可选，实时预览）
  const [accent, setAccent] = useState('#10b981') // 主题色（弹窗内可切换，切换对象时重置回主题）
  const [bgMode, setBgMode] = useState<'gradient' | 'solid'>('gradient') // 背景样式
  const [cover, setCover] = useState<HTMLImageElement | null>(null)
  const [covers, setCovers] = useState<(HTMLImageElement | null)[]>([]) // 拼贴卡多封面（与 collageCovers 对齐）
  const [coverDone, setCoverDone] = useState(false) // 封面加载已完结（成功或失败）
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 可选色板：当前主题色（含自定义）+ 7 预设，去重
  const swatches = useMemo(() => {
    const theme = currentAccentHex()
    const list = ACCENT_PRESETS.map((p) => p.hex)
    return list.includes(theme) ? list : [theme, ...list]
  }, [])

  // 最终 spec：叠加评论 / 弹窗内选的主题色 / 背景样式
  const finalSpec = useMemo(
    () =>
      spec
        ? { ...spec, comment: comment.trim() || undefined, accentHex: accent, bgStyle: bgMode }
        : null,
    [spec, comment, accent, bgMode],
  )

  // 入参 → spec（专辑 Brief 缺曲目数时补拉一次详情，服务端缓存 300s）
  useEffect(() => {
    if (!source) return
    setSpec(null)
    setComment('')
    setAccent(currentAccentHex()) // 重置回当前主题色
    setCover(null)
    setCoverDone(false)
    setFailed(false)
    let cancelled = false
    ;(async () => {
      try {
        // 拼贴卡（S2）：同步构建，无接口调用
        if (source.kind === 'collage') {
          if (!cancelled) setSpec(buildCollageSpec(source.albums, currentAccentHex()))
          return
        }
        // 基础 accent 用当前主题色即可，弹窗内选色由 finalSpec 覆盖（避免换色触发重拉）
        let s = buildShareCardSpec(source, currentAccentHex())
        if (!s && source.kind === 'album') {
          const detail = await libraryApi.albumDetail(source.album.id)
          s = albumSpecFromDetail(detail, currentAccentHex())
        }
        if (!cancelled) setSpec(s)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  // 封面像素（失败 → null，渲染层出占位）；拼贴卡走多封面分支
  useEffect(() => {
    if (spec?.collageCovers) return
    const url = spec?.coverUrl
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
  }, [spec?.coverUrl, spec?.collageCovers])

  // 拼贴卡多封面并行预载（loadCoverImage 模块级缓存；失败项 null → 占位）
  useEffect(() => {
    const urls = spec?.collageCovers
    if (!urls) return
    let cancelled = false
    setCoverDone(false)
    void Promise.all(urls.map((u) => loadCoverImage(u))).then((imgs) => {
      if (cancelled) return
      setCovers(imgs)
      setCoverDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [spec?.collageCovers])

  // 预览绘制（dpr 适配防锯齿，缩放基准为版式宽；spec/封面/比例任一变化即重绘）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !finalSpec) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const base = SHARE_CARD_SIZES[ratio]
    const scale = (PREVIEW_W * dpr) / base.w
    if (finalSpec.kind === 'collage') renderCollageCard(canvas, finalSpec, ratio, covers, scale)
    else renderShareCard(canvas, finalSpec, ratio, cover, scale)
    canvas.style.width = `${PREVIEW_W}px`
    canvas.style.height = `${Math.round((PREVIEW_W * base.h) / base.w)}px`
  }, [finalSpec, cover, covers, ratio])

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
      const blob = await exportShareCardBlob(finalSpec, ratio, cover, covers)
      if (!blob) {
        useUiStore.getState().setToast('导出失败，请重试')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const { w, h } = SHARE_CARD_SIZES[ratio]
      a.download = `CsPlayer - ${sanitizeFilename(finalSpec.title)} ${w}x${h}.jpg`
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

        {/* 注意不能用 items-center：画布高于容器（竖版比例）时居中会把顶部溢出切掉且滚不到（徽标被切）。
            子项 m-auto：有空间时居中，溢出时自动顶对齐、可正常滚动 */}
        <div className="mt-4 flex min-h-0 flex-1 justify-center overflow-y-auto rounded-xl bg-neutral-950/60 py-4">
          {failed ? (
            <div className="m-auto px-6 text-center text-sm text-neutral-400">卡片数据准备失败，请关闭后重试</div>
          ) : !finalSpec || !coverDone ? (
            <div className="m-auto">
              <Loading text="" />
            </div>
          ) : (
            <canvas ref={canvasRef} className="m-auto rounded-lg shadow-lg" aria-label="分享卡片预览" />
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

        {/* 背景样式 + 主题色（弹窗内临时切换，不影响应用设置） */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-neutral-800 bg-neutral-950/60 p-1">
            {(['gradient', 'solid'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setBgMode(m)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  bgMode === m
                    ? 'bg-accent font-medium text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-100'
                }`}
              >
                {m === 'gradient' ? '渐变' : '纯色'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {swatches.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setAccent(hex)}
                className={`h-[18px] w-[18px] rounded-full border transition-transform ${
                  accent === hex
                    ? 'scale-110 border-white/70'
                    : 'border-white/10 hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`主题色 ${hex}`}
                title={hex}
              />
            ))}
          </div>
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

